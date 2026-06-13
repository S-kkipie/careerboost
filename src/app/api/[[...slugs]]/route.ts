// Default Node.js runtime — required for Drizzle (postgres driver). Do not set runtime = "edge".
import { app } from "@/server/router";

export const GET = app.handle;
export const POST = app.handle;
