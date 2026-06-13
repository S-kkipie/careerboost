import { resolve } from "node:path";
import { config } from "dotenv";

// Local dev secrets first; .env.example placeholders fill the gaps so the
// suite runs on a clean checkout / CI without a .env.local.
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env.example") });
