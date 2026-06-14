import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";

const TEST_USER_ID = "spec08-ingmsg-test-user";

describe("ingested_messages table", () => {
    afterAll(async () => {
        // FK user_id is ON DELETE CASCADE, so this clears the rows too.
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("stores per-user processed messages and is unique on (user, msg)", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "IngMsg Test",
            email: "spec08-ingmsg-test@example.com",
            emailVerified: false,
        });

        await db
            .insert(ingestedMessages)
            .values({
                userId: TEST_USER_ID,
                gmailMsgId: "m-1",
                jobId: null,
                noiseReason: "promo",
            })
            .onConflictDoNothing({
                target: [ingestedMessages.userId, ingestedMessages.gmailMsgId],
            });

        // Same (user, msg) -> conflict -> no second row.
        await db
            .insert(ingestedMessages)
            .values({ userId: TEST_USER_ID, gmailMsgId: "m-1", jobId: null })
            .onConflictDoNothing({
                target: [ingestedMessages.userId, ingestedMessages.gmailMsgId],
            });

        const rows = await db
            .select({ gmailMsgId: ingestedMessages.gmailMsgId })
            .from(ingestedMessages)
            .where(
                and(
                    eq(ingestedMessages.userId, TEST_USER_ID),
                    inArray(ingestedMessages.gmailMsgId, ["m-1", "m-2"]),
                ),
            );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.gmailMsgId).toBe("m-1");
    });
});
