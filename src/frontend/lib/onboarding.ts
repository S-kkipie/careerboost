// Pure onboarding/sync helpers. No React, no I/O — unit-tested and shared by the
// onboarding wizard, the feed sync flow, and the route guard.

export type SyncStage = "idle" | "ingesting" | "matching" | "done" | "error";

// Spanish label shown under the spinner during the feed sync chain. Empty for
// non-running stages (idle/error render their own UI).
export function syncStageLabel(stage: SyncStage): string {
    switch (stage) {
        case "ingesting":
            return "Escaneando tu bolsa y analizando con IA…";
        case "matching":
            return "Generando tus matches…";
        case "done":
            return "¡Listo!";
        default:
            return "";
    }
}

// Onboarding is "complete" once a profile exists — the CV-upload step is the
// only path that creates one. These two functions name the guard policy so the
// (app) guard and the onboarding page cannot drift apart.
export function shouldRedirectToOnboarding(hasProfile: boolean): boolean {
    return !hasProfile;
}

export function shouldRedirectToFeed(hasProfile: boolean): boolean {
    return hasProfile;
}
