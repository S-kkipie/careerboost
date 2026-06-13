import { GoogleGenAI } from "@google/genai";
import { ServerConfig } from "@/config/server-config";

export const genai = new GoogleGenAI({ apiKey: ServerConfig.gemini.apiKey });

export const GEMINI_FLASH_MODEL = "gemini-2.5-flash";
export const GEMINI_EMBED_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIM = 768;
