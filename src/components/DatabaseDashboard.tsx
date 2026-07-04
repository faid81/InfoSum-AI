import React, { useState, useEffect } from "react";
import { 
  Database, UserPlus, Trash2, Shield, RefreshCw, Cpu, Activity, Clock, Search, Plus, Save, Server, Trash, BrainCircuit, Sparkles, AlertCircle, Edit2, Layers
} from "lucide-react";
import { motion } from "motion/react";

interface UserRecord {
  id: string;
  email: string;
  name: string;
  preferences: string;
  joined_at: string;
}

interface ConversationRecord {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string;
  timestamp: string;
}

interface SystemStatus {
  id: string;
  status: string;
  uptime_seconds: number;
  total_messages_processed: number;
  vector_count: number;
  updated_at: string;
}

interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: string;
  timestamp: string;
}

interface SearchResult {
  record: VectorRecord;
  similarity: number;
}

interface DatabaseDashboardProps {
  enableVector?: boolean;
  setEnableVector?: (val: boolean) => void;
}

export default function DatabaseDashboard({
  enableVector = true,
  setEnableVector
}: DatabaseDashboardProps) {
  // Navigation states inside dashboard
  const [dbTab, setDbTab] = useState<"status" | "users" | "conversations" | "vectors">("status");
  
  // Database content states
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isPostgres, setIsPostgres] = useState(false);
  const [vectorEngine, setVectorEngine] = useState("");
  const [vectors, setVectors] = useState<VectorRecord[]>([]);
  
  // Form/Search states
  const [newUser, setNewUser] = useState({ id: "", name: "", email: "", prefKey: "", prefVal: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [newVectorText, setNewVectorText] = useState("");
  const [vectorSearchQuery, setVectorSearchQuery] = useState("");
  const [vectorSearchResults, setVectorSearchResults] = useState<SearchResult[]>([]);
  const [isSearchingVectors, setIsSearchingVectors] = useState(false);
  
  // Loading & Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Custom confirmation states to replace window.confirm
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const [confirmingVectorId, setConfirmingVectorId] = useState<string | null>(null);
  const [confirmingClearConversations, setConfirmingClearConversations] = useState(false);
  const [confirmingClearVectors, setConfirmingClearVectors] = useState(false);

  // Fetch all database states
  const fetchDbStatus = async () => {
    try {
      const res = await fetch("/api/db/status");
      const data = await res.json();
      if (data.success) {
        setSystemStatus(data.status);
        setIsPostgres(data.is_postgres);
        setVectorEngine(data.vector_engine);
      }
    } catch (e) {
      console.error("Gagal memuat status sistem:", e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/db/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error("Gagal memuat pengguna:", e);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/db/history");
      const data = await res.json();
      if (data.success) {
        setConversations(data.history || []);
      }
    } catch (e) {
      console.error("Gagal memuat riwayat obrolan:", e);
    }
  };

  const fetchVectors = async () => {
    try {
      const res = await fetch("/api/db/vectors");
      const data = await res.json();
      if (data.success) {
        setVectors(data.vectors || []);
      }
    } catch (e) {
      console.error("Gagal memuat data vektor:", e);
    }
  };

  const refreshAll = async () => {
    setIsLoading(true);
    showFeedback("success", "Sinkronisasi database operasional & vektor berhasil!");
    await Promise.all([fetchDbStatus(), fetchUsers(), fetchConversations(), fetchVectors()]);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // 1. Operational DB - User Actions
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.id || !newUser.name || !newUser.email) {
      showFeedback("error", "Sediakan ID, Nama, dan Email.");
      return;
    }
    try {
      const preferences = newUser.prefKey ? { [newUser.prefKey]: newUser.prefVal } : {};
      const res = await fetch("/api/db/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          preferences
        })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(
          "success", 
          isEditing 
            ? `Data pengguna "${newUser.name}" berhasil diperbarui di PostgreSQL!` 
            : `Pengguna "${newUser.name}" berhasil disimpan di PostgreSQL!`
        );
        setNewUser({ id: "", name: "", email: "", prefKey: "", prefVal: "" });
        setIsEditing(false);
        fetchUsers();
        fetchDbStatus();
      } else {
        showFeedback("error", data.error || "Gagal menyimpan pengguna.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Gagal menyambung ke server.");
    }
  };

  const handleStartEdit = (user: UserRecord) => {
    setIsEditing(true);
    let parsedPref: Record<string, any> = {};
    try {
      parsedPref = typeof user.preferences === "string" ? JSON.parse(user.preferences) : user.preferences;
    } catch (e) {
      parsedPref = {};
    }
    const keys = Object.keys(parsedPref);
    const prefKey = keys[0] || "";
    const prefVal = prefKey ? String(parsedPref[prefKey]) : "";
    
    setNewUser({
      id: user.id,
      name: user.name,
      email: user.email,
      prefKey,
      prefVal
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setNewUser({ id: "", name: "", email: "", prefKey: "", prefVal: "" });
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const res = await fetch(`/api/db/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Pengguna berhasil dihapus.");
        fetchUsers();
        fetchDbStatus();
      } else {
        showFeedback("error", data.error || "Gagal menghapus.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Gagal menyambung ke server.");
    }
  };

  const handleDeleteVector = async (id: string) => {
    try {
      const res = await fetch(`/api/db/vectors/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Memori vektor berhasil dihapus.");
        setVectorSearchResults(prev => prev.filter(r => r.record.id !== id));
        fetchVectors();
        fetchDbStatus();
      } else {
        showFeedback("error", data.error || "Gagal menghapus memori vektor.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Gagal menyambung ke server.");
    }
  };

  // 2. Operational DB - Chat logs clear
  const handleClearConversations = async () => {
    try {
      const res = await fetch("/api/db/history/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Seluruh riwayat percakapan berhasil dihapus.");
        fetchConversations();
        fetchDbStatus();
      }
    } catch (err: any) {
      showFeedback("error", "Gagal menghapus riwayat.");
    }
  };

  // 3. Vector DB - Cosine Similarity Search
  const handleVectorSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vectorSearchQuery.trim()) return;
    setIsSearchingVectors(true);
    try {
      const res = await fetch("/api/db/vectors/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: vectorSearchQuery, limit: 5 })
      });
      const data = await res.json();
      if (data.success) {
        setVectorSearchResults(data.results || []);
        showFeedback("success", "Pencarian kemiripan kosinus sukses!");
      } else {
        showFeedback("error", data.error || "Gagal mencari vektor.");
      }
    } catch (err: any) {
      showFeedback("error", "Gagal memproses pencarian kontekstual.");
    } finally {
      setIsSearchingVectors(false);
    }
  };

  // 4. Vector DB - Manual memory insert
  const handleAddVector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVectorText.trim()) return;
    try {
      const res = await fetch("/api/db/vectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newVectorText,
          metadata: { input_source: "dashboard_manual", created_at: new Date().toISOString() }
        })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Memori teks berhasil di-embed menggunakan Agentic AI & disimpan di database vektor!");
        setNewVectorText("");
        fetchVectors();
        fetchDbStatus();
      } else {
        showFeedback("error", data.error || "Gagal menyimpan vektor.");
      }
    } catch (err: any) {
      showFeedback("error", "Gagal menyambung ke server.");
    }
  };

  const handleClearVectors = async () => {
    try {
      const res = await fetch("/api/db/vectors/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Database memori vektor dikosongkan.");
        setVectorSearchResults([]);
        fetchVectors();
        fetchDbStatus();
      }
    } catch (e) {
      showFeedback("error", "Gagal mengosongkan vektor.");
    }
  };

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}j ${mins}m ${secs}d`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#131314] px-6 py-6 md:px-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        
        {/* Header Dashboard */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2d2f31]/30 pb-6">
          <div>
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Database className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Pusat Integrasi Data</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Eksplorasi Basis Data & Memori Vektor</h1>
            <p className="text-[#c4c7c5] text-sm mt-1">
              Pantau skema operasional PostgreSQL dan pencarian memori kontekstual Qdrant/ChromaDB.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#202124] border border-[#2d2f31]/80 hover:bg-[#2d2f31]/50 text-white transition-all text-sm font-medium cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Sinkronisasi Ulang
            </button>
          </div>
        </div>

        {/* Notifikasi feedback */}
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
              feedback.type === "success" 
                ? "bg-green-950/40 border border-green-800/60 text-green-300" 
                : "bg-red-950/40 border border-red-800/60 text-red-300"
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </motion.div>
        )}

        {/* Tab Pemilihan Database */}
        <div className="flex border-b border-[#2d2f31]/30 gap-1 overflow-x-auto pb-px">
          {[
            { id: "status", label: "Status Sistem", icon: Activity },
            { id: "users", label: "Operational: Users", icon: UserPlus },
            { id: "conversations", label: "Operational: Chat Logs", icon: Clock },
            { id: "vectors", label: "Vector DB Memory", icon: BrainCircuit }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setDbTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                  dbTab === tab.id 
                    ? "border-blue-500 text-blue-400 bg-blue-500/5" 
                    : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/10"
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Konten Utama sesuai Tab yang dipilih */}
        <div className="bg-[#1e1f20] border border-[#2d2f31]/40 rounded-2xl overflow-hidden shadow-xl min-h-[450px]">
          
          {/* TAB 1: Status Sistem */}
          {dbTab === "status" && (
            <div className="p-6 flex flex-col gap-8">
              
              {/* Grid Kartu Stat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-[#131314] border border-[#2d2f31]/40">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Status Operational</div>
                  <div className="text-2xl font-bold text-green-400 flex items-center gap-2 mt-2">
                    <Shield className="w-5 h-5 text-green-500" />
                    <span>{systemStatus?.status || "OK"}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Seluruh sistem berjalan lancar.</p>
                </div>

                <div className="p-5 rounded-xl bg-[#131314] border border-[#2d2f31]/40">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Total Pesan Diproses</div>
                  <div className="text-2xl font-bold text-blue-400 flex items-center gap-2 mt-2">
                    <Cpu className="w-5 h-5 text-blue-500" />
                    <span>{systemStatus?.total_messages_processed ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Disimpan aman di PostgreSQL.</p>
                </div>

                <div className="p-5 rounded-xl bg-[#131314] border border-[#2d2f31]/40">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Ukuran Vektor Memori</div>
                  <div className="text-2xl font-bold text-purple-400 flex items-center gap-2 mt-2">
                    <BrainCircuit className="w-5 h-5 text-purple-500" />
                    <span>{systemStatus?.vector_count ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Memori jangka panjang kontekstual.</p>
                </div>

                <div className="p-5 rounded-xl bg-[#131314] border border-[#2d2f31]/40">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Server Uptime</div>
                  <div className="text-2xl font-bold text-amber-400 flex items-center gap-2 mt-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <span>{systemStatus ? formatUptime(systemStatus.uptime_seconds) : "0d"}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Waktu aktif sejak rilis wadah.</p>
                </div>
              </div>

              {/* Status Engine Details */}
              <div className="p-6 rounded-xl bg-[#131314] border border-[#2d2f31]/40 flex flex-col gap-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-blue-400" />
                  Konfigurasi Koneksi Basis Data Aktif
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 text-sm">
                  <div className="p-4 rounded-lg bg-[#1e1f20] border border-[#2d2f31]/30">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">Operational Database Mode:</div>
                    {isPostgres ? (
                      <div>
                        <span className="text-green-400 font-bold">PostgreSQL Terkoneksi (Utama)</span>
                        <p className="text-xs text-slate-400 mt-1">Menggunakan GCP Cloud SQL / Relational PostgreSQL Engine dengan konfigurasi SSL.</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-amber-400 font-bold">Mode Fallback Lokal (JSON SQL-Emulation)</span>
                        <p className="text-xs text-slate-400 mt-1">
                          Aktif karena Cloud SQL di-nonaktifkan. Berjalan secara lokal dalam container, menyimpan data di file <code className="text-slate-200">database_operational.json</code> dengan struktur skema yang sama persis seperti PostgreSQL.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-lg bg-[#1e1f20] border border-[#2d2f31]/30">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">Vector Database Engine:</div>
                    <span className="text-purple-400 font-bold">{vectorEngine || "Local Embed Cosine Similarity"}</span>
                    <p className="text-xs text-slate-400 mt-1">
                      Menggunakan model AI <code className="text-[#e3e3e3] bg-black/30 px-1 py-0.5 rounded">agentic-embedding</code> untuk mengekstraksi representasi semantik, dan menghitung relevansi dengan rumus Cosine Similarity untuk pencarian kontekstual.
                    </p>
                  </div>
                </div>
              </div>

              {/* DDL Schema Viewer */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-300">Skema SQL Migrasi (PostgreSQL DDL)</h3>
                </div>
                <pre className="p-4 rounded-xl bg-black/40 border border-[#2d2f31]/50 text-xs text-slate-300 font-mono overflow-x-auto max-h-[220px]">
{`-- 1. Table Data Pengguna (Users)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  preferences TEXT NOT NULL DEFAULT '{}', -- JSON String
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table Riwayat Percakapan (Conversation History)
CREATE TABLE IF NOT EXISTS conversation_history (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]', -- JSON String of SearchSources
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table Status Sistem (System Status)
CREATE TABLE IF NOT EXISTS system_status (
  id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(100) NOT NULL,
  uptime_seconds INT NOT NULL DEFAULT 0,
  total_messages_processed INT NOT NULL DEFAULT 0,
  vector_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`}
                </pre>
              </div>

            </div>
          )}

          {/* TAB 2: Operational Users */}
          {dbTab === "users" && (
            <div className="p-6 flex flex-col md:flex-row gap-6">
              
              {/* Form Input User Baru / Edit */}
              <div className="w-full md:w-80 shrink-0 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-[#2d2f31]/40 pb-6 md:pb-0 md:pr-6">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Edit2 className="w-4 h-4 text-amber-400" />
                      Edit Pengguna
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-blue-400" />
                      Tambah Pengguna Baru
                    </>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  {isEditing 
                    ? "Perbarui informasi data pengguna dan simpan ke PostgreSQL." 
                    : "Simpan data pengguna secara langsung ke tabel relasional SQL."}
                </p>

                <form onSubmit={handleAddUser} className="flex flex-col gap-3 text-sm mt-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">
                      ID Pengguna (Primary Key): {isEditing && <span className="text-amber-400 text-[10px] font-mono">(Tidak dapat diubah)</span>}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. user_101"
                      value={newUser.id}
                      onChange={e => setNewUser({...newUser, id: e.target.value})}
                      disabled={isEditing}
                      className={`w-full px-3 py-2 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 ${isEditing ? "opacity-50 cursor-not-allowed" : ""}`}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Nama Lengkap:</label>
                    <input
                      type="text"
                      placeholder="e.g. Budi Santoso"
                      value={newUser.name}
                      onChange={e => setNewUser({...newUser, name: e.target.value})}
                      className="w-full px-3 py-2 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Email:</label>
                    <input
                      type="email"
                      placeholder="e.g. budi@domain.com"
                      value={newUser.email}
                      onChange={e => setNewUser({...newUser, email: e.target.value})}
                      className="w-full px-3 py-2 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Preferensi Kunci & Nilai (Opsional):</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Kunci (e.g. tema)"
                        value={newUser.prefKey}
                        onChange={e => setNewUser({...newUser, prefKey: e.target.value})}
                        className="w-1/2 px-2.5 py-1.5 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-xs text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Nilai (e.g. gelap)"
                        value={newUser.prefVal}
                        onChange={e => setNewUser({...newUser, prefVal: e.target.value})}
                        className="w-1/2 px-2.5 py-1.5 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    {isEditing && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="w-1/3 border border-[#2d2f31] hover:bg-[#2d2f31]/40 text-slate-300 font-medium py-2 rounded-lg transition-all text-center cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                    <button
                      type="submit"
                      className={`font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isEditing 
                          ? "w-2/3 bg-amber-600 hover:bg-amber-500 text-white" 
                          : "w-full bg-blue-600 hover:bg-blue-500 text-white"
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span>{isEditing ? "Simpan Perubahan" : "Simpan User"}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Daftar User di Table */}
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-semibold text-white">Daftar Pengguna PostgreSQL</h3>
                  <span className="text-xs bg-[#131314] border border-[#2d2f31]/60 px-2 py-1 rounded text-slate-400 font-medium">
                    {users.length} record ditemukan
                  </span>
                </div>

                <div className="flex-1 min-w-0 border border-[#2d2f31]/30 rounded-xl overflow-hidden bg-[#131314]/50">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm text-slate-300">
                      <thead className="bg-[#131314] text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-[#2d2f31]/40">
                        <tr>
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Nama</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Preferensi</th>
                          <th className="px-4 py-3">Waktu Gabung</th>
                          <th className="px-4 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2d2f31]/20">
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-10 text-slate-500">
                              Belum ada data pengguna. Tambahkan melalui form sebelah kiri!
                            </td>
                          </tr>
                        ) : (
                          users.map(user => (
                            <tr key={user.id} className="hover:bg-slate-800/10">
                              <td className="px-4 py-3 font-mono text-xs text-slate-300 font-semibold">{user.id}</td>
                              <td className="px-4 py-3 font-medium text-white">{user.name}</td>
                              <td className="px-4 py-3 text-slate-400">{user.email}</td>
                              <td className="px-4 py-3">
                                <span className="text-[11px] font-mono bg-black/30 text-blue-400 px-1.5 py-0.5 rounded">
                                  {user.preferences}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400">
                                {new Date(user.joined_at).toLocaleString("id-ID")}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {confirmingUserId === user.id ? (
                                  <div className="flex items-center justify-end gap-1.5 animate-fade-in">
                                    <span className="text-[10px] text-red-400 font-semibold">Yakin?</span>
                                    <button
                                      onClick={() => {
                                        handleDeleteUser(user.id);
                                        setConfirmingUserId(null);
                                      }}
                                      className="px-2 py-0.5 text-[10px] bg-red-600 hover:bg-red-500 text-white rounded font-bold cursor-pointer transition-all"
                                    >
                                      Ya
                                    </button>
                                    <button
                                      onClick={() => setConfirmingUserId(null)}
                                      className="px-2 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-bold cursor-pointer transition-all"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleStartEdit(user)}
                                      className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-[#2d2f31]/40 transition-all cursor-pointer"
                                      title="Edit Pengguna"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setConfirmingUserId(user.id)}
                                      className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#2d2f31]/40 transition-all cursor-pointer"
                                      title="Hapus"
                                    >
                                      <Trash2 className="w-4.5 h-4.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: Operational Chat Logs */}
          {dbTab === "conversations" && (
            <div className="p-6 flex flex-col gap-4">
              
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-semibold text-white">Log Percakapan Relasional (PostgreSQL)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mencatat seluruh percakapan yang masuk secara real-time di tabel <code className="text-slate-200 bg-black/20 px-1 rounded">conversation_history</code>.
                  </p>
                </div>
                {conversations.length > 0 && (
                  <div className="flex items-center">
                    {confirmingClearConversations ? (
                      <div className="flex items-center gap-1.5 bg-red-950/20 border border-red-900/40 py-1.5 px-2.5 rounded-lg animate-fade-in">
                        <span className="text-[10px] text-red-300 font-semibold uppercase tracking-wide">Yakin hapus log?</span>
                        <button
                          onClick={() => {
                            handleClearConversations();
                            setConfirmingClearConversations(false);
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-md transition-all cursor-pointer"
                        >
                          Ya
                        </button>
                        <button
                          onClick={() => setConfirmingClearConversations(false)}
                          className="px-2.5 py-1 text-[10px] font-bold text-slate-300 bg-[#2d2f31] hover:bg-slate-700 rounded-md transition-all cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingClearConversations(true)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-white border border-red-950 hover:bg-red-950/40 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash className="w-3.5 h-3.5" />
                        Kosongkan Log
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 border border-[#2d2f31]/30 rounded-xl overflow-hidden bg-[#131314]/30 max-h-[380px] overflow-y-auto">
                <div className="flex flex-col divide-y divide-[#2d2f31]/30">
                  {conversations.length === 0 ? (
                    <div className="py-20 text-center text-slate-500">
                      Belum ada obrolan yang tersimpan di basis data operasional. Mulailah obrolan di tab pencarian!
                    </div>
                  ) : (
                    conversations.map(conv => (
                      <div key={conv.id} className="p-4 flex flex-col gap-1 hover:bg-[#131314]/40 text-sm">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                              conv.role === "user" 
                                ? "bg-blue-950/60 text-blue-300 border border-blue-900/40" 
                                : "bg-purple-950/60 text-purple-300 border border-purple-900/40"
                            }`}>
                              {conv.role}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">[Session ID: {conv.session_id}]</span>
                          </div>
                          <span className="text-slate-500">{new Date(conv.timestamp).toLocaleString("id-ID")}</span>
                        </div>
                        <p className="text-white whitespace-pre-wrap mt-0.5 leading-relaxed">{conv.content}</p>
                        {(() => {
                          if (!conv.sources || conv.sources === "[]" || conv.sources === "{}") return null;
                          let parsedSources: any[] = [];
                          let parsedModel: string | undefined = undefined;
                          try {
                            const parsed = JSON.parse(conv.sources);
                            if (Array.isArray(parsed)) {
                              parsedSources = parsed;
                            } else if (parsed && typeof parsed === "object") {
                              parsedSources = parsed.sources || [];
                              parsedModel = parsed.model;
                            }
                          } catch (e) {
                            return null;
                          }

                          return (
                            <div className="mt-2 text-xs flex flex-col gap-1.5">
                              {parsedSources.length > 0 && (
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="text-slate-500 font-medium">Sumber:</span>
                                  {parsedSources.map((src: any, idx: number) => (
                                    <a 
                                      key={idx}
                                      href={src.url} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-blue-400 hover:underline font-mono text-[11px]"
                                    >
                                      {src.title || "Tautan"}
                                    </a>
                                  ))}
                                </div>
                              )}
                              {parsedModel && (
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <span className="text-slate-500 font-medium text-[11px]">Model AI:</span>
                                  <span className="font-mono text-[10px] text-purple-300 bg-purple-950/20 border border-purple-900/40 px-2 py-0.5 rounded-full">
                                    {parsedModel}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: Vector DB Memory */}
          {dbTab === "vectors" && (
            <div className="p-6 flex flex-col md:flex-row gap-6">
              
              {/* Form Input Memori Vektor Baru & Cari Vektor */}
              <div className="w-full md:w-80 shrink-0 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-[#2d2f31]/40 pb-6 md:pb-0 md:pr-6">
                
                {/* Pengaturan Memori Jangka Panjang Vektor */}
                <div className="bg-[#131314] rounded-2xl p-4.5 border border-purple-900/30 space-y-3 shadow-md">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <Layers className="w-4 h-4" />
                      Status Memori Vektor
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-300 font-medium">Pencarian Vektor (Cosine)</span>
                    <button
                      onClick={() => setEnableVector?.(!enableVector)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex items-center cursor-pointer ${
                        enableVector ? "bg-purple-600 justify-end" : "bg-slate-700 justify-start"
                      }`}
                      title={enableVector ? "Memori Jangka Panjang Aktif" : "Memori Jangka Panjang Nonaktif"}
                    >
                      <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Bila diaktifkan, asisten akan otomatis mengingat konteks percakapan lampau menggunakan kecocokan representasi semantik di basis data vektor.
                  </p>
                </div>

                {/* Cari Memori Kontekstual (Similarity) */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-purple-400" />
                    Pencarian Kontekstual Vektor
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cari memori paling mirip berdasarkan kemiripan representasi matematis (Cosine Similarity).
                  </p>
                  
                  <form onSubmit={handleVectorSearch} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ketik topik memori..."
                      value={vectorSearchQuery}
                      onChange={e => setVectorSearchQuery(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSearchingVectors}
                      className="px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-all flex items-center justify-center cursor-pointer"
                    >
                      <Sparkles className="w-4.5 h-4.5" />
                    </button>
                  </form>
                </div>

                {/* Tambah Memori Vektor Manual */}
                <div className="flex flex-col gap-3 pt-4 border-t border-[#2d2f31]/30">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-purple-400" />
                    Tambah Memori Jangka Panjang
                  </h3>
                  <p className="text-xs text-slate-400">
                    Kirim memori eksplisit. Kalimat akan secara otomatis di-embed dengan model <code className="text-[10px] bg-black/40 px-1 py-0.5 rounded text-purple-300">agentic-embedding</code>.
                  </p>

                  <form onSubmit={handleAddVector} className="flex flex-col gap-2 mt-1">
                    <textarea
                      placeholder="e.g. Nama pengguna adalah Budi. Budi menyukai visualisasi data interaktif menggunakan D3.js dan Recharts."
                      rows={3}
                      value={newVectorText}
                      onChange={e => setNewVectorText(e.target.value)}
                      className="w-full px-3 py-2 bg-[#131314] border border-[#2d2f31]/60 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Simpan Memori Jangka Panjang
                    </button>
                  </form>
                </div>

              </div>

              {/* Daftar Vektor & Hasil Pencarian */}
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                
                {/* TAMPILAN HASIL PENCARIAN VEKTOR (Bila ada) */}
                {vectorSearchResults.length > 0 && (
                  <div className="flex flex-col gap-3 p-4 rounded-xl bg-purple-950/20 border border-purple-900/50">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold text-purple-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Hasil Pencarian Kontekstual (Urutan Relevansi)
                      </h4>
                      <button 
                        onClick={() => setVectorSearchResults([])}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Tutup Hasil
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-1">
                      {vectorSearchResults.map((res, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-[#131314] border border-purple-900/30 text-xs">
                          <div className="flex justify-between items-center text-slate-400 mb-1.5">
                            <span className="font-semibold text-purple-400 flex items-center gap-1">
                              Kemiripan Kosinus: {(res.similarity * 100).toFixed(1)}%
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span>ID: {res.record.id}</span>
                              {confirmingVectorId === res.record.id ? (
                                <div className="flex items-center gap-1 animate-fade-in">
                                  <button
                                    onClick={() => {
                                      handleDeleteVector(res.record.id);
                                      setConfirmingVectorId(null);
                                    }}
                                    className="px-1.5 py-0.5 text-[9px] bg-red-600 hover:bg-red-500 text-white rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setConfirmingVectorId(null)}
                                    className="px-1.5 py-0.5 text-[9px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmingVectorId(res.record.id)}
                                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-[#2d2f31]/40 transition-all cursor-pointer"
                                  title="Hapus Memori"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-white leading-relaxed font-sans">{res.record.text}</p>
                          <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                            <span>Metode: {JSON.parse(res.record.metadata).sender || "system"}</span>
                            <span>{new Date(res.record.timestamp).toLocaleString("id-ID")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <h3 className="text-base font-semibold text-white">Seluruh Vektor Memori (Qdrant/Chroma Emulation)</h3>
                  <div className="flex gap-2 items-center">
                    {vectors.length > 0 && (
                      <>
                        {confirmingClearVectors ? (
                          <div className="flex items-center gap-1 bg-red-950/25 border border-red-900/40 px-2 py-1 rounded animate-fade-in">
                            <span className="text-[9px] text-red-300 font-bold uppercase tracking-wider">Hapus semua?</span>
                            <button
                              onClick={() => {
                                handleClearVectors();
                                setConfirmingClearVectors(false);
                              }}
                              className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-red-600 hover:bg-red-500 rounded transition-colors cursor-pointer"
                            >
                              Ya
                            </button>
                            <button
                              onClick={() => setConfirmingClearVectors(false)}
                              className="px-1.5 py-0.5 text-[9px] font-bold text-slate-300 bg-[#2d2f31] hover:bg-slate-700 rounded transition-colors cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingClearVectors(true)}
                            className="flex items-center gap-1 text-[11px] text-red-400 hover:text-white border border-red-950 hover:bg-red-950/30 px-2 py-1 rounded transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Hapus Semua Memori
                          </button>
                        )}
                      </>
                    )}
                    <span className="text-xs bg-[#131314] border border-[#2d2f31]/60 px-2 py-1 rounded text-slate-400 font-medium whitespace-nowrap">
                      {vectors.length} memori tersimpan
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 border border-[#2d2f31]/30 rounded-xl overflow-hidden bg-[#131314]/50 max-h-[300px] overflow-y-auto">
                  <div className="flex flex-col divide-y divide-[#2d2f31]/30">
                    {vectors.length === 0 ? (
                      <div className="py-16 text-center text-slate-500 text-sm">
                        Belum ada memori jangka panjang yang disimpan dalam database vektor. Mulailah obrolan untuk mengumpulkan memori!
                      </div>
                    ) : (
                      vectors.map(vec => (
                        <div key={vec.id} className="p-4 flex flex-col gap-1 hover:bg-[#131314]/40 text-xs text-slate-300">
                          <div className="flex justify-between items-center text-slate-400 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono bg-black/40 text-purple-300 px-1.5 py-0.5 rounded uppercase font-semibold text-[10px]">
                                {vec.id}
                              </span>
                              <span className="text-[10px]">Asal: {JSON.parse(vec.metadata).sender || "user"}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>{new Date(vec.timestamp).toLocaleTimeString("id-ID")}</span>
                              {confirmingVectorId === vec.id ? (
                                <div className="flex items-center gap-1 animate-fade-in">
                                  <button
                                    onClick={() => {
                                      handleDeleteVector(vec.id);
                                      setConfirmingVectorId(null);
                                    }}
                                    className="px-1.5 py-0.5 text-[9px] bg-red-600 hover:bg-red-500 text-white rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setConfirmingVectorId(null)}
                                    className="px-1.5 py-0.5 text-[9px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmingVectorId(vec.id)}
                                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-[#2d2f31]/40 transition-all cursor-pointer"
                                  title="Hapus Memori"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <p className="text-white font-sans text-sm mt-1 mb-1 leading-relaxed">{vec.text}</p>
                          
                          <div className="mt-2 text-[10px] text-slate-500 font-mono flex flex-wrap gap-x-4">
                            <span>Vektor Dimensi: {vec.embedding ? vec.embedding.length : 768} (values)</span>
                            <span>Embedding: [{vec.embedding ? vec.embedding.slice(0, 3).map(v => v.toFixed(4)).join(", ") : "..."} ...]</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
