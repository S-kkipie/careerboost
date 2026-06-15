import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import {
    buildJobEmbeddingText,
    coerceIsoDate,
    existingMsgIdsForTest,
    getLastIngestionRun,
    recordIngestedMessage,
    setJobEmbedding,
    toDate,
    toIsoDate,
    upsertJob,
} from "@/server/services/ingestion";

function fakeEmbedding(): number[] {
    return Array.from({ length: 768 }, () => 0.01);
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

describe("toDate", () => {
    it("parses a valid RFC date header to a Date", () => {
        const d = toDate("Mon, 02 Jun 2026 10:00:00 +0000");
        expect(d).toBeInstanceOf(Date);
        expect(d?.toISOString()).toBe("2026-06-02T10:00:00.000Z");
    });

    it("returns null for null or unparseable input", () => {
        expect(toDate(null)).toBeNull();
        expect(toDate("not a date")).toBeNull();
    });
});

const TEST_USER_ID = "spec08-ingestion-test-user";
const OTHER_USER_ID = "spec08-ingestion-other-user";

describe("upsertJob + recordIngestedMessage + getLastIngestionRun", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
        await db.delete(user).where(eq(user.id, OTHER_USER_ID));
        // Jobs are global (no user cascade) — delete the test rows explicitly.
        await db
            .delete(jobs)
            .where(inArray(jobs.dedupeHash, ["g-hash-a", "g-hash-b"]));
    });

    it("inserts a global job once and reuses it on the second inbox", async () => {
        await db.insert(user).values([
            {
                id: TEST_USER_ID,
                name: "Ingestion Test",
                email: "spec08-ingestion-test@example.com",
                emailVerified: false,
            },
            {
                id: OTHER_USER_ID,
                name: "Other Ingestion",
                email: "spec08-ingestion-other@example.com",
                emailVerified: false,
            },
        ]);

        const first = await upsertJob({
            titulo: "Backend Dev",
            empresa: "Acme",
            dedupeHash: "g-hash-a",
        });
        expect(first.isNew).toBe(true);
        expect(first.needsEmbedding).toBe(true);

        // Same convocatoria (same dedupe_hash) from another inbox -> reuse.
        // The first run never set an embedding, so it still needs one
        // (self-heal: a prior failed embed is retried, not skipped forever).
        const second = await upsertJob({
            titulo: "Backend Dev",
            empresa: "Acme",
            dedupeHash: "g-hash-a",
        });
        expect(second.isNew).toBe(false);
        expect(second.jobId).toBe(first.jobId);
        expect(second.needsEmbedding).toBe(true);

        // Once embedded, a later upsert no longer asks for re-embedding.
        await setJobEmbedding(first.jobId, fakeEmbedding());
        const third = await upsertJob({
            titulo: "Backend Dev",
            empresa: "Acme",
            dedupeHash: "g-hash-a",
        });
        expect(third.isNew).toBe(false);
        expect(third.needsEmbedding).toBe(false);

        const rows = await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(eq(jobs.dedupeHash, "g-hash-a"));
        expect(rows).toHaveLength(1);
    });

    it("records processed messages per user and skips already-seen ids", async () => {
        const { jobId } = await upsertJob({
            titulo: "Data Eng",
            empresa: "Beta",
            dedupeHash: "g-hash-b",
        });

        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m1",
            jobId,
            noiseReason: null,
        });
        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m2",
            jobId: null,
            noiseReason: "promo",
        });
        // Idempotent on (user, msg).
        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m1",
            jobId: null,
            noiseReason: null,
        });

        const seen = await existingMsgIdsForTest(TEST_USER_ID, [
            "m1",
            "m2",
            "m3",
        ]);
        expect(seen).toEqual(new Set(["m1", "m2"]));

        // Another user has not processed these.
        const other = await existingMsgIdsForTest(OTHER_USER_ID, ["m1", "m2"]);
        expect(other.size).toBe(0);
    });

    it("returns null when the user has no ingestion runs", async () => {
        const run = await getLastIngestionRun("spec08-no-such-user");
        expect(run).toBeNull();
    });
});
