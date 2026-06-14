import {
    Bookmark,
    Briefcase,
    Building2,
    MapPin,
    Sparkles,
    X,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button, buttonVariants } from "@/frontend/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/frontend/components/ui/card";
import { Spinner } from "@/frontend/components/ui/spinner";
import {
    formatMatchPct,
    formatSalaryBadge,
    modalidadLabel,
} from "@/frontend/lib/format";

export interface MatchCardJob {
    titulo: string | null;
    empresa: string | null;
    modalidad: string | null;
    ubicacion: string | null;
    salario_min: number | null;
    salario_max: number | null;
    moneda: string | null;
    salario_periodo: string | null;
    salario_explicito: boolean;
    apply_link: string | null;
}

export interface MatchCardItem {
    id: string;
    rerank_score: number | null;
    explanation: string | null;
    job: MatchCardJob;
    status: string;
}

interface MatchCardProps {
    item: MatchCardItem;
    onSave: (id: string) => void;
    onDismiss: (id: string) => void;
    isPending: boolean;
}

export function MatchCard({
    item,
    onSave,
    onDismiss,
    isPending,
}: MatchCardProps) {
    const salary = formatSalaryBadge(item.job);
    const isSaved = item.status === "saved";

    return (
        <Card className="gap-0 py-0">
            <CardHeader className="px-5 pt-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground leading-snug">
                            {item.job.titulo}
                        </h3>
                        {item.job.empresa ? (
                            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground text-sm">
                                <Building2 className="size-3.5 shrink-0" />
                                {item.job.empresa}
                            </p>
                        ) : null}
                    </div>
                    <Badge
                        variant="default"
                        className="shrink-0 bg-primary text-primary-foreground"
                    >
                        <Sparkles className="size-3" />
                        {formatMatchPct(item.rerank_score)} match
                    </Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1">
                        <Briefcase className="size-3.5 shrink-0" />
                        {modalidadLabel(item.job.modalidad)}
                    </span>
                    {item.job.ubicacion ? (
                        <span className="flex items-center gap-1">
                            <MapPin className="size-3.5 shrink-0" />
                            {item.job.ubicacion}
                        </span>
                    ) : null}
                </div>

                <div className="mt-2">
                    <Badge variant={salary.variant}>{salary.label}</Badge>
                </div>
            </CardHeader>

            {item.explanation ? (
                <CardContent className="px-5 py-0">
                    <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">
                            ¿Por qué?{" "}
                        </span>
                        <span className="text-muted-foreground">
                            {item.explanation}
                        </span>
                    </div>
                </CardContent>
            ) : null}

            <CardFooter className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-5">
                {item.job.apply_link ? (
                    <a
                        href={item.job.apply_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({
                            variant: "default",
                            size: "sm",
                        })}
                    >
                        Postular
                    </a>
                ) : null}
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSave(item.id)}
                    disabled={isPending}
                >
                    <Bookmark className="size-3.5" />
                    {isSaved ? "Guardado ✓" : "Guardar"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismiss(item.id)}
                    disabled={isPending}
                >
                    <X className="size-3.5" />
                    Descartar
                </Button>
                {isPending ? <Spinner className="text-primary" /> : null}
            </CardFooter>
        </Card>
    );
}
