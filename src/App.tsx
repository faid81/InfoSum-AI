import React, { useState, useEffect } from "react";
import { 
  Search, Sparkles, Bot, Layers, Info, Compass, ShieldAlert, Wifi, Globe, AlignLeft, Settings, Cpu, Menu, X, Plus, PanelLeft, Database 
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

  // AI Settings State (Default: OpenRouter, Model: openrouter/free)
  const [provider, setProvider] = useState<"openrouter" | "gemini">("openrouter");
  const [model, setModel] = useState<string>("openrouter/free");
  const [customModel, setCustomModel] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [enableVector, setEnableVector] = useState(true);

  const activeModel = provider === "openrouter" 
    ? (model === "custom" ? customModel || "openrouter/free" : model) 
    : "gemini-3.5-flash";

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch("/api/db/history?session_id=session_default");
        const data = await response.json();
        if (data.success && data.history) {
          // Sort messages ascending by timestamp to display in correct chronological order
          const sortedHistory = [...data.history].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          const mapped: ChatMessage[] = sortedHistory.map((h: any) => ({
            id: h.id,
            role: h.role,
            content: h.content,
            timestamp: new Date(h.timestamp),
            sources: h.sources ? (typeof h.sources === "string" ? JSON.parse(h.sources) : h.sources) : [],
          }));
          setMessages(mapped);
        }
      } catch (err) {
        console.error("Gagal memuat riwayat percakapan dari basis data:", err);
      }
    };
    loadHistory();
  }, []);

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
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("Chat Error:", err);
      setErrorMsg(err.message || "Gagal menyambung ke server chatbot.");
      
      // Append fallback assistant message with error explanation
      const assistantErrorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ **Maaf, terjadi masalah saat menghubungi server.** \n\n*Detail Error:* ${err.message || "Koneksi terputus atau server tidak merespon."}\n\nMohon pastikan server dev Anda sedang berjalan dan kunci API Google Gemini Anda telah diatur di panel Secrets.`,
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
            {/* Logo Gemini Star */}
            <div 
              className="cursor-pointer p-1" 
              title="Buka Menu Penuh"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-6 h-6 animate-pulse" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C12 2 13 8 18 12C13 12 12 18 12 22C12 22 11 16 6 12C11 12 12 2 12 2Z" fill="url(#geminiStarGradient)" />
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
          ? "w-full md:w-80 border-b md:border-b-0 md:border-r p-6 flex flex-col gap-6 justify-between opacity-100" 
          : "w-0 h-0 p-0 overflow-hidden md:w-0 border-r-0 border-b-0 opacity-0 pointer-events-none"
      }`}>
        <div className="space-y-6">
          {/* Logo / Branding */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C12 2 13 8 18 12C13 12 12 18 12 22C12 22 11 16 6 12C11 12 12 2 12 2Z" fill="url(#geminiStarGradient)" />
              </svg>
              <div>
                <h1 className="text-lg font-medium text-white tracking-tight leading-none">Gemini</h1>
                <span className="text-[10px] text-slate-400 font-medium">Asisten Cerdas Terpadu</span>
              </div>
            </div>
            {/* Collapse button directly inside the full sidebar */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#2d2f31] text-[#c4c7c5] hover:text-white transition-all cursor-pointer flex items-center justify-center"
              title="Tutup Menu Samping"
            >
              <PanelLeft className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Menu Navigasi Samping */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-2 mb-2">
              Notebook & Navigasi
            </span>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setActiveTab("chat")}
                className={`w-full py-3 px-4 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-3 cursor-pointer text-left ${
                  activeTab === "chat"
                    ? "bg-[#2d2f31] text-white"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
              >
                <Search className="w-4.5 h-4.5 shrink-0 text-blue-400" />
                <span>Obrolan Pencarian</span>
              </button>

              <button
                onClick={() => setActiveTab("summarize")}
                className={`w-full py-3 px-4 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-3 cursor-pointer text-left ${
                  activeTab === "summarize"
                    ? "bg-[#2d2f31] text-white"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
              >
                <AlignLeft className="w-4.5 h-4.5 shrink-0 text-emerald-400" />
                <span>Ringkasan Teks & URL</span>
              </button>

              <button
                onClick={() => setActiveTab("database")}
                className={`w-full py-3 px-4 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-3 cursor-pointer text-left ${
                  activeTab === "database"
                    ? "bg-[#2d2f31] text-white"
                    : "text-[#c4c7c5] hover:text-white hover:bg-[#2d2f31]"
                }`}
              >
                <Database className="w-4.5 h-4.5 shrink-0 text-purple-400" />
                <span>Eksplorasi Basis Data & Memori</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Koneksi & Kredensial di Bawah Sidebar */}
        <div className="pt-4 border-t border-[#2d2f31]/60 space-y-4 overflow-y-auto max-h-[350px]">

          {/* Pengaturan Memori Jangka Panjang Vektor */}
          <div className="bg-[#131314] rounded-2xl p-3 border border-[#2d2f31]/40 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Memori Jangka Panjang
              </span>
            </div>
            
            <div className="flex items-center justify-between py-1">
              <span className="text-[11px] text-slate-300">Pencarian Vektor (Cosine)</span>
              <button
                onClick={() => setEnableVector(!enableVector)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex items-center ${
                  enableVector ? "bg-purple-600 justify-end" : "bg-slate-700 justify-start"
                }`}
                title={enableVector ? "Memori Jangka Panjang Aktif" : "Memori Jangka Panjang Nonaktif"}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 leading-normal">
              Bila diaktifkan, asisten akan otomatis mengingat konteks percakapan lampau menggunakan kecocokan representasi semantik di basis data vektor.
            </p>
          </div>

          {/* Pengaturan Provider & Model AI */}
          <div className="bg-[#131314] rounded-2xl p-3 border border-[#2d2f31]/40 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Settings className="w-3 h-3 text-blue-400 animate-spin-slow" />
                MODEL AI
              </span>
              <span className="text-[9px] text-[#80868b]">DEFAULT</span>
            </div>

            {/* Provider Selection */}
            <div className="space-y-1">
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
                className="w-full bg-[#1e1f20] text-[11px] text-slate-200 rounded-lg p-2 border border-[#2d2f31]/80 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="openrouter">OpenRouter (Default)</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            {/* Model Selection */}
            <div className="space-y-1">
              {provider === "openrouter" ? (
                <div className="space-y-2">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-[#1e1f20] text-[11px] text-slate-200 rounded-lg p-2 border border-[#2d2f31]/80 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value="openrouter/free">openrouter/free (Auto Free)</option>
                    <option value="google/gemini-2.5-flash:free">gemini-2.5-flash:free</option>
                    <option value="meta-llama/llama-3-8b-instruct:free">llama-3-8b-instruct:free</option>
                    <option value="mistralai/mistral-7b-instruct:free">mistral-7b-instruct:free</option>
                    <option value="custom">Kustom Model ID...</option>
                  </select>
                  
                  {model === "custom" && (
                    <input
                      type="text"
                      placeholder="Contoh: meta-llama/llama-3-70b-instruct"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="w-full bg-[#1e1f20] text-[10px] text-slate-200 rounded-lg p-2 border border-[#2d2f31] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value="gemini-3.5-flash"
                  disabled
                  className="w-full bg-[#1e1f20]/50 text-[11px] text-slate-400 rounded-lg p-2 border border-[#2d2f31]/40 cursor-not-allowed font-medium"
                />
              )}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 text-center md:text-left leading-relaxed">
            <span>Powered by Gemini & Search Grounding</span>
          </div>
        </div>
      </aside>

      {/* Area Konten Utama Sebelah Kanan */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#131314] h-screen overflow-hidden">
        {/* Top Header info */}
        <header className="bg-[#131314] border-b border-[#2d2f31]/30 pl-4 pr-6 py-3.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Tombol Buka/Tutup Sidebar Utama */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden w-10 h-10 rounded-xl bg-transparent border border-[#2d2f31]/40 text-[#c4c7c5] hover:text-white hover:bg-[#1e1f20] transition-all cursor-pointer flex items-center justify-center shadow-xs"
                title="Buka Menu Samping"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-slate-300">
                {activeTab === "chat" 
                  ? "Obrolan Pencarian" 
                  : activeTab === "summarize" 
                    ? "Ringkasan Teks & URL" 
                    : "Pusat Basis Data & Memori Vektor"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">


            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-[#1e1f20] border border-[#2d2f31]/50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Bahasa Indonesia</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content Container (Outside main) */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "database" ? (
            <DatabaseDashboard />
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
          <p>© 2026 Chatbot Pencarian & Ringkasan Online. Terinspirasi oleh Google Gemini.</p>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Globe className="w-3 h-3" />
              <span>Bahasa Indonesia</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
