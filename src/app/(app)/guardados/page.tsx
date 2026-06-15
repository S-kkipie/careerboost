"use client";

import { Bookmark } from "lucide-react";
import { MatchCard } from "@/frontend/components/feed/match-card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { useSavedMatches, useSetMatchStatus } from "@/frontend/hooks/api";

export default function SavedPage() {
    const saved = useSavedMatches();
    const setStatus = useSetMatchStatus();
    const matches = saved.data?.matches ?? [];

    let body: React.ReactNode;
    if (saved.isPending) {
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
                        <Bookmark aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Aún no has guardado vacantes
                    </EmptyTitle>
                    <EmptyDescription>
                        Guarda una vacante desde el feed y aparecerá aquí.
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
            <h1 className="font-serif font-semibold text-foreground text-xl">
                Guardados
            </h1>
            {body}
        </div>
    );
}
