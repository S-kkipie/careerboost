import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    GmailApiError,
    GmailNotConnectedError,
    getGoogleAccessToken,
} from "@/server/services/gmail";
import { getLastIngestionRun, runIngestion } from "@/server/services/ingestion";

export const ingestRouter = new Elysia({ prefix: "/ingest" })
    .post("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            const run = await runIngestion({
                userId: session.user.id,
                accessToken: token,
            });
            return { run };
        } catch (e) {
            if (
                e instanceof GmailNotConnectedError ||
                (e instanceof GmailApiError &&
                    (e.status === 401 || e.status === 403))
            ) {
                return status(400, { code: "gmail_not_connected" });
            }
            throw e;
        }
    })
    .get("/last", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const run = await getLastIngestionRun(session.user.id);
        return { run };
    });
