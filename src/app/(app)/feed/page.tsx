"use client";

import { SearchX } from "lucide-react";
import { useQueryState } from "nuqs";
import { type ReactNode, Suspense } from "react";
import { FiltersBar } from "@/frontend/components/feed/filters-bar";
import { ImpactPanel } from "@/frontend/components/feed/impact-panel";
import { MatchCard } from "@/frontend/components/feed/match-card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import {
    useFeed,
    useLastIngestion,
    useSetMatchStatus,
} from "@/frontend/hooks/api";

function FeedInner() {
    const [soloConSalario, setSoloConSalario] = useQueryState(
        "solo_con_salario",
        { defaultValue: "" },
    );
    const [modalidad, setModalidad] = useQueryState("modalidad", {
        defaultValue: "",
    });
    const [ubicacion, setUbicacion] = useQueryState("ubicacion", {
        defaultValue: "",
    });

    const ingestion = useLastIngestion();
    const feed = useFeed({
        solo_con_salario: soloConSalario,
        modalidad,
        ubicacion,
    });
    const setStatus = useSetMatchStatus();

    const matches = feed.data?.matches ?? [];

    let feedSection: ReactNode;
    if (feed.isPending) {
        feedSection = (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    } else if (matches.length === 0) {
        feedSection = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <SearchX aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Sin vacantes que coincidan
                    </EmptyTitle>
                    <EmptyDescription>
                        Ajusta los filtros o sincroniza tus correos de nuevo.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    } else {
        feedSection = (
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
            <ImpactPanel
                run={ingestion.data?.run ?? null}
                isLoading={ingestion.isPending}
            />
            <FiltersBar
                soloConSalario={soloConSalario === "true"}
                modalidad={modalidad}
                ubicacion={ubicacion}
                onSoloConSalarioChange={(v) =>
                    setSoloConSalario(v ? "true" : "")
                }
                onModalidadChange={setModalidad}
                onUbicacionChange={setUbicacion}
            />
            {feedSection}
        </div>
    );
}

export default function FeedPage() {
    return (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <FeedInner />
        </Suspense>
    );
}
