"use client";

import { Mail } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { pendingCountLabel } from "@/frontend/lib/format";

interface SyncPendingBannerProps {
    count: number;
    onSync: () => void;
}

export function SyncPendingBanner({ count, onSync }: SyncPendingBannerProps) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3">
            <Mail
                aria-hidden="true"
                className="size-5 flex-none text-brand-strong"
            />
            <p className="flex-1 text-foreground text-sm">
                {pendingCountLabel(count)}
            </p>
            <Button
                type="button"
                size="sm"
                onClick={onSync}
                className="flex-none"
            >
                Sincronizar ahora
            </Button>
        </div>
    );
}
