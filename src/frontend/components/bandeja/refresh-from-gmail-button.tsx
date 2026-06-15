"use client";

import { RefreshCw } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";
import { errorCode } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

interface RefreshFromGmailButtonProps {
    isPending: boolean;
    error: unknown;
    onRefresh: () => void;
}

export function RefreshFromGmailButton({
    isPending,
    error,
    onRefresh,
}: RefreshFromGmailButtonProps) {
    if (errorCode(error) === "gmail_not_connected") {
        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void requestGmailAccess()}
            >
                Reconectar Gmail
            </Button>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onRefresh}
        >
            <RefreshCw
                aria-hidden="true"
                className={cn(isPending && "animate-spin")}
            />
            Actualizar desde Gmail
        </Button>
    );
}
