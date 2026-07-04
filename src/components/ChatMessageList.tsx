import React, { useState, useRef, useEffect } from "react";
import { 
  Compass, Globe, Sparkles, HelpCircle, Clock, Trash2, 
  Copy, Check, ArrowUpRight, Loader2, Search, User, Cpu,
  Pencil, RotateCcw
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "../types";

const QUICK_PROMPTS = [
  {
    title: "Tren Teknologi 2026",
    text: "Apa saja tren teknologi terbaru dan paling berdampak di tahun 2026?",
    icon: Compass,
  },
  {
    title: "Misteri Energi Fusi",
    text: "Bagaimana perkembangan terbaru mengenai reaktor energi fusi nuklir komersial?",
    icon: Globe,
  },
  {
    title: "Kecerdasan Buatan di Medis",
    text: "Bagaimana penerapan kecerdasan buatan (AI) tercanggih dalam dunia kedokteran saat ini?",
    icon: Sparkles,
  },
  {
    title: "Wisata Tersembunyi Indonesia",
    text: "Rekomendasikan 5 destinasi wisata alam tersembunyi terbaik di Indonesia beserta cara menuju ke sana.",
    icon: HelpCircle,
  }
];

// Modern, Beautiful Custom CodeBlock Component with interactive Copy functionality
interface CodeBlockProps {
  language: string;
  value: string;
}

function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-xl border border-[#2d2f31]/80 overflow-hidden bg-[#1a1b1c] shadow-md group/code">
      <div className="flex items-center justify-between px-4 py-2 bg-[#111213] border-b border-[#2d2f31]/60 text-[11px] text-slate-400 font-mono select-none">
        <span className="uppercase font-semibold tracking-wider text-slate-500">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-all cursor-pointer bg-transparent border-none py-1 px-2 rounded-md hover:bg-[#2d2f31]"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 font-medium">Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Kode</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs text-slate-200 font-mono leading-relaxed !my-0 !bg-transparent !border-none">
        <code>{value}</code>
      </pre>
    </div>
  );
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onClearHistory: () => void;
  isLoading: boolean;
  provider: "openrouter" | "gemini";
  model: string;
  onEditUserMessage?: (messageId: string, newText: string) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
}

export default function ChatMessageList({
  messages,
  onSendMessage,
  onClearHistory,
  isLoading,
  provider,
  model,
  onEditUserMessage,
  onRegenerate
}: ChatMessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleQuickPromptClick = (text: string) => {
    if (isLoading) return;
    onSendMessage(text);
  };

  const handleCopyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* Header Obrolan */}
      <div className="px-4 py-3 border-b border-[#2d2f31]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1e1f20] flex items-center justify-center text-purple-400">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Pencarian Web & Obrolan</h2>
            {provider === "openrouter" ? (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                OpenRouter: {model === "openrouter/free" 
                  ? (() => {
                      const lastAssistantWithModel = [...messages].reverse().find(m => m.role === "assistant" && m.model);
                      return lastAssistantWithModel?.model 
                        ? `openrouter/free (${lastAssistantWithModel.model})` 
                        : "openrouter/free (Auto Free)";
                    })()
                  : model
                }
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Google Search Grounding Aktif
              </div>
            )}
          </div>
        </div>

        {messages.length > 0 && (
          <div className="flex items-center">
            {showConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-950/20 border border-red-900/40 py-1 px-2.5 rounded-full animate-fade-in">
                <span className="text-[10px] text-red-300 font-semibold uppercase tracking-wide">Hapus chat?</span>
                <button
                  onClick={() => {
                    onClearHistory();
                    setShowConfirm(false);
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-full transition-all cursor-pointer"
                >
                  Ya
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-300 bg-[#2d2f31] hover:bg-slate-700 rounded-full transition-all cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-full transition-colors cursor-pointer"
                title="Bersihkan Obrolan"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Kontainer Utama Pesan */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8">
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col justify-center items-center text-center max-w-lg mx-auto space-y-6 py-4"
            >
              <div className="w-12 h-12 rounded-full bg-[#1e1f20] flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C12 2 13 8 18 12C13 12 12 18 12 22C12 22 11 16 6 12C11 12 12 2 12 2Z" fill="url(#geminiStarGradient)" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-200">Bagaimana saya bisa membantu hari ini?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ajukan pertanyaan seputar berita terkini, tutorial pemrograman, riset ilmiah, atau apa pun. Mesin pencari kami siap menyajikan fakta terpercaya dari seluruh web.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-2">
                {QUICK_PROMPTS.map((prompt, idx) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleQuickPromptClick(prompt.text)}
                      className="flex items-start gap-3 p-3.5 text-left bg-[#1e1f20] hover:bg-[#2d2f31]/70 border border-transparent hover:border-[#2d2f31]/40 rounded-2xl transition-all cursor-pointer group"
                    >
                      <div className="p-2 rounded-xl bg-[#131314] text-slate-400 group-hover:text-blue-400 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <h4 className="text-xs font-semibold text-slate-300 group-hover:text-blue-400 truncate">
                          {prompt.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {prompt.text}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-8 max-w-4xl mx-auto">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex w-full"
                >
                  {message.role === "user" ? (
                    // User Message - Right Aligned with Clean Custom Rounded Bubble & No messy horizontal borders
                    <div className="flex gap-3 max-w-[85%] ml-auto justify-end items-start w-full">
                      <div className="flex flex-col items-end gap-1.5 min-w-0 w-full">
                        {editingMessageId === message.id ? (
                          <div className="w-full max-w-md bg-[#1e1f20] border border-[#2d2f31] rounded-2xl p-3 flex flex-col gap-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              className="w-full bg-[#131314] text-slate-100 text-sm p-3 rounded-xl border border-[#2d2f31]/60 focus:border-blue-500 focus:outline-none resize-none font-sans"
                              placeholder="Tulis pesan baru Anda di sini..."
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="px-3 py-1.5 rounded-lg text-slate-400 hover:bg-[#2d2f31]/50 cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                onClick={() => {
                                  if (editText.trim() && onEditUserMessage) {
                                    onEditUserMessage(message.id, editText.trim());
                                  }
                                  setEditingMessageId(null);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors cursor-pointer"
                              >
                                Simpan & Kirim
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative flex flex-col items-end gap-1.5 min-w-0 max-w-full">
                            <button
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditText(message.content);
                              }}
                              className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 bg-[#1e1f20]/90 border border-[#2d2f31]/40 rounded-lg text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all shadow-md cursor-pointer"
                              title="Edit pesan"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            
                            <div className="bg-[#2a2b2d] hover:bg-[#323335] text-slate-100 px-4.5 py-3 rounded-2xl rounded-tr-xs shadow-sm transition-colors border border-[#3c3d3f]/25">
                              <div className="markdown-body user-message break-words text-sm leading-relaxed">
                                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono pr-1 select-none">
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                {new Date(message.timestamp).toLocaleTimeString("id-ID", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-slate-600 border border-[#4d4f52]/40 flex items-center justify-center text-slate-100 shrink-0 select-none animate-fade-in">
                        <User className="w-4 h-4" />
                      </div>
                    </div>
                  ) : (
                    // Assistant Message - Left Aligned, Beautifully integrated flow, code styling & sources placement
                    <div className="flex gap-4 max-w-[95%] items-start w-full">
                      <div className="w-8 h-8 rounded-full bg-[#1e1f20] border border-[#2d2f31]/40 flex items-center justify-center shrink-0 mt-0.5 select-none shadow-xs">
                        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2C12 2 13 8 18 12C13 12 12 18 12 22C12 22 11 16 6 12C11 12 12 2 12 2Z" fill="url(#geminiStarGradient)" />
                        </svg>
                      </div>
                      
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="markdown-body break-words select-text">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                const hasMultipleLines = codeString.includes("\n");
                                
                                if (match || hasMultipleLines) {
                                  const lang = match ? match[1] : "code";
                                  return (
                                    <CodeBlock language={lang} value={codeString} />
                                  );
                                }
                                
                                return (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {message.content}
                          </Markdown>
                        </div>

                        {/* Action Buttons & Time Row - Minimal, Clean, Modern */}
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 select-none pl-0.5">
                          <span className="font-mono">
                            {new Date(message.timestamp).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="text-[#2d2f31]">•</span>
                          <button
                            onClick={() => handleCopyMessage(message.content, message.id)}
                            className="flex items-center gap-1 text-slate-400 hover:text-blue-400 hover:bg-[#1e1f20] px-1.5 py-1 rounded-md transition-all cursor-pointer"
                            title="Salin jawaban"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-green-500 animate-fade-in" />
                                <span className="text-green-500 font-medium">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>
                          {onRegenerate && (
                            <>
                              <span className="text-[#2d2f31]">•</span>
                              <button
                                onClick={() => onRegenerate(message.id)}
                                disabled={isLoading}
                                className={`flex items-center gap-1 text-slate-400 hover:text-purple-400 hover:bg-[#1e1f20] px-1.5 py-1 rounded-md transition-all cursor-pointer ${
                                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title="Ulangi tanggapan"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Ulangi</span>
                              </button>
                            </>
                          )}
                          {message.model && (
                            <>
                              <span className="text-[#2d2f31]">•</span>
                              <div className="flex items-center gap-1 bg-purple-950/25 text-purple-300 border border-purple-900/40 px-2 py-0.5 rounded-full font-mono text-[9px] font-medium animate-fade-in" title="Model AI yang memproses tanggapan ini">
                                <Cpu className="w-2.5 h-2.5 text-purple-400" />
                                <span>{message.model}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Sources Section - Beautifully flows directly under message controls */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="bg-[#1e1f20]/40 border border-[#2d2f31]/40 rounded-2xl p-4 space-y-3 mt-4 max-w-2xl shadow-xs animate-fade-in">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 tracking-wider uppercase">
                              <Globe className="w-3.5 h-3.5" />
                              <span>Sumber Referensi Terpercaya ({message.sources.length}):</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {message.sources.map((source, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1a1b1c] border border-[#2d2f31]/60 hover:border-blue-500/50 hover:bg-[#252627] rounded-full text-[11px] text-slate-300 hover:text-white transition-all shadow-xs group"
                                >
                                  <span className="w-4.5 h-4.5 rounded-full bg-[#111213] text-[9px] text-slate-400 flex items-center justify-center font-bold">
                                    {sIdx + 1}
                                  </span>
                                  <span className="max-w-[150px] truncate font-medium">
                                    {source.title}
                                  </span>
                                  <ArrowUpRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 transition-colors" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-4 justify-start max-w-4xl mx-auto"
          >
            <div className="w-8 h-8 rounded-full bg-[#1e1f20] border border-[#2d2f31]/40 flex items-center justify-center shrink-0 mt-0.5 select-none">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C12 2 13 8 18 12C13 12 12 18 12 22C12 22 11 16 6 12C11 12 12 2 12 2Z" fill="url(#geminiStarGradient)" />
              </svg>
            </div>
            <div className="space-y-2 max-w-[85%]">
              <div className="bg-transparent rounded-2xl py-2 flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <span className="text-sm text-slate-400 font-medium animate-pulse">
                  Mencari informasi real-time dan menyusun jawaban...
                </span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
