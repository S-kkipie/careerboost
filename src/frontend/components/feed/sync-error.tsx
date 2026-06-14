"use client";

import { AlertTriangle } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { errorCode, errorMessage } from "@/frontend/lib/format";

interface SyncErrorProps {
    error: unknown;
    onRetry: () => void;
}

export function SyncError({ error, onRetry }: SyncErrorProps) {
    const gmailIssue = errorCode(error) === "gmail_not_connected";
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia
                    variant="icon"
                    className="bg-destructive/10 text-destructive"
                >
                    <AlertTriangle aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="font-serif">
                    No pudimos sincronizar
                </EmptyTitle>
                <EmptyDescription>{errorMessage(error)}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                {gmailIssue ? (
                    <Button
                        type="button"
                        onClick={() => void requestGmailAccess()}
                    >
                        Reconectar Gmail
                    </Button>
                ) : (
                    <Button type="button" onClick={onRetry}>
                        Reintentar
                    </Button>
                )}
            </EmptyContent>
        </Empty>
    );
}
