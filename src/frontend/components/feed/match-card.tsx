import { Badge } from "@/frontend/components/ui/badge";
import { Button, buttonClasses } from "@/frontend/components/ui/button";
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
    const ubicacionSuffix = item.job.ubicacion
        ? ` · ${item.job.ubicacion}`
        : "";

    return (
        <article className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-foreground">
                        {item.job.titulo}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        {item.job.empresa ? `${item.job.empresa} · ` : ""}
                        {modalidadLabel(item.job.modalidad)}
                        {ubicacionSuffix}
                    </p>
                </div>
                <Badge variant="default">
                    match {formatMatchPct(item.rerank_score)}
                </Badge>
            </div>

            <div className="mt-3">
                <Badge variant={salary.variant}>{salary.label}</Badge>
            </div>

            {item.explanation ? (
                <p className="mt-3 text-foreground text-sm">
                    <span className="font-medium">
                        Por qué te lo recomendamos:{" "}
                    </span>
                    {item.explanation}
                </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {item.job.apply_link ? (
                    <a
                        href={item.job.apply_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("primary", "sm")}
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
                    {isSaved ? "Guardado ✓" : "Guardar"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismiss(item.id)}
                    disabled={isPending}
                >
                    Descartar
                </Button>
                {isPending ? <Spinner className="text-primary" /> : null}
            </div>
        </article>
    );
}
