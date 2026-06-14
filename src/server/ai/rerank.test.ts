import { describe, expect, it } from "vitest";
import { parseRerank } from "@/server/ai/rerank";

const VALID = JSON.stringify({
    results: [
        {
            job_id: "job-1",
            match_score: 87,
            explanation:
                "Encaja con tu experiencia en backend y tu interés en datos.",
            flags: { skills_match: true, salario_transparente: true },
        },
        {
            job_id: "job-2",
            match_score: 40,
            explanation:
                "Relacionado pero pide más experiencia de la que tienes.",
            flags: { skills_match: false, salario_transparente: false },
        },
    ],
});

describe("parseRerank", () => {
    it("parses a valid rerank response into an array of items", () => {
        const items = parseRerank(VALID);
        expect(items).toHaveLength(2);
        expect(items[0]?.job_id).toBe("job-1");
        expect(items[0]?.match_score).toBe(87);
        expect(items[0]?.flags.skills_match).toBe(true);
    });

    it("throws when an item is missing a required field", () => {
        const bad = JSON.stringify({
            results: [{ job_id: "x", match_score: 50 }],
        });
        expect(() => parseRerank(bad)).toThrow();
    });

    it("throws when results is not an array", () => {
        const bad = JSON.stringify({ results: "nope" });
        expect(() => parseRerank(bad)).toThrow();
    });
});
