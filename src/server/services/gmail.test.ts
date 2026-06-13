import { describe, expect, it } from "vitest";
import {
    buildGmailQuery,
    DEFAULT_BOLSA_SENDERS,
    resolveSenders,
} from "@/server/services/gmail";

describe("buildGmailQuery", () => {
    it("joins senders with OR and applies the day window", () => {
        const q = buildGmailQuery(["a@x.com", "b@y.com"], 90);
        expect(q).toBe("from:(a@x.com OR b@y.com) newer_than:90d");
    });

    it("trims and drops blank senders", () => {
        const q = buildGmailQuery([" a@x.com ", ""], 30);
        expect(q).toBe("from:(a@x.com) newer_than:30d");
    });
});

describe("resolveSenders", () => {
    it("parses a comma-separated env string", () => {
        expect(resolveSenders("a@x.com, b@y.com")).toEqual([
            "a@x.com",
            "b@y.com",
        ]);
    });

    it("falls back to the default when undefined or empty", () => {
        expect(resolveSenders(undefined)).toEqual(DEFAULT_BOLSA_SENDERS);
        expect(resolveSenders("   ")).toEqual(DEFAULT_BOLSA_SENDERS);
    });
});
