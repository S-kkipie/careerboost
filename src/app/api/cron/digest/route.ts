// Default Node.js runtime — required for Drizzle (postgres driver). Do not set
// runtime = "edge". force-dynamic so the cron is never statically cached.
import { ServerConfig } from "@/config/server-config";
import { isAuthorizedCron } from "@/server/services/cron-auth";
import { runDigest } from "@/server/services/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (
        !isAuthorizedCron(
            request.headers.get("authorization"),
            ServerConfig.cron.secret,
        )
    ) {
        return Response.json({ code: "unauthorized" }, { status: 401 });
    }
    const result = await runDigest();
    return Response.json({ ok: true, ...result });
}
