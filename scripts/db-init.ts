import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const sql = postgres(url);
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
const [row] =
    await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
console.log(row ? "pgvector enabled" : "pgvector NOT enabled");
await sql.end();
