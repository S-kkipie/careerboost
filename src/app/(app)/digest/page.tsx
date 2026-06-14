"use client";

import { CalendarCheck, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { MatchCard } from "@/frontend/components/feed/match-card";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Kicker } from "@/frontend/components/ui/kicker";
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
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <CalendarCheck aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">Estás al día</EmptyTitle>
                    <EmptyDescription>
                        No hay nuevas oportunidades por ahora. Te avisaremos.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
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
                <Kicker>Resumen diario</Kicker>
                <h1 className="font-serif font-bold text-foreground text-2xl">
                    Tu digest
                </h1>
                <p className="mt-1 font-medium text-brand-strong text-sm">
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
