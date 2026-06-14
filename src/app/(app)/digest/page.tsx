"use client";

import { CheckCircle2 } from "lucide-react";
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
            <div>
                <h1 className="font-bold text-foreground text-2xl">
                    Tu digest
                </h1>
                <p className="mt-1 font-medium text-primary text-sm">
                    Tus mejores oportunidades de hoy
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                    Hemos analizado más de 100 correos de reclutamiento para
                    entregarte solo lo que te interesa.
                </p>
            </div>

            {body}

            {matches.length > 0 ? (
                <div className="flex justify-center">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markSeen.mutate()}
                        disabled={markSeen.isPending}
                    >
                        <CheckCircle2 className="size-4" />
                        Marcar como visto
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
