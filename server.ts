import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
// @ts-ignore
import mammoth from "mammoth";
// @ts-ignore
import { PDFParse } from "pdf-parse";
import { db, vectorDb, getEmbedding, initializeDatabase } from "./src/db_manager.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Google Gemini API Client
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Initialize database
initializeDatabase().catch(err => {
  console.error("Gagal menginisialisasi database:", err);
});

// Periodic system status update (uptime)
setInterval(() => {
  db.systemStatus.updateUptime(60).catch(err => {
    console.error("Gagal memperbarui waktu aktif sistem:", err);
  });
}, 60000);

app.use(express.json({ limit: "10mb" }));

// API Endpoint for Live Search Chatbot with Vector Memory and Relational SQL History
app.post("/api/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      messages, 
      provider = "openrouter", 
      model = "openrouter/free", 
      session_id = "session_default",
      user_id = "user_default",
      enable_vector = true 
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Format pesan tidak valid. Harus menyertakan array 'messages'." });
      return;
    }

    const latestMessageObj = messages[messages.length - 1];
    const latestQuery = latestMessageObj.content;

    // A. Operational DB: Save user message
    try {
      await db.conversations.add(session_id, "user", latestQuery, []);
    } catch (dbErr) {
      console.error("Gagal menyimpan pesan user ke database operasional:", dbErr);
    }

    // B. Vector DB Retrieval (Memory Recall)
    let memoryPromptContext = "";
    if (enable_vector && geminiApiKey) {
      try {
        const queryEmbedding = await getEmbedding(ai, latestQuery);
        const relevantMemories = await vectorDb.query(queryEmbedding, 3);
        
        const goodMemories = relevantMemories.filter(m => m.similarity >= 0.35);
        if (goodMemories.length > 0) {
          memoryPromptContext = "\n\n[MEMORI JANGKA PANJANG (Hasil Pencarian Vektor Kontekstual)]:\n" +
            goodMemories.map((m, index) => `${index + 1}. [Kemiripan ${(m.similarity * 100).toFixed(1)}%]: "${m.record.text}" (Konteks: ${m.record.metadata})`).join("\n") +
            "\n(Gunakan informasi memori jangka panjang di atas jika relevan dengan pertanyaan saat ini untuk memberikan kesinambungan percakapan.)";
          console.log(`Memori Jangka Panjang Terpanggil (${goodMemories.length} memori relevan ditemukan)`);
        }
      } catch (vecErr) {
        console.error("Gagal memanggil memori jangka panjang dari database vektor:", vecErr);
      }
    }

    if (provider === "openrouter") {
      const openRouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterApiKey) {
        res.status(400).json({ 
          error: "OPENROUTER_API_KEY tidak ditemukan di environment. Silakan tambahkan Kunci API OpenRouter Anda pada menu Settings > Secrets di Google AI Studio." 
        });
        return;
      }

      // Convert format for OpenRouter
      const formattedMessages = messages.map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));

      const systemMessage = {
        role: "system",
        content: `Anda adalah Asisten Pencarian & Pengetahuan Online yang cerdas, akurat, dan ringkas. 
Tugas Anda adalah membantu pengguna mencari informasi, referensi, dan menjawab pertanyaan dengan fakta terkini.
Selalu berikan jawaban dalam Bahasa Indonesia yang sopan, profesional, dan mudah dipahami.
Sertakan penjelasan yang logis dan ringkas. Jangan membuat-buat informasi (halusinasi).${memoryPromptContext}`
      };

      const finalMessages = [systemMessage, ...formattedMessages];

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "InfoRingkas AI"
        },
        body: JSON.stringify({
          model: model || "openrouter/free",
          messages: finalMessages,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Gagal menghubungi OpenRouter API.");
      }

      const replyText = data.choices?.[0]?.message?.content || "";

      // Extract markdown/HTTP links in text as sources
      const linkRegex = /https?:\/\/[^\s)\]]+/g;
      const foundLinks = replyText.match(linkRegex) || [];
      const sources = foundLinks.map((url: string, index: number) => ({
        title: `Sumber Temuan [${index + 1}]`,
        url: url.replace(/[.,;:!?]$/, ""), // clean punctuation
      }));
      const uniqueSources = Array.from(new Map(sources.map((s: any) => [s.url, s])).values()).slice(0, 5);

      // Save assistant reply to Operational DB
      try {
        const actualModel = data.model || model || "openrouter/free";
        await db.conversations.add(session_id, "assistant", replyText, {
          sources: uniqueSources,
          model: actualModel
        } as any);
      } catch (dbErr) {
        console.error("Gagal menyimpan balasan asisten ke database operasional:", dbErr);
      }

      // Save to Vector DB (Asynchronously in background to keep response fast)
      if (enable_vector && geminiApiKey) {
        (async () => {
          try {
            // Save User query to vector store
            const userEmbed = await getEmbedding(ai, latestQuery);
            await vectorDb.upsert(latestQuery, userEmbed, { 
              sender: "user", 
              session_id, 
              timestamp: new Date().toISOString() 
            });

            // Save Assistant reply to vector store
            const assistantEmbed = await getEmbedding(ai, replyText);
            await vectorDb.upsert(replyText, assistantEmbed, { 
              sender: "assistant", 
              session_id, 
              timestamp: new Date().toISOString() 
            });
          } catch (vecSaveErr) {
            console.error("Gagal menyimpan memori baru ke database vektor di background:", vecSaveErr);
          }
        })();
      }

      res.json({
        reply: replyText,
        sources: uniqueSources,
        model: data.model || model || "openrouter/free"
      });
      return;
    }

    if (!geminiApiKey) {
      res.status(500).json({ 
        error: "GEMINI_API_KEY tidak ditemukan di environment. Silakan tambahkan kunci API Anda di Settings > Secrets." 
      });
      return;
    }

    // Convert messages history to Gemini parts format
    // Roles in @google/genai should be 'user' or 'model'
    const formattedContents = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Generate content using gemini-3.5-flash with Google Search tool enabled
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: `Anda adalah Asisten Pencarian & Pengetahuan Online yang cerdas, akurat, dan ringkas. 
Tugas Anda adalah membantu pengguna mencari informasi, referensi, dan menjawab pertanyaan dengan fakta terkini.
Gunakan alat pencarian Google (Google Search Grounding) yang disediakan untuk memastikan informasi Anda mutakhir dan akurat.
Selalu berikan jawaban dalam Bahasa Indonesia yang sopan, profesional, dan mudah dipahami.
Sertakan penjelasan yang logis dan ringkas. Jangan membuat-buat informasi (halusinasi).${memoryPromptContext}`,
        tools: [{ googleSearch: {} }],
      },
    });

    const replyText = response.text || "";

    // Extract search grounding metadata sources
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .map((chunk: any) => {
        if (chunk.web) {
          return {
            title: chunk.web.title || "Referensi Web",
            url: chunk.web.uri,
          };
        }
        return null;
      })
      .filter((source: any) => source !== null);

    // Deduplicate sources by URL
    const uniqueSources = Array.from(new Map(sources.map((s: any) => [s.url, s])).values());

    // Save assistant reply to Operational DB
    try {
      await db.conversations.add(session_id, "assistant", replyText, {
        sources: uniqueSources,
        model: "gemini-3.5-flash"
      } as any);
    } catch (dbErr) {
      console.error("Gagal menyimpan balasan asisten ke database operasional:", dbErr);
    }

    // Save to Vector DB (Asynchronously in background)
    if (enable_vector && geminiApiKey) {
      (async () => {
        try {
          const userEmbed = await getEmbedding(ai, latestQuery);
          await vectorDb.upsert(latestQuery, userEmbed, { 
            sender: "user", 
            session_id, 
            timestamp: new Date().toISOString() 
          });

          const assistantEmbed = await getEmbedding(ai, replyText);
          await vectorDb.upsert(replyText, assistantEmbed, { 
            sender: "assistant", 
            session_id, 
            timestamp: new Date().toISOString() 
          });
        } catch (vecSaveErr) {
          console.error("Gagal menyimpan memori baru ke database vektor di background:", vecSaveErr);
        }
      })();
    }

    res.json({
      reply: replyText,
      sources: uniqueSources,
      model: "gemini-3.5-flash",
    });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    let errorMessage = error.message || "Terjadi kesalahan pada server saat memproses obrolan.";
    
    // Check for 429/RESOURCE_EXHAUSTED/Quota exceeded errors
    const isQuotaError = 
      error.status === 429 || 
      error.status === "RESOURCE_EXHAUSTED" || 
      String(error.status) === "429" ||
      errorMessage.toLowerCase().includes("quota") || 
      errorMessage.toLowerCase().includes("exhausted") ||
      errorMessage.toLowerCase().includes("429");

    if (isQuotaError) {
      errorMessage = "⚠️ **Batas Kuota API Terlampaui (Error 429: RESOURCE_EXHAUSTED)**. Akun Anda atau kunci API gratis saat ini telah melebihi batas penggunaan (quota limit). Silakan tunggu beberapa menit sebelum mencoba lagi, atau tambahkan/perbarui Kunci API Anda di menu **Settings > Secrets** di Google AI Studio.";
    }

    res.status(isQuotaError ? 429 : 500).json({ 
      error: errorMessage 
    });
  }
});

// Helper function to strip HTML tags and extract readable text
function cleanHtml(html: string): string {
  // Simple regex to extract content from body if present
  let bodyContent = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // Remove scripts and style tags
  bodyContent = bodyContent.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "");
  bodyContent = bodyContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
  
  // Replace HTML tags with spaces
  let text = bodyContent.replace(/<[^>]+>/g, " ");
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse multiple spaces/newlines
  return text.replace(/\s+/g, " ").trim();
}

// API Endpoint for Automatic Summarization
app.post("/api/summarize", async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, url, format = "bullet", length = "medium", provider = "openrouter", model = "openrouter/free" } = req.body;

    if (!text && !url) {
      res.status(400).json({ error: "Mohon sediakan teks atau URL untuk diringkas." });
      return;
    }

    let contentToSummarize = "";
    let isUrl = false;
    let fetchedTitle = "";

    if (url) {
      isUrl = true;
      try {
        // Fetch content from URL
        const fetchResponse = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        
        if (!fetchResponse.ok) {
          throw new Error(`Gagal mengambil konten dari URL. Status: ${fetchResponse.status}`);
        }
        
        const html = await fetchResponse.text();
        
        // Extract title
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          fetchedTitle = titleMatch[1].trim();
        }

        contentToSummarize = cleanHtml(html);
        
        if (contentToSummarize.length < 50) {
          throw new Error("Konten teks yang berhasil diambil terlalu sedikit atau kosong.");
        }
      } catch (err: any) {
        res.status(422).json({ 
          error: `Gagal membaca URL: ${err.message || "Pastikan URL dapat diakses publik dan memiliki konten teks."}` 
        });
        return;
      }
    } else {
      contentToSummarize = text;
    }

    // Determine summary format and length instruction
    let formatInstruction = "";
    if (format === "bullet") {
      formatInstruction = "dalam bentuk daftar poin-poin penting (bullet points) yang terstruktur rapi";
    } else if (format === "paragraph") {
      formatInstruction = "dalam beberapa paragraf yang mengalir secara alami dan padat";
    } else {
      formatInstruction = "sebagai ringkasan eksekutif satu paragraf yang sangat singkat dan padat";
    }

    let lengthInstruction = "";
    if (length === "short") {
      lengthInstruction = "Sangat singkat dan langsung ke inti utama (maksimal 100-150 kata).";
    } else if (length === "medium") {
      lengthInstruction = "Ringkas dan mencakup semua argumen penting (sekitar 200-300 kata).";
    } else {
      lengthInstruction = "Mendetail dan menyeluruh, mencakup data pendukung atau poin argumen sekunder secara komprehensif.";
    }

    const prompt = `Tolong ringkas dokumen/teks berikut ${formatInstruction}.
Aturan ringkasan:
1. Ringkasan harus dalam Bahasa Indonesia yang baku, profesional, dan mudah dipahami.
2. Panjang ringkasan: ${lengthInstruction}
3. Tetap pertahankan fakta-fakta penting, angka, nama tokoh, atau data krusial yang ada di teks asli. Jangan menambahkan opini atau info luar yang tidak ada di teks sumber.
4. Jika ini dari halaman web, berikan ringkasan berdasarkan isi artikel tersebut.

Berikut adalah teks yang harus diringkas:
--- MULAI TEKS ---
${contentToSummarize.slice(0, 30000)} ${contentToSummarize.length > 30000 ? "... [Teks dipotong karena terlalu panjang]" : ""}
--- AKHIR TEKS ---`;

    if (provider === "openrouter") {
      const openRouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterApiKey) {
        res.status(400).json({ 
          error: "OPENROUTER_API_KEY tidak ditemukan di environment. Silakan tambahkan Kunci API OpenRouter Anda pada menu Settings > Secrets di Google AI Studio." 
        });
        return;
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "InfoRingkas AI"
        },
        body: JSON.stringify({
          model: model || "openrouter/free",
          messages: [
            {
              role: "system",
              content: "Anda adalah asisten AI yang ahli dalam mengekstrak dan meringkas teks panjang secara profesional dalam Bahasa Indonesia."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Gagal menghubungi OpenRouter API.");
      }

      const summaryText = data.choices?.[0]?.message?.content || "";

      res.json({
        summary: summaryText,
        title: fetchedTitle || (isUrl ? "Halaman Web" : "Ringkasan Teks"),
        charCountOriginal: contentToSummarize.length,
        charCountSummary: summaryText.length,
      });
      return;
    }

    if (!geminiApiKey) {
      res.status(500).json({ 
        error: "GEMINI_API_KEY tidak ditemukan di environment. Silakan tambahkan kunci API Anda di Settings > Secrets." 
      });
      return;
    }

    const summaryResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({
      summary: summaryResponse.text || "",
      title: fetchedTitle || (isUrl ? "Halaman Web" : "Ringkasan Teks"),
      charCountOriginal: contentToSummarize.length,
      charCountSummary: (summaryResponse.text || "").length,
    });
  } catch (error: any) {
    console.error("Error in /api/summarize:", error);
    let errorMessage = error.message || "Terjadi kesalahan pada server saat meringkas teks.";

    // Check for 429/RESOURCE_EXHAUSTED/Quota exceeded errors
    const isQuotaError = 
      error.status === 429 || 
      error.status === "RESOURCE_EXHAUSTED" || 
      String(error.status) === "429" ||
      errorMessage.toLowerCase().includes("quota") || 
      errorMessage.toLowerCase().includes("exhausted") ||
      errorMessage.toLowerCase().includes("429");

    if (isQuotaError) {
      errorMessage = "⚠️ Batas Kuota API Terlampaui (Error 429: RESOURCE_EXHAUSTED). Akun Anda atau kunci API gratis saat ini telah melebihi batas penggunaan (quota limit). Silakan tunggu beberapa menit sebelum mencoba lagi, atau tambahkan/perbarui Kunci API Anda di menu Settings > Secrets di Google AI Studio.";
    }

    res.status(isQuotaError ? 429 : 500).json({ 
      error: errorMessage 
    });
  }
});

// API Endpoint to parse uploaded documents (PDF, Word, TXT, etc.)
app.post("/api/parse-document", async (req: Request, res: Response): Promise<void> => {
  try {
    const { base64, fileName, mimeType } = req.body;

    if (!base64) {
      res.status(400).json({ error: "Mohon unggah file dokumen yang valid." });
      return;
    }

    const buffer = Buffer.from(base64, "base64");
    let extractedText = "";

    const ext = fileName ? fileName.split(".").pop().toLowerCase() : "";

    if (ext === "pdf" || mimeType === "application/pdf") {
      try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text || "";
      } catch (err: any) {
        throw new Error(`Gagal mengekstrak teks dari PDF: ${err.message}`);
      }
    } else if (
      ext === "docx" || 
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value || "";
      } catch (err: any) {
        throw new Error(`Gagal mengekstrak teks dari Word (.docx): ${err.message}`);
      }
    } else {
      // Default fallback to UTF-8 text string (for .txt, .md, .csv, .json, etc.)
      extractedText = buffer.toString("utf-8");
    }

    if (!extractedText.trim()) {
      res.status(422).json({ error: "Dokumen berhasil dibaca namun tidak mengandung teks yang dapat diproses." });
      return;
    }

    res.json({
      success: true,
      text: extractedText,
      charCount: extractedText.length,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length
    });
  } catch (error: any) {
    console.error("Error in /api/parse-document:", error);
    res.status(500).json({ error: error.message || "Gagal mengurai dokumen." });
  }
});

// ==========================================
// Operational Database & Vector DB Endpoints
// ==========================================

// 1. GET Users
app.get("/api/db/users", async (req: Request, res: Response) => {
  try {
    const usersList = await db.users.list();
    res.json({ success: true, users: usersList });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengambil data pengguna" });
  }
});

// 2. POST (Upsert) User
app.post("/api/db/users", async (req: Request, res: Response) => {
  try {
    const { id, email, name, preferences = {} } = req.body;
    if (!id || !email || !name) {
      res.status(400).json({ error: "Sediakan parameter id, email, dan name." });
      return;
    }
    const user = await db.users.upsert(id, email, name, preferences);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal meng-upsert pengguna" });
  }
});

// 3. DELETE User
app.delete("/api/db/users/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await db.users.delete(id);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus pengguna" });
  }
});

// 4. GET Conversation History Log
app.get("/api/db/history", async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query;
    const history = await db.conversations.list(session_id as string);
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengambil riwayat percakapan" });
  }
});

// 4b. GET Conversation Sessions (Threads)
app.get("/api/db/sessions", async (req: Request, res: Response) => {
  try {
    const sessions = await (db.conversations as any).listSessions();
    res.json({ success: true, sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengambil daftar sesi obrolan" });
  }
});

// 4c. DELETE Specific Session (Thread) and its messages
app.delete("/api/db/history/session/:session_id", async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;
    const deleted = await (db.conversations as any).deleteSession(session_id);
    res.json({ success: true, deleted, message: "Sesi percakapan berhasil dihapus." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus sesi percakapan" });
  }
});

// 5. POST Clear Conversation History
app.post("/api/db/history/clear", async (req: Request, res: Response) => {
  try {
    await db.conversations.clear();
    res.json({ success: true, message: "Seluruh riwayat percakapan berhasil dihapus." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus riwayat percakapan" });
  }
});

// 5b. DELETE Individual Message
app.delete("/api/db/history/message/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await db.conversations.delete(id);
    res.json({ success: true, deleted, message: "Pesan berhasil dihapus." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus pesan" });
  }
});

// 5c. POST Truncate Conversation History (from a message id onwards)
app.post("/api/db/history/truncate", async (req: Request, res: Response) => {
  try {
    const { id, session_id = "session_default" } = req.body;
    if (!id) {
      res.status(400).json({ error: "Sediakan parameter id pesan untuk pemotongan riwayat." });
      return;
    }
    await db.conversations.truncateFromMessage(id, session_id);
    res.json({ success: true, message: "Riwayat berhasil dipotong sejak pesan yang ditentukan." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memotong riwayat percakapan" });
  }
});

// 6. GET System Status
app.get("/api/db/status", async (req: Request, res: Response) => {
  try {
    const status = await db.systemStatus.get();
    res.json({ 
      success: true, 
      status, 
      is_postgres: db.isPostgres(),
      vector_engine: vectorDb.name
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengambil status sistem" });
  }
});

// 7. GET Vectors list
app.get("/api/db/vectors", async (req: Request, res: Response) => {
  try {
    const vectors = await vectorDb.list();
    res.json({ success: true, vectors });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengambil data vektor" });
  }
});

// 8. POST Upsert Vector (Manual Memori)
app.post("/api/db/vectors", async (req: Request, res: Response) => {
  try {
    const { text, metadata = {} } = req.body;
    if (!text) {
      res.status(400).json({ error: "Sediakan konten teks untuk disimpan dalam database vektor." });
      return;
    }
    
    // Generate real embedding using Gemini
    const embedding = await getEmbedding(ai, text);
    const vectorRecord = await vectorDb.upsert(text, embedding, metadata);
    
    res.json({ success: true, vector: vectorRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menyimpan ke database vektor" });
  }
});

// 9. POST Clear Vector memory
app.post("/api/db/vectors/clear", async (req: Request, res: Response) => {
  try {
    await vectorDb.clear();
    res.json({ success: true, message: "Seluruh basis data memori vektor berhasil dikosongkan." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengosongkan basis data vektor" });
  }
});

// 9b. DELETE Individual Vector memory
app.delete("/api/db/vectors/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await vectorDb.delete(id);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus memori vektor" });
  }
});

// 10. POST Search Similarity (Contextual Search)
app.post("/api/db/vectors/search", async (req: Request, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;
    if (!query) {
      res.status(400).json({ error: "Sediakan parameter query pencarian." });
      return;
    }
    
    // Generate query embedding
    const queryEmbed = await getEmbedding(ai, query);
    const searchResults = await vectorDb.query(queryEmbed, limit);
    
    res.json({ success: true, results: searchResults });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal melakukan pencarian kontekstual vektor" });
  }
});

// Configure Vite integration for Single Page Application
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
