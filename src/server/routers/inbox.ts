import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    GmailApiError,
    GmailNotConnectedError,
    getGoogleAccessToken,
} from "@/server/services/gmail";
import { getStoredInbox, getUnprocessedInbox } from "@/server/services/inbox";
import {
    type InboxLiveItem,
    inboxLiveResponseSchema,
    inboxResponseSchema,
} from "./inbox.schema";

export const inboxRouter = new Elysia({ prefix: "/inbox" })
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const data = await getStoredInbox(session.user.id);
        // .parse() validates our mapping and yields the z.infer type so Eden
        // infers the frontend response type from the Zod schema.
        return inboxResponseSchema.parse(data);
    })
    .get("/live", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        // Only the Gmail-API calls are caught here; a ZodError from .parse()
        // below is a programming error and is left to bubble to onError (500).
        let unprocessed: InboxLiveItem[];
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            unprocessed = await getUnprocessedInbox(session.user.id, token);
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
        return inboxLiveResponseSchema.parse({ unprocessed });
    });
