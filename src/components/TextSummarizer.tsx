import React, { useState } from "react";
import { 
  FileText, Link, Sparkles, Copy, Check, RotateCcw, 
  TrendingDown, AlignLeft, AlertCircle, Clock, Hash, BookOpen, Loader2, UploadCloud, FileUp, File
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { SummaryFormat, SummaryLength, SummarizeResult } from "../types";

interface TextSummarizerProps {
  provider: "openrouter" | "gemini";
  model: string;
}

export default function TextSummarizer({ provider, model }: TextSummarizerProps) {
  const [inputType, setInputType] = useState<"text" | "url" | "file">("text");
  const [inputText, setInputText] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [format, setFormat] = useState<SummaryFormat>("bullet");
  const [length, setLength] = useState<SummaryLength>("medium");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [copied, setCopied] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parsingSuccess, setParsingSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = async (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setFileContent("");
    setParsingSuccess(false);
    setError(null);
    setIsParsingFile(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      
      // 1. Plain text files can be read client-side
      const plainTextExtensions = ["txt", "md", "csv", "json", "xml", "html", "js", "ts", "css"];
      if (plainTextExtensions.includes(ext || "")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setFileContent(text);
          setParsingSuccess(true);
          setIsParsingFile(false);
        };
        reader.onerror = () => {
          setError("Gagal membaca file teks lokal.");
          setIsParsingFile(false);
        };
        reader.readAsText(file);
      } else {
        // 2. Binary files (PDF, DOCX) read via server parser
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64 = (e.target?.result as string).split(",")[1];
            
            const response = await fetch("/api/parse-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                base64,
                fileName: file.name,
                mimeType: file.type
              })
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || "Gagal mengurai dokumen di server.");
            }

            setFileContent(data.text);
            setParsingSuccess(true);
          } catch (err: any) {
            setError(err.message || "Gagal mengurai dokumen.");
          } finally {
            setIsParsingFile(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      setError("Kesalahan dalam memproses file: " + err.message);
      setIsParsingFile(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Validation
    if (inputType === "text" && !inputText.trim()) {
      setError("Silakan masukkan teks yang ingin diringkas.");
      return;
    }
    if (inputType === "url" && !inputUrl.trim()) {
      setError("Silakan masukkan tautan URL yang valid.");
      return;
    }
    if (inputType === "file" && !fileContent.trim()) {
      setError("Silakan unggah dokumen yang valid dan pastikan teks berhasil terbaca terlebih dahulu.");
      return;
    }

    setIsLoading(true);
    setLoadingStep(
      inputType === "url" 
        ? "Mengunduh konten halaman web..." 
        : (inputType === "file" ? "Membaca teks dari dokumen terunggah..." : "Membaca isi teks dokumen...")
    );

    try {
      if (inputType === "url") {
        setTimeout(() => setLoadingStep("Mengekstrak teks utama dan membersihkan tag HTML..."), 1500);
      }
      setTimeout(() => setLoadingStep(`Menganalisis poin-poin penting menggunakan ${provider === "openrouter" ? "OpenRouter" : "Agentic AI"}...`), 3000);
      setTimeout(() => setLoadingStep("Menyusun ringkasan otomatis sesuai format..."), 4500);

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          text: inputType === "text" ? inputText : (inputType === "file" ? fileContent : undefined),
          url: inputType === "url" ? inputUrl : undefined,
          format,
          length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal memproses ringkasan teks.");
      }

      setResult({
        summary: data.summary,
        title: inputType === "file" && selectedFile ? selectedFile.name : data.title,
        charCountOriginal: data.charCountOriginal,
        charCountSummary: data.charCountSummary,
      });
    } catch (err: any) {
      setError(err.message || "Gagal menyambung ke server.");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setInputText("");
    setInputUrl("");
    setSelectedFile(null);
    setFileContent("");
    setParsingSuccess(false);
    setResult(null);
    setError(null);
  };

  // Calculate compression statistics
  const compressionRatio = result 
    ? Math.max(0, Math.round((1 - result.charCountSummary / result.charCountOriginal) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Kartu Input */}
      <div className="bg-[#1e1f20] rounded-2xl border border-[#2d2f31]/50 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Konfigurasi Ringkasan Otomatis</h2>
        </div>

        {/* Tipe Input */}
        <div className="flex border-b border-[#2d2f31]/60 mb-6">
          <button
            type="button"
            onClick={() => { setInputType("text"); setError(null); }}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition-all -mb-px cursor-pointer ${
              inputType === "text"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tulis/Tempel Teks</span>
          </button>
          <button
            type="button"
            onClick={() => { setInputType("url"); setError(null); }}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition-all -mb-px cursor-pointer ${
              inputType === "url"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Tautan URL Artikel</span>
          </button>
          <button
            type="button"
            onClick={() => { setInputType("file"); setError(null); }}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold border-b-2 transition-all -mb-px cursor-pointer ${
              inputType === "file"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <FileUp className="w-4 h-4" />
            <span>Unggah Dokumen</span>
          </button>
        </div>

        <form onSubmit={handleSummarize} className="space-y-6">
          {/* Kontrol format dan panjang */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Format Ringkasan */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">Format Hasil Ringkasan</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat("bullet")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    format === "bullet"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Daftar Poin
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("paragraph")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    format === "paragraph"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Paragraf Padat
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("brief")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    format === "brief"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Sangat Singkat
                </button>
              </div>
            </div>

            {/* Kedalaman / Panjang Ringkasan */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">Ketebalan / Kedalaman</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setLength("short")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    length === "short"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Pendek (~100 kata)
                </button>
                <button
                  type="button"
                  onClick={() => setLength("medium")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    length === "medium"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Menengah (~250 kata)
                </button>
                <button
                  type="button"
                  onClick={() => setLength("long")}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                    length === "long"
                      ? "bg-[#004a77]/60 border-transparent text-[#c2e7ff]"
                      : "bg-[#131314] border-[#2d2f31] text-slate-300 hover:bg-[#2d2f31]"
                  }`}
                >
                  Mendetail
                </button>
              </div>
            </div>
          </div>

          {/* Area Teks / URL / File Input */}
          <div className="space-y-2">
            {inputType === "text" ? (
              <>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-300">Teks Dokumen Asli</label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {inputText.length} karakter / {inputText.split(/\s+/).filter(Boolean).length} kata
                  </span>
                </div>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Tempel artikel panjang, esai, dokumen atau teks Anda di sini..."
                  rows={8}
                  disabled={isLoading}
                  className="w-full p-4 border border-[#2d2f31]/80 focus:border-blue-500 rounded-2xl text-sm focus:outline-hidden text-slate-100 bg-[#131314] focus:bg-[#131314]/80 transition-all resize-none placeholder-slate-500"
                />
              </>
            ) : inputType === "url" ? (
              <>
                <label className="text-xs font-bold text-slate-300 block">Tautan Alamat URL Situs Web</label>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Masukkan URL (Contoh: https://id.wikipedia.org/wiki/Kecerdasan_buatan)"
                  disabled={isLoading}
                  className="w-full p-4 border border-[#2d2f31]/80 focus:border-blue-500 rounded-2xl text-sm focus:outline-hidden text-slate-100 bg-[#131314] focus:bg-[#131314]/80 transition-all placeholder-slate-500"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sistem akan mengambil isi teks artikel utama dari web yang Anda sediakan dan merangkumnya secara langsung.
                </p>
              </>
            ) : (
              <>
                <label className="text-xs font-bold text-slate-300 block">Unggah Dokumen Pendukung</label>
                <input
                  type="file"
                  id="file-upload-input"
                  className="hidden"
                  accept=".txt,.md,.pdf,.docx,.csv,.json,.html,.xml"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                    dragActive 
                      ? "border-purple-500 bg-purple-500/10" 
                      : selectedFile 
                        ? "border-emerald-600/60 bg-emerald-950/10" 
                        : "border-[#2d2f31]/80 hover:border-blue-500 hover:bg-blue-500/5 bg-[#131314]"
                  }`}
                >
                  <label htmlFor="file-upload-input" className="w-full h-full flex flex-col items-center justify-center cursor-pointer py-4">
                    {isParsingFile ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-purple-400" />
                        <p className="text-sm font-medium text-slate-300">Mengurai isi dokumen...</p>
                        <p className="text-[11px] text-slate-500">Mengekstrak teks mentah untuk diringkas</p>
                      </div>
                    ) : selectedFile ? (
                      <div className="flex flex-col items-center gap-3 w-full max-w-md">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                          <FileUp className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-400 truncate max-w-xs">{selectedFile.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {formatFileSize(selectedFile.size)} • {selectedFile.name.split(".").pop()?.toUpperCase()}
                          </p>
                        </div>

                        {parsingSuccess && (
                          <div className="w-full bg-[#131314] rounded-xl border border-[#2d2f31]/40 p-3 text-left space-y-1.5 mt-2">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Pratinjau Teks Terbaca</span>
                              <span>{fileContent.length.toLocaleString()} Karakter</span>
                            </div>
                            <p className="text-[11px] text-slate-300 font-mono line-clamp-3 bg-[#1e1f20] p-2 rounded-lg leading-relaxed">
                              {fileContent || "[Kosong]"}
                            </p>
                            <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                              <Check className="w-3 h-3" /> Berhasil mengekstrak teks. Siap diringkas!
                            </p>
                          </div>
                        )}

                        <span className="text-[11px] text-blue-400 font-medium hover:underline mt-2">
                          Klik atau seret file lain untuk mengganti
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">
                            Tarik & lepas dokumen Anda di sini, atau <span className="text-blue-400 hover:underline">pilih file</span>
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Mendukung PDF, Word (.docx), TXT, Markdown, CSV, atau JSON (Maksimal 10MB)
                          </p>
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-2xl flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 px-5 bg-gradient-to-r from-blue-600 to-[#1a73e8] hover:from-blue-700 hover:to-blue-600 text-white rounded-full font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:bg-[#131314] disabled:text-slate-600 cursor-pointer active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin text-white" />
                  <span>{loadingStep || "Sedang memproses..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4.5 h-4.5 text-white" />
                  <span>Ringkas Otomatis</span>
                </>
              )}
            </button>

            {(inputText || inputUrl || result) && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="p-3 border border-[#2d2f31] hover:border-[#2d2f31]/80 bg-[#131314] text-slate-400 hover:text-white rounded-full transition-all cursor-pointer disabled:opacity-50"
                title="Atur Ulang"
              >
                <RotateCcw className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tampilan Hasil Ringkasan */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="space-y-4"
          >
            {/* Statistik Ringkasan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#1e1f20] border border-[#2d2f31]/50 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#131314] flex items-center justify-center text-slate-400">
                  <AlignLeft className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Teks Awal</div>
                  <div className="text-sm font-semibold text-white">{result.charCountOriginal.toLocaleString()} Karakter</div>
                </div>
              </div>

              <div className="bg-[#1e1f20] border border-[#2d2f31]/50 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#004a77]/30 flex items-center justify-center text-blue-400">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="text-[10px] text-blue-400 font-bold tracking-wider uppercase">Hasil Ringkasan</div>
                  <div className="text-sm font-semibold text-white">{result.charCountSummary.toLocaleString()} Karakter</div>
                </div>
              </div>

              <div className="bg-[#1e1f20] border border-[#2d2f31]/50 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/40 flex items-center justify-center text-emerald-400">
                  <TrendingDown className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase">Penyusutan Konten</div>
                  <div className="text-sm font-semibold text-emerald-400">-{compressionRatio}% Lebih Hemat</div>
                </div>
              </div>
            </div>

            {/* Kotak Hasil Ringkasan */}
            <div className="bg-[#1e1f20] rounded-2xl border border-[#2d2f31]/50 p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#2d2f31]/40">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">Hasil Ringkasan Terkompresi</div>
                  <h3 className="text-sm font-semibold text-white truncate max-w-md pr-2" title={result.title}>
                    {result.title}
                  </h3>
                </div>

                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#131314] hover:bg-[#2d2f31] border border-[#2d2f31] rounded-full transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-green-500">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>

              {/* Konten Ringkasan */}
              <div className="markdown-body break-words">
                <Markdown remarkPlugins={[remarkGfm]}>{result.summary}</Markdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
