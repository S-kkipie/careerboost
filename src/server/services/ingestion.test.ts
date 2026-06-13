import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import {
    buildJobEmbeddingText,
    coerceIsoDate,
    getLastIngestionRun,
    persistJob,
    toIsoDate,
} from "@/server/services/ingestion";

const TEST_USER_ID = "spec04-ingestion-test-user";

function fakeEmbedding(): number[] {
    return Array.from({ length: 768 }, () => 0.02);
}

function jobRow(overrides: Partial<typeof jobs.$inferInsert>) {
    return {
        userId: TEST_USER_ID,
        gmailMsgId: "msg-1",
        titulo: "Backend Dev",
        empresa: "Acme",
        dedupeHash: "hash-a",
        embedding: fakeEmbedding(),
        ...overrides,
    };
}

describe("buildJobEmbeddingText", () => {
    it("joins titulo, requisitos and skills, skipping empties", () => {
        expect(
            buildJobEmbeddingText({
                titulo: "Backend Dev",
                requisitos: "Node, SQL",
                skills: ["Node", "SQL"],
            }),
        ).toBe("Backend Dev Node, SQL Node, SQL");
    });

    it("omits blank segments", () => {
        expect(
            buildJobEmbeddingText({
                titulo: "Backend Dev",
                requisitos: "",
                skills: [],
            }),
        ).toBe("Backend Dev");
    });
});

describe("coerceIsoDate", () => {
    it("keeps a valid YYYY-MM-DD", () => {
        expect(coerceIsoDate("2026-07-01")).toBe("2026-07-01");
    });
    it("rejects anything else", () => {
        expect(coerceIsoDate("01/07/2026")).toBeNull();
        expect(coerceIsoDate(null)).toBeNull();
    });
});

describe("toIsoDate", () => {
    it("converts an RFC-2822 header date to YYYY-MM-DD", () => {
        expect(toIsoDate("Sat, 13 Jun 2026 10:00:00 -0500")).toBe("2026-06-13");
    });
    it("returns null for null or junk", () => {
        expect(toIsoDate(null)).toBeNull();
        expect(toIsoDate("nope")).toBeNull();
    });
});

describe("persistJob + getLastIngestionRun", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("inserts a new job and dedupes on conflict", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Ingestion Test",
            email: "spec04-ingestion-test@example.com",
            emailVerified: false,
        });

        const first = await persistJob(jobRow({}));
        expect(first).toBe(true);

        // Same (userId, dedupeHash) -> conflict -> not inserted.
        const dupe = await persistJob(
            jobRow({ gmailMsgId: "msg-2", dedupeHash: "hash-a" }),
        );
        expect(dupe).toBe(false);

        // Same (userId, gmailMsgId) -> conflict -> not inserted.
        const sameMsg = await persistJob(
            jobRow({ gmailMsgId: "msg-1", dedupeHash: "hash-b" }),
        );
        expect(sameMsg).toBe(false);

        // A genuinely new job inserts.
        const second = await persistJob(
            jobRow({ gmailMsgId: "msg-3", dedupeHash: "hash-c" }),
        );
        expect(second).toBe(true);

        const rows = await db
            .select()
            .from(jobs)
            .where(eq(jobs.userId, TEST_USER_ID));
        expect(rows).toHaveLength(2);
    });

    it("returns null when the user has no ingestion runs", async () => {
        const run = await getLastIngestionRun("spec04-no-such-user");
        expect(run).toBeNull();
    });
});
