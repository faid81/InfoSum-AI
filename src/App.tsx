import React, { useState, useEffect } from "react";
import { 
  Search, Sparkles, Bot, Layers, Info, Compass, ShieldAlert, Wifi, Globe, AlignLeft, Settings, Cpu, Menu, X, Plus, PanelLeft, Database, Trash2
} from "lucide-react";
import { motion } from "motion/react";
import ChatMessageList from "./components/ChatMessageList";
import ChatInputForm from "./components/ChatInputForm";
import TextSummarizer from "./components/TextSummarizer";
import DatabaseDashboard from "./components/DatabaseDashboard";
import { ActiveTab, ChatMessage } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Thread (Session) Management States
  const [sessionId, setSessionId] = useState<string>(() => "session_" + Math.random().toString(36).substring(2, 11));
  const [sessions, setSessions] = useState<Array<{ session_id: string; created_at: string; updated_at: string; title: string }>>([]);

  // AI Settings State (Default: OpenRouter, Model: openrouter/free)
  const [provider, setProvider] = useState<"openrouter" | "gemini">("openrouter");
  const [model, setModel] = useState<string>("openrouter/free");
  const [customModel, setCustomModel] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [enableVector, setEnableVector] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const activeModel = provider === "openrouter" 
    ? (model === "custom" ? customModel || "openrouter/free" : model) 
    : "gemini-3.5-flash";

  // Load list of conversation threads
  const loadSessions = async (autoSelectLatest = false) => {
    try {
      const response = await fetch("/api/db/sessions");
      const data = await response.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
        
        if (autoSelectLatest && data.sessions.length > 0) {
          const sorted = [...data.sessions].sort((a: any, b: any) => {
            const dateA = new Date(a.updated_at || a.created_at).getTime();
            const dateB = new Date(b.updated_at || b.created_at).getTime();
            return dateB - dateA;
          });
          setSessionId(sorted[0].session_id);
        }
      }
    } catch (err) {
      console.error("Gagal memuat daftar sesi percakapan:", err);
    }
  };

  // Start a new thread
  const handleNewThread = () => {
    const newId = "session_" + Math.random().toString(36).substring(2, 11);
    setSessionId(newId);
    setMessages([]);
  };

  // Delete a specific thread and its message history
  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/api/db/history/session/${id}`, { method: "DELETE" });
      if (sessionId === id) {
        const remaining = sessions.filter((s) => s.session_id !== id);
        if (remaining.length > 0) {
          const sortedRemaining = [...remaining].sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at).getTime();
            const dateB = new Date(b.updated_at || b.created_at).getTime();
            return dateB - dateA;
          });
          setSessionId(sortedRemaining[0].session_id);
        } else {
          handleNewThread();
        }
      } else {
        loadSessions();
      }
    } catch (err) {
      console.error("Gagal menghapus sesi percakapan:", err);
    }
  };

  // Initial startup load to populate the previous threads in the sidebar
  useEffect(() => {
    loadSessions(false);
  }, []);

  // Load conversation history and threads whenever sessionId changes
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/db/history?session_id=${sessionId}`);
        const data = await response.json();
        if (active) {
          if (data.success && data.history) {
            // Sort messages ascending by timestamp to display in correct chronological order
            const sortedHistory = [...data.history].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            const mapped: ChatMessage[] = sortedHistory.map((h: any) => {
              let parsedSources: any[] = [];
              let parsedModel: string | undefined = undefined;
              if (h.sources) {
                try {
                  const parsed = typeof h.sources === "string" ? JSON.parse(h.sources) : h.sources;
                  if (Array.isArray(parsed)) {
                    parsedSources = parsed;
                  } else if (parsed && typeof parsed === "object") {
                    parsedSources = parsed.sources || [];
                    parsedModel = parsed.model;
                  }
                } catch (e) {
                  console.error("Gagal mengurai sources:", e);
                }
              }
              return {
                id: h.id,
                role: h.role,
                content: h.content,
                timestamp: new Date(h.timestamp),
                sources: parsedSources,
                model: parsedModel,
              };
            });
            setMessages(mapped);
          } else {
            setMessages([]);
          }
        }
      } catch (err) {
        if (active) {
          console.error("Gagal memuat riwayat percakapan dari basis data:", err);
        }
      }
    };
    
    loadHistory();
    loadSessions();

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Send Chat Message to Server API
  const handleSendMessage = async (text: string) => {
    setIsChatLoading(true);
    setErrorMsg(null);

    // Create immediate user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: activeModel,
          enable_vector: enableVector,
          session_id: sessionId,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal mendapatkan jawaban dari server.");
      }

      // Append assistant's response with cited sources
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        sources: data.sources || [],
        model: data.model || activeModel,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      await loadSessions();
    } catch (err: any) {
      console.error("Chat Error:", err);
      setErrorMsg(err.message || "Gagal menyambung ke server chatbot.");
      
      // Append fallback assistant message with error explanation
      const assistantErrorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ **Maaf, terjadi masalah saat menghubungi server.** \n\n*Detail Error:* ${err.message || "Koneksi terputus atau server tidak merespon."}\n\nMohon pastikan server dev Anda sedang berjalan dan kunci API Agentic AI Anda telah diatur di panel Secrets.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantErrorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch("/api/db/history/clear", { method: "POST" });
    } catch (err) {
      console.error("Gagal mengosongkan riwayat percakapan dari basis data:", err);
    }
    setMessages([]);
    setErrorMsg(null);
  };

  const handleEditUserMessage = async (messageId: string, newText: string) => {
    setIsChatLoading(true);
    setErrorMsg(null);

    try {
      // 1. Truncate operational DB from that message onwards (inclusive of the message itself, so we can re-add it)
      await fetch("/api/db/history/truncate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: messageId, session_id: sessionId }),
      });

      // 2. Truncate local React state
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) {
        setIsChatLoading(false);
        return;
      }
      const keptMessages = messages.slice(0, targetIndex);
      
      // 3. Create immediate user message with new text
      const userMessage: ChatMessage = {
        id: messageId,
        role: "user",
        content: newText,
        timestamp: new Date(),
      };

      const updatedMessages = [...keptMessages, userMessage];
      setMessages(updatedMessages);

      // 4. Save new user message to Operational DB & get assistant reply
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: activeModel,
          enable_vector: enableVector,
          session_id: sessionId,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal mendapatkan jawaban dari server.");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        sources: data.sources || [],
        model: data.model || activeModel,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      await loadSessions();
    } catch (err: any) {
      console.error("Edit User Message Error:", err);
      setErrorMsg(err.message || "Gagal mengedit pesan dan menyambung ke server chatbot.");
      
      const assistantErrorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ **Maaf, terjadi masalah saat menghubungi server.** \n\n*Detail Error:* ${err.message || "Koneksi terputus atau server tidak merespon."}\n\nMohon pastikan server dev Anda sedang berjalan dan kunci API Agentic AI Anda telah diatur di panel Secrets.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantErrorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleRegenerate = async (assistantMessageId: string) => {
    setIsChatLoading(true);
    setErrorMsg(null);

    try {
      // 1. Delete the assistant message from the DB
      await fetch(`/api/db/history/message/${assistantMessageId}`, { method: "DELETE" });

      // 2. Truncate React state: remove the target assistant message and subsequent ones
      const targetIndex = messages.findIndex((m) => m.id === assistantMessageId);
      if (targetIndex === -1) {
        setIsChatLoading(false);
        return;
      }
      
      const updatedMessages = messages.slice(0, targetIndex);
      setMessages(updatedMessages);

      if (updatedMessages.length === 0) {
        setIsChatLoading(false);
        return;
      }

      // 3. Re-send updated messages to API to get new response
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: activeModel,
          enable_vector: enableVector,
          session_id: sessionId,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal mendapatkan jawaban dari server.");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        sources: data.sources || [],
        model: data.model || activeModel,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      await loadSessions();
    } catch (err: any) {
      console.error("Regenerate Error:", err);
      setErrorMsg(err.message || "Gagal mengulangi tanggapan dari chatbot.");
      
      const assistantErrorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ **Maaf, terjadi masalah saat menghubungi server.** \n\n*Detail Error:* ${err.message || "Koneksi terputus atau server tidak merespon."}\n\nMohon pastikan server dev Anda sedang berjalan dan kunci API Agentic AI Anda telah diatur di panel Secrets.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantErrorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#131314] text-[#e3e3e3] font-sans antialiased flex flex-col md:flex-row selection:bg-blue-900/60 selection:text-white relative">
      
      {/* Definisi Linear Gradient untuk SVG Star Gemini */}
      <svg className="absolute w-0 h-0" width="0" height="0">
        <defs>
          <linearGradient id="geminiStarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="35%" stopColor="#9B51E0" />
            <stop offset="70%" stopColor="#E94235" />
            <stop offset="100%" stopColor="#F9BC05" />
          </linearGradient>
        </defs>
      </svg>

      {/* Mini Sidebar Kiri (Tampil saat sidebarOpen === false) */}
      {!sidebarOpen && (
        <aside className="hidden md:flex w-16 border-r border-[#2d2f31]/40 bg-[#1e1f20] flex-col items-center py-6 justify-between shrink-0 relative z-10 transition-all duration-300">
          <div className="flex flex-col items-center gap-6 w-full">
            {/* Logo Agentic AI */}
            <div 
              className="cursor-pointer p-1" 
              title="Buka Menu Penuh"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-6 h-6 animate-pulse" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="url(#geminiStarGradient)" strokeWidth="2" strokeDasharray="3 2" />
                <path d="M12 8v8M8 12h8" stroke="url(#geminiStarGradient)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3.5" fill="url(#geminiStarGradient)" />
                <circle cx="12" cy="8" r="1.5" fill="#ffffff" />
                <circle cx="12" cy="16" r="1.5" fill="#ffffff" />
                <circle cx="8" cy="12" r="1.5" fill="#ffffff" />
                <circle cx="16" cy="12" r="1.5" fill="#ffffff" />
              </svg>
            </div>

            {/* Navigation Icons */}
            <div className="flex flex-col gap-2 w-full px-2">
              <button
                onClick={() => setActiveTab("chat")}
                className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  activeTab === "chat"
                    ? "bg-[#004a77] text-[#c2e7ff]"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
                title="Obrolan Pencarian"
              >
                <Search className="w-5 h-5" />
              </button>

              <button
                onClick={() => setActiveTab("summarize")}
                className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  activeTab === "summarize"
                    ? "bg-[#004a77] text-[#c2e7ff]"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
                title="Ringkasan Teks & URL"
              >
                <AlignLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => setActiveTab("database")}
                className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  activeTab === "database"
                    ? "bg-[#004a77] text-[#c2e7ff]"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
                title="Eksplorasi Basis Data & Memori"
              >
                <Database className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Icons */}
          <div className="flex flex-col items-center gap-4 w-full px-2">
            <div 
              className="p-2 rounded-full bg-[#131314] text-slate-400 text-center flex items-center justify-center border border-[#2d2f31]/50 cursor-pointer"
              title={`Provider: ${provider === "openrouter" ? "OpenRouter" : "Gemini"}\nModel: ${activeModel}`}
            >
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 rounded-full hover:bg-[#2d2f31] text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Buka Menu Penuh"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
          </div>
        </aside>
      )}

      {/* Sidebar Kiri Penuh */}
        <aside className={`transition-all duration-300 ease-in-out shrink-0 relative z-10 bg-[#1e1f20] border-[#2d2f31]/40 ${
        sidebarOpen 
          ? "w-full md:w-[280px] border-b md:border-b-0 md:border-r pt-5 pb-3 px-0 flex flex-col gap-4 justify-between opacity-100" 
          : "w-0 h-0 p-0 overflow-hidden md:w-0 border-r-0 border-b-0 opacity-0 pointer-events-none"
      }`}>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-4">
          {/* Logo / Branding */}
          <div className="flex items-center justify-between gap-2 shrink-0 px-4.5">
            <div className="flex items-center gap-2.5">
              <svg className="w-5.5 h-5.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="url(#geminiStarGradient)" strokeWidth="2" strokeDasharray="3 2" />
                <path d="M12 8v8M8 12h8" stroke="url(#geminiStarGradient)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3.5" fill="url(#geminiStarGradient)" />
                <circle cx="12" cy="8" r="1.5" fill="#ffffff" />
                <circle cx="12" cy="16" r="1.5" fill="#ffffff" />
                <circle cx="8" cy="12" r="1.5" fill="#ffffff" />
                <circle cx="16" cy="12" r="1.5" fill="#ffffff" />
              </svg>
              <h1 className="text-[15px] font-semibold text-[#e3e3e3] tracking-normal leading-none">Agentic AI</h1>
            </div>
            {/* Collapse button directly inside the full sidebar */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#2d2f31] text-[#c4c7c5] hover:text-white transition-all cursor-pointer flex items-center justify-center"
              title="Tutup Menu Samping"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>
          {/* Action Buttons: New Chat & Search Input */}
          <div className="flex flex-col gap-2.5 shrink-0 px-3">
            {/* Button: Percakapan baru */}
            <button
              onClick={handleNewThread}
              className="w-full py-2.5 px-4.5 rounded-full text-xs font-medium text-slate-200 bg-[#131314]/30 hover:bg-[#2d2f31]/50 border border-[#2d2f31]/35 transition-all duration-200 flex items-center gap-3 cursor-pointer text-left shadow-xs"
            >
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
              <span>Percakapan baru</span>
            </button>

            {/* Live Search Thread Filter */}
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Telusuri percakapan"
                className="w-full bg-transparent hover:bg-[#2d2f31]/20 focus:bg-[#131314] text-xs text-slate-200 pl-11 pr-8 py-2.5 rounded-full border border-[#2d2f31]/30 focus:border-blue-500/50 focus:outline-none transition-all placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Thread List Section */}
          <div className="flex-1 flex flex-col min-h-0 space-y-1.5 pt-1">
            <div className="px-5 shrink-0 flex items-center justify-between">
              <span className="text-xs font-medium text-[#c4c7c5]">
                Terbaru
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
              {(() => {
                const sortedSessions = [...sessions].sort((a, b) => {
                  const dateA = new Date(a.updated_at || a.created_at).getTime();
                  const dateB = new Date(b.updated_at || b.created_at).getTime();
                  return dateB - dateA;
                });

                const filteredSessions = sortedSessions.filter((s) =>
                  s.title.toLowerCase().includes(searchQuery.toLowerCase())
                );

                return filteredSessions.map((sess, idx) => {
                  const isLatest = idx === 0 && searchQuery === "";
                  const isActive = sessionId === sess.session_id;

                  return (
                    <div
                      key={sess.session_id}
                      className={`group relative flex items-center justify-between rounded-full px-4.5 py-2.5 text-[12.5px] transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-[#2d2f31] text-white font-medium"
                          : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]/40"
                      }`}
                      onClick={() => setSessionId(sess.session_id)}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden w-full pr-7">
                        <span className="truncate flex-1" title={sess.title}>
                          {sess.title}
                        </span>
                        {isLatest && (
                          <span className={`shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded-xs uppercase tracking-wider ${
                            isActive 
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" 
                              : "bg-[#131314] text-blue-400 border border-[#2d2f31]"
                          }`}>
                            Terbaru
                          </span>
                        )}
                      </div>
                      {/* Delete session button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(sess.session_id);
                        }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-[#131314]/70 rounded-full text-slate-400 hover:text-red-400 transition-all cursor-pointer z-10"
                        title="Hapus Thread"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                });
              })()}
              {sessions.length === 0 && (
                <div className="text-[11px] text-slate-500 text-center py-6">
                  Belum ada riwayat percakapan.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pengaturan di bagian bawah */}
        <div className="mt-auto pt-3 border-t border-[#2d2f31]/40 px-4 flex items-center shrink-0 bg-[#1e1f20]">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2.5 overflow-hidden w-full hover:bg-[#2d2f31]/40 px-2.5 py-2 rounded-xl text-[#c4c7c5] hover:text-white transition-all cursor-pointer text-left"
            title="Pengaturan AI & Model"
          >
            <Settings className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            <span className="text-[12.5px] font-medium truncate">
              Pengaturan
            </span>
          </button>
        </div>
      </aside>

      {/* Area Konten Utama Sebelah Kanan */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#131314] h-screen overflow-hidden">
        {/* Top Header info */}
        <header className="bg-[#131314] border-b border-[#2d2f31]/30 pl-4 pr-6 py-3.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5">
            {/* Tombol Buka/Tutup Sidebar Utama */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-10 h-10 rounded-xl bg-transparent border border-[#2d2f31]/40 text-[#c4c7c5] hover:text-white hover:bg-[#1e1f20] transition-all cursor-pointer flex items-center justify-center shadow-xs shrink-0"
                title="Buka Menu Samping"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}

            {/* Dynamic Header Info based on activeTab */}
            {activeTab === "chat" ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1e1f20] flex items-center justify-center text-purple-400 shrink-0">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Pencarian Web & Obrolan</h2>
                  {provider === "openrouter" ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      OpenRouter: {activeModel}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      Google Search Grounding Aktif
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "summarize" ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1e1f20] flex items-center justify-center text-emerald-400 shrink-0">
                  <AlignLeft className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Ringkasan Teks & URL</h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Model: {activeModel}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1e1f20] flex items-center justify-center text-purple-400 shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Eksplorasi Basis Data & Memori</h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                    Pusat Memori Vektor
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Segmented Tab Switcher */}
            <div className="flex items-center bg-[#1e1f20] p-1 rounded-full border border-[#2d2f31]/50 shadow-inner shrink-0">
              <button
                onClick={() => setActiveTab("chat")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === "chat"
                    ? "bg-[#2d2f31] text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Obrolan
              </button>
              <button
                onClick={() => setActiveTab("summarize")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === "summarize"
                    ? "bg-[#2d2f31] text-white shadow-xs"
                    : "text-[#c4c7c5] hover:text-white"
                }`}
              >
                Ringkasan
              </button>
              <button
                onClick={() => setActiveTab("database")}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === "database"
                    ? "bg-[#2d2f31] text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Database
              </button>
            </div>

            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-[#1e1f20] border border-[#2d2f31]/50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Bahasa Indonesia</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content Container (Outside main) */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "database" ? (
            <DatabaseDashboard enableVector={enableVector} setEnableVector={setEnableVector} />
          ) : (
            <div className="p-4 sm:p-6 md:p-8">
              <div className="max-w-4xl mx-auto w-full space-y-6">
                {/* Error Alert Bar */}
                {errorMsg && (
                  <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-2xl flex items-start gap-3 text-amber-300 text-xs sm:text-sm">
                    <ShieldAlert className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">Catatan Sistem:</span>
                      <p className="leading-relaxed opacity-90">{errorMsg}</p>
                    </div>
                  </div>
                )}

                {/* Dynamic Content Component */}
                <div className="w-full">
                  {activeTab === "chat" ? (
                    <ChatMessageList
                      messages={messages}
                      onSendMessage={handleSendMessage}
                      onClearHistory={handleClearHistory}
                      isLoading={isChatLoading}
                      provider={provider}
                      model={activeModel}
                      onEditUserMessage={handleEditUserMessage}
                      onRegenerate={handleRegenerate}
                    />
                  ) : (
                    <TextSummarizer provider={provider} model={activeModel} />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Komponen Main Hanya Berisi Div Input */}
        {activeTab === "chat" && (
          <main className="p-4 bg-transparent shrink-0 border-t border-[#2d2f31]/10">
            <ChatInputForm
              onSendMessage={handleSendMessage}
              isLoading={isChatLoading}
            />
          </main>
        )}

        {/* Footer Hak Cipta & Info */}
        <footer className="bg-transparent border-t border-[#2d2f31]/20 py-3.5 px-6 shrink-0 text-center md:text-left text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Chatbot Pencarian & Ringkasan Online. Terinspirasi oleh Agentic AI.</p>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Globe className="w-3 h-3" />
              <span>Bahasa Indonesia</span>
            </span>
          </div>
        </footer>
      </div>

      {/* AI Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          {/* Backdrop Click Dismiss */}
          <div 
            className="absolute inset-0" 
            onClick={() => setShowSettingsModal(false)}
          />

          <div className="relative bg-[#1e1f20] border border-[#2d2f31]/80 w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col gap-5 z-10 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400 animate-spin-slow" />
                <h3 className="text-sm font-semibold tracking-wide uppercase">Pengaturan Model & Provider AI</h3>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-full hover:bg-[#2d2f31] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content info */}
            <p className="text-xs text-slate-400 leading-relaxed">
              Konfigurasikan model bahasa kecerdasan buatan utama Anda untuk mendukung obrolan pencarian, ekstraksi data, dan pemrosesan ringkasan.
            </p>

            {/* Provider Select */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">AI Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  const val = e.target.value as "openrouter" | "gemini";
                  setProvider(val);
                  if (val === "openrouter") {
                    setModel("openrouter/free");
                  } else {
                    setModel("gemini-3.5-flash");
                  }
                }}
                className="w-full bg-[#131314] text-xs text-slate-200 rounded-xl p-3 border border-[#2d2f31]/80 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="openrouter">OpenRouter (Default - Tanpa API Key)</option>
                <option value="gemini">Agentic AI (Server-side API)</option>
              </select>
            </div>

            {/* Model Select */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">AI Model</label>
              {provider === "openrouter" ? (
                <div className="space-y-2">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-[#131314] text-xs text-slate-200 rounded-xl p-3 border border-[#2d2f31]/80 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value="openrouter/free">openrouter/free (Sistem Rekomendasi Bebas)</option>
                    <option value="google/gemini-2.5-flash:free">gemini-2.5-flash:free</option>
                    <option value="meta-llama/llama-3-8b-instruct:free">llama-3-8b-instruct:free</option>
                    <option value="mistralai/mistral-7b-instruct:free">mistral-7b-instruct:free</option>
                    <option value="custom">Model Kustom ID...</option>
                  </select>
                  
                  {model === "custom" && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[10px] text-slate-400 font-medium">Model ID Kustom</label>
                      <input
                        type="text"
                        placeholder="Contoh: meta-llama/llama-3-70b-instruct"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        className="w-full bg-[#131314] text-xs text-slate-200 rounded-xl p-3 border border-[#2d2f31] focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value="gemini-3.5-flash"
                    disabled
                    className="w-full bg-[#131314]/50 text-xs text-slate-400 rounded-xl p-3 border border-[#2d2f31]/40 cursor-not-allowed font-medium"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-sm uppercase font-extrabold tracking-wider">Aktif</span>
                </div>
              )}
            </div>

            {/* Vector DB Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#131314]/40 rounded-2xl border border-[#2d2f31]/30 mt-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-slate-200">Pusat Memori Vektor</span>
                <span className="text-[10px] text-slate-400">Hubungkan pencarian relevan ke database lokal</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={enableVector} 
                  onChange={(e) => setEnableVector(e.target.checked)} 
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-[#2d2f31] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {/* Info footer inside modal */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-3 border-t border-[#2d2f31]/30 mt-2">
              <span>Powered by Agentic AI & Search Grounding</span>
              <span>Versi 1.1</span>
            </div>

            {/* Action buttons */}
            <button
              onClick={() => setShowSettingsModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium py-3 rounded-full transition-all cursor-pointer shadow-md shadow-blue-600/15"
            >
              Simpan & Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
