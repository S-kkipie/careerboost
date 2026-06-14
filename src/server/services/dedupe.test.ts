import { describe, expect, it } from "vitest";
import {
    computeDedupeHash,
    normalizeTitle,
    weekKey,
} from "@/server/services/dedupe";

describe("normalizeTitle", () => {
    it("lowercases, strips accents and punctuation, collapses spaces", () => {
        expect(normalizeTitle("  Práctica   de  Backend! ")).toBe(
            "practica de backend",
        );
    });
});

describe("weekKey", () => {
    it("returns the same key for two dates in the same ISO week", () => {
        // 2026-06-08 (Mon) and 2026-06-13 (Sat) are the same ISO week.
        expect(weekKey("2026-06-08")).toBe(weekKey("2026-06-13"));
    });

    it("returns a different key for the next week", () => {
        expect(weekKey("2026-06-13")).not.toBe(weekKey("2026-06-15"));
    });

    it("returns a YYYY-Www formatted string", () => {
        expect(weekKey("2026-06-13")).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("returns 'nodate' for an unparseable date", () => {
        expect(weekKey("not-a-date")).toBe("nodate");
    });
});

describe("computeDedupeHash", () => {
    it("is stable for the same inputs", () => {
        const a = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        expect(a).toBe(b);
    });

    it("ignores case and accents in titulo/empresa", () => {
        const a = computeDedupeHash({
            titulo: "Práctica Backend",
            empresa: "Acmé",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "practica backend",
            empresa: "acme",
            weekDate: "2026-06-13",
        });
        expect(a).toBe(b);
    });

    it("differs when the title differs", () => {
        const a = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "Frontend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        expect(a).not.toBe(b);
    });

    it("handles a null weekDate without throwing", () => {
        const h = computeDedupeHash({
            titulo: "X",
            empresa: "Y",
            weekDate: null,
        });
        expect(h).toHaveLength(64);
    });

    it("collapses the same convocatoria across inboxes (same ISO week)", () => {
        // Two users receive the broadcast on different days of the same week;
        // with no deadline, the week-key fallback yields one identity.
        const inboxA = computeDedupeHash({
            titulo: "Analista de Datos",
            empresa: "UNSA",
            weekDate: "2026-06-08",
        });
        const inboxB = computeDedupeHash({
            titulo: "Analista de Datos",
            empresa: "UNSA",
            weekDate: "2026-06-13",
        });
        expect(inboxA).toBe(inboxB);
    });
});
