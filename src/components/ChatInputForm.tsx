import React, { useState } from "react";
import { Send } from "lucide-react";

interface ChatInputFormProps {
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
}

export default function ChatInputForm({ onSendMessage, isLoading }: ChatInputFormProps) {
  const [inputText, setInputText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    
    const textToSend = inputText;
    setInputText("");
    onSendMessage(textToSend);
  };

  return (
    <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto w-full">
      <div className="relative bg-[#1e1f20] focus-within:bg-[#2d2f31]/80 rounded-full flex items-center px-6 py-3.5 shadow-lg transition-all focus-within:ring-1 focus-within:ring-[#2d2f31]">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isLoading ? "Sedang mencari..." : "Tanyakan apa saja secara online... (Contoh: Kabar olahraga terbaru)"}
          disabled={isLoading}
          className="flex-1 bg-transparent border-none text-slate-100 placeholder-[#9aa0a6] text-sm focus:outline-none focus:ring-0 pr-12 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="absolute right-2 p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#131314] disabled:text-slate-600 text-white rounded-full transition-all cursor-pointer shadow-md active:scale-95"
          title="Kirim Pesan"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-slate-500 text-center mt-2.5">
        Diberdayakan oleh Google Search Grounding untuk akses data global real-time yang akurat.
      </p>
    </form>
  );
}
