import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    GmailApiError,
    GmailNotConnectedError,
    getGmailProfile,
    getGoogleAccessToken,
} from "@/server/services/gmail";

export const gmailRouter = new Elysia().get(
    "/gmail/profile",
    async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            const profile = await getGmailProfile(token);
            return { email: profile.emailAddress };
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
    },
);
