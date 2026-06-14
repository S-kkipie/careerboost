import { config } from "dotenv";

// Side-effect module: load .env.local BEFORE any env-reading module (e.g.
// @/server/drizzle/db, @/config/env) is evaluated. Import this FIRST.
config({ path: ".env.local" });
