"use client";

import { Spinner } from "@/frontend/components/ui/spinner";

interface SyncProgressProps {
    label: string;
}

export function SyncProgress({ label }: SyncProgressProps) {
    return (
        <div
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col items-center justify-center gap-4 py-16 text-center"
            role="status"
        >
            <Spinner className="size-10 text-brand" />
            <div
                aria-hidden="true"
                className="h-1.5 w-48 overflow-hidden rounded-full bg-muted"
            >
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
            </div>
            <p className="font-medium text-foreground text-sm">{label}</p>
        </div>
    );
}
