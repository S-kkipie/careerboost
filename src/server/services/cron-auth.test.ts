import { describe, expect, it } from "vitest";
import {
    constantTimeEqual,
    isAuthorizedCron,
} from "@/server/services/cron-auth";

describe("constantTimeEqual", () => {
    it("returns true for identical strings", () => {
        expect(constantTimeEqual("abcdef123456", "abcdef123456")).toBe(true);
    });

    it("returns false for different strings of equal length", () => {
        expect(constantTimeEqual("abcdef123456", "abcdef123457")).toBe(false);
    });

    it("returns false for different lengths", () => {
        expect(constantTimeEqual("short", "longer-value")).toBe(false);
    });
});

describe("isAuthorizedCron", () => {
    const secret = "super-secret-cron-value";

    it("accepts a correct Bearer header", () => {
        expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    });

    it("rejects a wrong secret", () => {
        expect(isAuthorizedCron("Bearer wrong-value-here-xx", secret)).toBe(
            false,
        );
    });

    it("rejects a missing header", () => {
        expect(isAuthorizedCron(null, secret)).toBe(false);
    });

    it("rejects the bare secret without the Bearer prefix", () => {
        expect(isAuthorizedCron(secret, secret)).toBe(false);
    });
});
