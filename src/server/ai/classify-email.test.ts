import { describe, expect, it } from "vitest";
import { parseClassifiedEmail } from "@/server/ai/classify-email";

describe("parseClassifiedEmail", () => {
    it("parses a job classification", () => {
        const c = parseClassifiedEmail(
            JSON.stringify({ is_job: true, noise_reason: "" }),
        );
        expect(c.is_job).toBe(true);
        expect(c.noise_reason).toBe("");
    });

    it("parses a noise classification with a reason", () => {
        const c = parseClassifiedEmail(
            JSON.stringify({ is_job: false, noise_reason: "evento" }),
        );
        expect(c.is_job).toBe(false);
        expect(c.noise_reason).toBe("evento");
    });

    it("throws when is_job is missing", () => {
        expect(() =>
            parseClassifiedEmail(JSON.stringify({ noise_reason: "x" })),
        ).toThrow();
    });
});
