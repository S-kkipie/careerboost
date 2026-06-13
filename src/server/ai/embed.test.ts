import { describe, expect, it } from "vitest";
import { toEmbeddingVector } from "@/server/ai/embed";

describe("toEmbeddingVector", () => {
    it("returns the vector when it has 768 dimensions", () => {
        const v = Array.from({ length: 768 }, () => 0.1);
        expect(toEmbeddingVector(v)).toHaveLength(768);
    });

    it("throws when the vector is undefined", () => {
        expect(() => toEmbeddingVector(undefined)).toThrow(/768/);
    });

    it("throws when the vector has the wrong dimension", () => {
        expect(() => toEmbeddingVector([1, 2, 3])).toThrow(/768/);
    });
});
