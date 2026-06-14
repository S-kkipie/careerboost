"use client";

import type { ReactNode } from "react";
import { MatchCard } from "@/frontend/components/feed/match-card";
import { Button } from "@/frontend/components/ui/button";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import {
    useDigest,
    useMarkDigestSeen,
    useSetMatchStatus,
} from "@/frontend/hooks/api";

export default function DigestPage() {
    const digest = useDigest();
    const markSeen = useMarkDigestSeen();
    const setStatus = useSetMatchStatus();

    const matches = digest.data?.matches ?? [];

    let body: ReactNode;
    if (digest.isPending) {
        body = (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    } else if (matches.length === 0) {
        body = (
            <p className="text-muted-foreground text-sm">
                Estás al día. No hay nuevas oportunidades por ahora.
            </p>
        );
    } else {
        body = (
            <div className="flex flex-col gap-3">
                {matches.map((item) => (
                    <MatchCard
                        key={item.id}
                        item={item}
                        isPending={
                            setStatus.isPending &&
                            setStatus.variables?.id === item.id
                        }
                        onSave={(id) =>
                            setStatus.mutate({ id, status: "saved" })
                        }
                        onDismiss={(id) =>
                            setStatus.mutate({ id, status: "dismissed" })
                        }
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="font-semibold text-foreground text-xl">
                        Tu digest
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Más de 100 correos al mes, ahora en un solo resumen.
                    </p>
                </div>
                {matches.length > 0 ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markSeen.mutate()}
                        disabled={markSeen.isPending}
                    >
                        Marcar como visto
                    </Button>
                ) : null}
            </div>
            {body}
        </div>
    );
}
