import { getLogger } from "@logtape/logtape";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { db } from "@/server/drizzle/db";
import { account, user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
import {
    buildDigestEmail,
    sendDigestEmail,
} from "@/server/services/digest-email";
import { GMAIL_READONLY_SCOPE } from "@/server/services/gmail";
import { refreshGoogleAccessToken } from "@/server/services/google-oauth";
import { runIngestion } from "@/server/services/ingestion";
import {
    type FeedItem,
    mapFeedRow,
    ProfileNotReadyError,
    RERANK_THRESHOLD,
    runMatching,
} from "@/server/services/matching";

export const DIGEST_LIMIT = 5;

export interface DigestUser {
    userId: string;
    email: string;
    refreshToken: string;
}

// Users with a Google account that (a) still has a refresh token and (b)
// granted gmail.readonly. Drizzle does not narrow nullable columns through a
// WHERE, so the JS guard re-checks refreshToken before pushing.
export async function listDigestUsers(): Promise<DigestUser[]> {
    const rows = await db
        .select({
            userId: account.userId,
            email: user.email,
            refreshToken: account.refreshToken,
            scope: account.scope,
        })
        .from(account)
        .innerJoin(user, eq(account.userId, user.id))
        .where(
            and(
                eq(account.providerId, "google"),
                isNotNull(account.refreshToken),
            ),
        );

    const out: DigestUser[] = [];
    for (const r of rows) {
        if (r.refreshToken && r.scope?.includes(GMAIL_READONLY_SCOPE)) {
            out.push({
                userId: r.userId,
                email: r.email,
                refreshToken: r.refreshToken,
            });
        }
    }
    return out;
}

// The digest = the user's still-"new", above-threshold matches, top-K by
// rerank score. Per-user isolation via the user_id predicate.
export async function getDigest(
    userId: string,
    limit: number = DIGEST_LIMIT,
): Promise<FeedItem[]> {
    const rows = await db
        .select({
            id: matches.id,
            rerankScore: matches.rerankScore,
            explanation: matches.explanation,
            status: matches.status,
            titulo: jobs.titulo,
            empresa: jobs.empresa,
            modalidad: jobs.modalidad,
            ubicacion: jobs.ubicacion,
            salarioMin: jobs.salarioMin,
            salarioMax: jobs.salarioMax,
            moneda: jobs.moneda,
            salarioPeriodo: jobs.salarioPeriodo,
            salarioExplicito: jobs.salarioExplicito,
            applyLink: jobs.applyLink,
        })
        .from(matches)
        .innerJoin(jobs, eq(matches.jobId, jobs.id))
        .where(
            and(
                eq(matches.userId, userId),
                eq(matches.status, "new"),
                gte(matches.rerankScore, RERANK_THRESHOLD),
            ),
        )
        .orderBy(desc(matches.rerankScore))
        .limit(limit);

    return rows.map(mapFeedRow);
}

// Mark every still-"new" match for the user as "seen". Scoped by user_id so a
// user cannot touch another user's matches. Returns how many were updated.
export async function markDigestSeen(userId: string): Promise<number> {
    const updated = await db
        .update(matches)
        .set({ status: "seen" })
        .where(and(eq(matches.userId, userId), eq(matches.status, "new")))
        .returning({ id: matches.id });
    return updated.length;
}

const logger = getLogger(["server", "digest"]);

export interface DigestRunResult {
    usersProcessed: number;
    usersWithNewMatches: number;
    emailsSent: number;
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// Cron orchestrator: for each eligible user, refresh the Google token, run
// ingestion + matching, then surface (and optionally email) the new digest.
// Per-user failures are logged and skipped. Never logs tokens or email bodies.
export async function runDigest(): Promise<DigestRunResult> {
    const users = await listDigestUsers();
    const result: DigestRunResult = {
        usersProcessed: 0,
        usersWithNewMatches: 0,
        emailsSent: 0,
    };
    const resendKey = ServerConfig.resend.apiKey;

    for (const u of users) {
        try {
            result.usersProcessed++;

            const { accessToken } = await refreshGoogleAccessToken({
                clientId: ServerConfig.google.clientId,
                clientSecret: ServerConfig.google.clientSecret,
                refreshToken: u.refreshToken,
            });

            await runIngestion({ userId: u.userId, accessToken });

            try {
                await runMatching({ userId: u.userId });
            } catch (e) {
                if (!(e instanceof ProfileNotReadyError)) {
                    throw e;
                }
                // No profile yet — nothing to match; still allow other users.
            }

            const digest = await getDigest(u.userId);
            if (digest.length === 0) {
                continue;
            }
            result.usersWithNewMatches++;

            if (resendKey) {
                const payload = buildDigestEmail({
                    to: u.email,
                    from: ServerConfig.resend.from,
                    items: digest,
                    appUrl: ServerConfig.baseUrl,
                });
                await sendDigestEmail(payload, resendKey);
                result.emailsSent++;
            }
        } catch (err) {
            logger.warn("digest user {userId} failed: {error}", {
                userId: u.userId,
                error: errMessage(err),
            });
        }
    }

    return result;
}
