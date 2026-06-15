// Destructive: TRUNCATE every table in the public schema (RESTART IDENTITY
// CASCADE). Wipes ALL data — jobs, matches, ingested messages, ingestion runs,
// profiles, and auth (users/sessions/accounts). Schema and the drizzle
// migration journal are left intact, so no re-migration is needed.
//
// Guarded: requires `--yes`. Run with `pnpm db:erase --yes`.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

if (!process.argv.includes("--yes")) {
    console.error("refusing to erase without --yes (this wipes ALL data)");
    process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
    throw new Error("DATABASE_URL is required");
}

const sql = postgres(url);

const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
`;
const tables = rows.map((r) => r.tablename);

if (tables.length === 0) {
    console.log("no tables in public schema; nothing to erase");
} else {
    const list = tables.map((t) => `"public"."${t}"`).join(", ");
    await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log(`erased ${tables.length} tables: ${tables.join(", ")}`);
}

await sql.end();
