import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/frontend/components/ui/card";
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
            <Card>
                <CardContent className="text-muted-foreground text-sm">
                    Aún no has sincronizado tus correos.
                </CardContent>
            </Card>
        );
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle>Impacto de tu perfil</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {stats.map((stat) => (
                        <div key={stat.label} className="text-center">
                            <p className="font-bold text-2xl text-primary">
                                {stat.value}
                            </p>
                            <p className="mt-0.5 text-muted-foreground text-xs">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
