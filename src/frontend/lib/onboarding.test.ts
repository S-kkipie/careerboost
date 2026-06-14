import { describe, expect, it } from "vitest";
import {
    shouldRedirectToFeed,
    shouldRedirectToOnboarding,
    type SyncStage,
    syncStageLabel,
} from "@/frontend/lib/onboarding";

describe("syncStageLabel", () => {
    it("labels the ingest stage", () => {
        expect(syncStageLabel("ingesting")).toBe(
            "Escaneando tu bolsa y analizando con IA…",
        );
    });
    it("labels the match stage", () => {
        expect(syncStageLabel("matching")).toBe("Generando tus matches…");
    });
    it("labels done", () => {
        expect(syncStageLabel("done")).toBe("¡Listo!");
    });
    it("returns empty for idle/error (they render their own UI)", () => {
        const silent: SyncStage[] = ["idle", "error"];
        for (const s of silent) {
            expect(syncStageLabel(s)).toBe("");
        }
    });
});

describe("onboarding redirect policy", () => {
    it("sends users without a profile to onboarding", () => {
        expect(shouldRedirectToOnboarding(false)).toBe(true);
        expect(shouldRedirectToOnboarding(true)).toBe(false);
    });
    it("sends users with a profile to the feed", () => {
        expect(shouldRedirectToFeed(true)).toBe(true);
        expect(shouldRedirectToFeed(false)).toBe(false);
    });
});
