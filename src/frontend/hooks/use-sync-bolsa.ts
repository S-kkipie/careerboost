"use client";

import { useCallback, useState } from "react";
import { useRunIngestion, useRunMatching } from "@/frontend/hooks/api";
import { type SyncStage, syncStageLabel } from "@/frontend/lib/onboarding";

export interface UseSyncBolsa {
    stage: SyncStage;
    label: string;
    isRunning: boolean;
    error: unknown;
    start: () => void;
}

// Orchestrates the feed sync chain client-side: ingest (scan + AI extract) then
// match. Progress is staged, not streamed — `stage` drives the label; the run
// metrics surface via the existing useLastIngestion query, which the mutations
// invalidate on success.
export function useSyncBolsa(): UseSyncBolsa {
    const runIngestion = useRunIngestion();
    const runMatching = useRunMatching();
    const [stage, setStage] = useState<SyncStage>("idle");
    const [error, setError] = useState<unknown>(null);

    const start = useCallback(() => {
        // Ignore re-entry while a run is already in flight (guards a double-click
        // before the progress view takes over the body).
        if (stage === "ingesting" || stage === "matching") {
            return;
        }
        setError(null);
        setStage("ingesting");
        void (async () => {
            try {
                await runIngestion.mutateAsync();
                setStage("matching");
                await runMatching.mutateAsync();
                setStage("done");
            } catch (e) {
                setError(e);
                setStage("error");
            }
        })();
    }, [runIngestion, runMatching, stage]);

    return {
        stage,
        label: syncStageLabel(stage),
        isRunning: stage === "ingesting" || stage === "matching",
        error,
        start,
    };
}
