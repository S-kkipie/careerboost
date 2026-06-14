import { cosineDistance, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";

function vec(seed: number): number[] {
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

describe("domain schema vectors", () => {
    const HASHES = ["schema-near", "schema-far"];

    afterAll(async () => {
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("stores vector(768) and orders jobs by cosine distance", async () => {
        await db.insert(jobs).values([
            { dedupeHash: "schema-near", titulo: "near", embedding: vec(0) },
            { dedupeHash: "schema-far", titulo: "far", embedding: vec(5) },
        ]);

        const query = vec(0);
        const rows = await db
            .select({ titulo: jobs.titulo })
            .from(jobs)
            .where(inArray(jobs.dedupeHash, HASHES))
            .orderBy(cosineDistance(jobs.embedding, query))
            .limit(1);

        expect(rows[0]?.titulo).toBe("near");
    });
});
