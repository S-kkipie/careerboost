import { Skeleton } from "@/frontend/components/ui/skeleton";
import { buildImpactStats, type ImpactRun } from "@/frontend/lib/format";

interface ImpactPanelProps {
    run: ImpactRun | null;
    isLoading: boolean;
}

export function ImpactPanel({ run, isLoading }: ImpactPanelProps) {
    if (isLoading) {
        return <Skeleton className="h-28 w-full" />;
    }
    const stats = buildImpactStats(run);
    if (!stats) {
        return (
            <div className="rounded-lg border bg-card p-4 text-muted-foreground text-sm">
                Aún no has sincronizado tus correos.
            </div>
        );
    }
    return (
        <section className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold text-foreground">
                Tu bandeja, sin ruido
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="text-center">
                        <p className="font-bold text-2xl text-primary">
                            {stat.value}
                        </p>
                        <p className="text-muted-foreground text-xs">
                            {stat.label}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
