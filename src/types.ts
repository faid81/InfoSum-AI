export interface SearchSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SearchSource[];
}

export type ActiveTab = "chat" | "summarize" | "database";

export type SummaryFormat = "bullet" | "paragraph" | "brief";

export type SummaryLength = "short" | "medium" | "long";

export interface SummarizeResult {
  summary: string;
  title: string;
  charCountOriginal: number;
  charCountSummary: number;
}
