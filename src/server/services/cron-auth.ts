import { timingSafeEqual } from "node:crypto";

// Length-checked constant-time string comparison. timingSafeEqual throws on
// unequal buffer lengths, so guard length first (and return false — a length
// mismatch is already a non-match).
export function constantTimeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
        return false;
    }
    return timingSafeEqual(ab, bb);
}

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set. Accept only an exact "Bearer <secret>" match.
export function isAuthorizedCron(
    authHeader: string | null,
    secret: string,
): boolean {
    if (!authHeader) {
        return false;
    }
    return constantTimeEqual(authHeader, `Bearer ${secret}`);
}
