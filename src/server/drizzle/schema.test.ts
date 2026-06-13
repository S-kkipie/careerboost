import { cosineDistance, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";

const TEST_USER_ID = "spec02-vector-test-user";

function vec(seed: number): number[] {
    // deterministic 768-dim unit-ish vector
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

describe("domain schema vectors", () => {
    afterAll(async () => {
        // cascade deletes the test jobs too
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("stores vector(768) and orders jobs by cosine distance", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Vector Test",
            email: "spec02-vector-test@example.com",
            emailVerified: false,
        });
        await db.insert(jobs).values([
            {
                userId: TEST_USER_ID,
                gmailMsgId: "m-near",
                dedupeHash: "h-near",
                titulo: "near",
                embedding: vec(0),
            },
            {
                userId: TEST_USER_ID,
                gmailMsgId: "m-far",
                dedupeHash: "h-far",
                titulo: "far",
                embedding: vec(5),
            },
        ]);

        const query = vec(0);
        const rows = await db
            .select({ titulo: jobs.titulo })
            .from(jobs)
            .where(eq(jobs.userId, TEST_USER_ID))
            .orderBy(cosineDistance(jobs.embedding, query))
            .limit(1);

        expect(rows[0]?.titulo).toBe("near");
    });
});
