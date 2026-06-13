import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/drizzle/db";
import { account } from "@/server/drizzle/schemas/auth-schema";
import { GMAIL_READONLY_SCOPE } from "@/server/services/gmail";

export const meRouter = new Elysia().get("/me", async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
        return { user: null, gmailConnected: false };
    }
    const rows = await db
        .select({ scope: account.scope })
        .from(account)
        .where(
            and(
                eq(account.userId, session.user.id),
                eq(account.providerId, "google"),
            ),
        );
    const gmailConnected = rows.some((r) =>
        r.scope?.includes(GMAIL_READONLY_SCOPE),
    );
    return { user: session.user, gmailConnected };
});
