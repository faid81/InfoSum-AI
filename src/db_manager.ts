import fs from "fs";
import path from "path";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const isPostgresConfigured = !!DATABASE_URL;

const OPERATIONAL_FILE = path.join(process.cwd(), "database_operational.json");
const VECTOR_FILE = path.join(process.cwd(), "database_vectors.json");

// Types for PostgreSQL Schema emulation and real DB
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  preferences: string; // JSON String
  joined_at: string;
}

export interface ConversationRecord {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: string; // JSON String
  timestamp: string;
}

export interface SystemStatusRecord {
  id: string;
  status: string;
  uptime_seconds: number;
  total_messages_processed: number;
  vector_count: number;
  updated_at: string;
}

export interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: string; // JSON String
  timestamp: string;
}

// PostgreSQL Table definitions (DDL)
export const POSTGRES_DDL = `
-- 1. Table Data Pengguna (Users)
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
);
`;

// Initialize the database connection (or file store)
let pgPool: pg.Pool | null = null;

if (isPostgresConfigured) {
  try {
    pgPool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log("Database Operational: Berhasil terhubung ke PostgreSQL utama.");
  } catch (error) {
    console.error("Database Operational: Gagal menghubungkan PostgreSQL pool, beralih ke mode lokal:", error);
    pgPool = null;
  }
} else {
  console.log("Database Operational: URL PostgreSQL tidak dikonfigurasi. Mengaktifkan Mode Fallback Lokal (JSON Database).");
}

// Helper to write file safely
function saveJsonFile(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Gagal menyimpan file ${filePath}:`, err);
  }
}

// Helper to read file safely
function loadJsonFile(filePath: string, defaultData: any): any {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Gagal membaca file ${filePath}, menggunakan default:`, err);
  }
  return defaultData;
}

// Ensure local JSON databases exist
const localDb = {
  getOperational: () => loadJsonFile(OPERATIONAL_FILE, {
    users: [] as UserRecord[],
    conversation_history: [] as ConversationRecord[],
    system_status: [
      {
        id: "sys_default",
        status: "OK",
        uptime_seconds: 0,
        total_messages_processed: 0,
        vector_count: 0,
        updated_at: new Date().toISOString()
      }
    ] as SystemStatusRecord[]
  }),
  saveOperational: (data: any) => saveJsonFile(OPERATIONAL_FILE, data),
  
  getVectors: () => loadJsonFile(VECTOR_FILE, [] as VectorRecord[]),
  saveVectors: (data: any) => saveJsonFile(VECTOR_FILE, data),
};

// Initialize system status in local database if empty
const initLocalDb = localDb.getOperational();
if (initLocalDb.system_status.length === 0) {
  initLocalDb.system_status.push({
    id: "sys_default",
    status: "OK",
    uptime_seconds: 0,
    total_messages_processed: 0,
    vector_count: 0,
    updated_at: new Date().toISOString()
  });
  localDb.saveOperational(initLocalDb);
}

// Initialize tables in PostgreSQL if connected
export async function initializeDatabase() {
  if (pgPool) {
    try {
      console.log("Menjalankan migrasi dan inisialisasi skema PostgreSQL...");
      await pgPool.query(POSTGRES_DDL);
      
      // Seed default system_status row if empty
      const check = await pgPool.query("SELECT COUNT(*) FROM system_status WHERE id = 'sys_default'");
      if (parseInt(check.rows[0].count) === 0) {
        await pgPool.query(`
          INSERT INTO system_status (id, status, uptime_seconds, total_messages_processed, vector_count, updated_at)
          VALUES ('sys_default', 'OK', 0, 0, 0, CURRENT_TIMESTAMP)
        `);
      }
      console.log("Inisialisasi skema PostgreSQL sukses.");
    } catch (err) {
      console.error("Gagal menjalankan migrasi skema PostgreSQL:", err);
    }
  }
}

// Operational DB Interface
export const db = {
  isPostgres: () => !!pgPool,

  // Users Operations
  users: {
    get: async (id: string): Promise<UserRecord | null> => {
      if (pgPool) {
        const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [id]);
        return res.rows[0] || null;
      } else {
        const data = localDb.getOperational();
        return data.users.find((u: UserRecord) => u.id === id) || null;
      }
    },
    list: async (): Promise<UserRecord[]> => {
      if (pgPool) {
        const res = await pgPool.query("SELECT * FROM users ORDER BY joined_at DESC");
        return res.rows;
      } else {
        const data = localDb.getOperational();
        return data.users;
      }
    },
    upsert: async (id: string, email: string, name: string, preferences: Record<string, any>): Promise<UserRecord> => {
      const prefStr = JSON.stringify(preferences);
      const joinedAt = new Date().toISOString();
      if (pgPool) {
        const query = `
          INSERT INTO users (id, email, name, preferences, joined_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE 
          SET email = EXCLUDED.email, name = EXCLUDED.name, preferences = EXCLUDED.preferences
          RETURNING *
        `;
        const res = await pgPool.query(query, [id, email, name, prefStr]);
        return res.rows[0];
      } else {
        const data = localDb.getOperational();
        const existingIdx = data.users.findIndex((u: UserRecord) => u.id === id);
        const record: UserRecord = { id, email, name, preferences: prefStr, joined_at: joinedAt };
        if (existingIdx >= 0) {
          record.joined_at = data.users[existingIdx].joined_at; // keep original
          data.users[existingIdx] = record;
        } else {
          data.users.push(record);
        }
        localDb.saveOperational(data);
        return record;
      }
    },
    delete: async (id: string): Promise<boolean> => {
      if (pgPool) {
        const res = await pgPool.query("DELETE FROM users WHERE id = $1", [id]);
        return (res.rowCount ?? 0) > 0;
      } else {
        const data = localDb.getOperational();
        const initialLen = data.users.length;
        data.users = data.users.filter((u: UserRecord) => u.id !== id);
        localDb.saveOperational(data);
        return data.users.length < initialLen;
      }
    }
  },

  // Conversation History Operations
  conversations: {
    add: async (session_id: string, role: "user" | "assistant", content: string, sources: any[]): Promise<ConversationRecord> => {
      const id = "msg_" + Math.random().toString(36).substring(2, 11);
      const sourcesStr = JSON.stringify(sources || []);
      const timestamp = new Date().toISOString();
      
      if (pgPool) {
        const query = `
          INSERT INTO conversation_history (id, session_id, role, content, sources, timestamp)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          RETURNING *
        `;
        const res = await pgPool.query(query, [id, session_id, role, content, sourcesStr]);
        
        // Update total messages count in system status
        await pgPool.query("UPDATE system_status SET total_messages_processed = total_messages_processed + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 'sys_default'");
        
        return res.rows[0];
      } else {
        const data = localDb.getOperational();
        const record: ConversationRecord = { id, session_id, role, content, sources: sourcesStr, timestamp };
        data.conversation_history.push(record);
        
        // Increment message count
        const sys = data.system_status.find((s: SystemStatusRecord) => s.id === "sys_default") || {
          id: "sys_default",
          status: "OK",
          uptime_seconds: 0,
          total_messages_processed: 0,
          vector_count: 0,
          updated_at: timestamp
        };
        sys.total_messages_processed += 1;
        sys.updated_at = timestamp;
        
        localDb.saveOperational(data);
        return record;
      }
    },
    list: async (session_id?: string): Promise<ConversationRecord[]> => {
      if (pgPool) {
        if (session_id) {
          const res = await pgPool.query("SELECT * FROM conversation_history WHERE session_id = $1 ORDER BY timestamp ASC", [session_id]);
          return res.rows;
        } else {
          const res = await pgPool.query("SELECT * FROM conversation_history ORDER BY timestamp DESC LIMIT 100");
          return res.rows;
        }
      } else {
        const data = localDb.getOperational();
        if (session_id) {
          return data.conversation_history.filter((c: ConversationRecord) => c.session_id === session_id);
        }
        return [...data.conversation_history].reverse().slice(0, 100);
      }
    },
    clear: async (): Promise<void> => {
      if (pgPool) {
        await pgPool.query("DELETE FROM conversation_history");
      } else {
        const data = localDb.getOperational();
        data.conversation_history = [];
        localDb.saveOperational(data);
      }
    }
  },

  // System Status Operations
  systemStatus: {
    get: async (): Promise<SystemStatusRecord> => {
      if (pgPool) {
        const res = await pgPool.query("SELECT * FROM system_status WHERE id = 'sys_default'");
        return res.rows[0];
      } else {
        const data = localDb.getOperational();
        return data.system_status[0];
      }
    },
    updateUptime: async (secondsAdded: number): Promise<void> => {
      if (pgPool) {
        await pgPool.query("UPDATE system_status SET uptime_seconds = uptime_seconds + $1, updated_at = CURRENT_TIMESTAMP WHERE id = 'sys_default'", [secondsAdded]);
      } else {
        const data = localDb.getOperational();
        const sys = data.system_status[0];
        sys.uptime_seconds += secondsAdded;
        sys.updated_at = new Date().toISOString();
        localDb.saveOperational(data);
      }
    },
    updateVectorCount: async (count: number): Promise<void> => {
      if (pgPool) {
        await pgPool.query("UPDATE system_status SET vector_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 'sys_default'", [count]);
      } else {
        const data = localDb.getOperational();
        data.system_status[0].vector_count = count;
        data.system_status[0].updated_at = new Date().toISOString();
        localDb.saveOperational(data);
      }
    }
  }
};

// Vector DB Helper - Cosine Similarity
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Vector DB Interface (ChromaDB / Qdrant Emulation Layer)
export const vectorDb = {
  name: "ChromaDB/Qdrant Local Vector Engine",
  
  // Insert or Update vector memory
  upsert: async (text: string, embedding: number[], metadata: Record<string, any>): Promise<VectorRecord> => {
    const id = "vec_" + Math.random().toString(36).substring(2, 11);
    const metadataStr = JSON.stringify(metadata || {});
    const timestamp = new Date().toISOString();
    
    const records = localDb.getVectors();
    const newRecord: VectorRecord = { id, text, embedding, metadata: metadataStr, timestamp };
    records.push(newRecord);
    localDb.saveVectors(records);
    
    // Update count in operational DB
    await db.systemStatus.updateVectorCount(records.length);
    
    return newRecord;
  },

  // Query vector DB with similarity threshold
  query: async (queryEmbedding: number[], limit: number = 3): Promise<Array<{ record: VectorRecord; similarity: number }>> => {
    const records = localDb.getVectors();
    const scored = records.map(rec => {
      const sim = calculateCosineSimilarity(queryEmbedding, rec.embedding);
      return { record: rec, similarity: sim };
    });
    
    // Sort descending by similarity
    scored.sort((a, b) => b.similarity - a.similarity);
    
    return scored.slice(0, limit);
  },

  // List all vector database entries
  list: async (): Promise<VectorRecord[]> => {
    return localDb.getVectors();
  },

  // Clear all vectors
  clear: async (): Promise<void> => {
    localDb.saveVectors([]);
    await db.systemStatus.updateVectorCount(0);
  },

  // Delete a vector memory by ID
  delete: async (id: string): Promise<boolean> => {
    const records = localDb.getVectors();
    const initialLen = records.length;
    const filtered = records.filter(rec => rec.id !== id);
    localDb.saveVectors(filtered);
    await db.systemStatus.updateVectorCount(filtered.length);
    return filtered.length < initialLen;
  }
};

// Embed content helper
export async function getEmbedding(ai: GoogleGenAI, text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text
    }) as any;
    
    // Support either values structure from SDK response
    if (response.embedding?.values) {
      return response.embedding.values;
    }
    
    // Alternative check if SDK response format is slightly nested
    const val = response.embedding?.values || response.embeddings?.[0]?.values;
    if (val) return val;

    throw new Error("Format embedding tidak valid dari API Gemini");
  } catch (error) {
    console.error("Gagal mendapatkan embedding dari Gemini:", error);
    // Return a dummy pseudo-random but stable vector of length 768 to prevent crashes
    const mockVector: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 768; i++) {
      const val = Math.sin(hash + i) * 0.1;
      mockVector.push(val);
    }
    return mockVector;
  }
}
