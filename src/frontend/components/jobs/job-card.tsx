import {
    Briefcase,
    Building2,
    CalendarClock,
    ExternalLink,
    MapPin,
    Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/frontend/components/ui/card";
import {
    type DeadlineBadge as DeadlineBadgeType,
    formatDeadline,
    formatMatchPct,
    formatSalaryBadge,
    modalidadLabel,
} from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

export interface JobCardJob {
    titulo: string | null;
    empresa: string | null;
    modalidad: string | null;
    ubicacion: string | null;
    salario_min: number | null;
    salario_max: number | null;
    moneda: string | null;
    salario_periodo: string | null;
    salario_explicito: boolean;
    skills: string[] | null;
    apply_link: string | null;
    deadline: string | null;
}

export interface JobCardItem {
    job_id: string;
    match_id: string | null;
    rerank_score: number | null;
    status: string | null;
    job: JobCardJob;
}

const MAX_SKILLS = 5;

function initial(job: JobCardJob): string {
    const source = job.empresa ?? job.titulo ?? "?";
    return source.trim().charAt(0).toUpperCase() || "?";
}

export function JobCard({ item }: { item: JobCardItem }) {
    const { job } = item;
    const salary = formatSalaryBadge(job);
    const today = new Date().toISOString().slice(0, 10);
    const deadline: DeadlineBadgeType | null = formatDeadline(
        job.deadline,
        today,
    );
    const isMatched = item.match_id !== null;
    const skills = (job.skills ?? []).filter((s) => s.length > 0);
    const extraSkills = skills.length - MAX_SKILLS;

    return (
        <Card
            className={cn(
                "group gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md",
                isMatched && "border-brand/40",
            )}
        >
            {isMatched ? (
                <div className="h-1 w-full bg-gradient-to-r from-brand to-brand/40" />
            ) : null}
            <CardHeader className="px-5 pt-5 pb-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 font-serif font-semibold text-base text-brand">
                        {initial(job)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-serif font-semibold text-foreground leading-snug">
                            {job.titulo ?? "Vacante"}
                        </h3>
                        {job.empresa ? (
                            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground text-sm">
                                <Building2 className="size-3.5 shrink-0" />
                                {job.empresa}
                            </p>
                        ) : null}
                    </div>
                    {isMatched ? (
                        <Badge
                            variant="default"
                            className="shrink-0 bg-primary text-primary-foreground"
                        >
                            <Sparkles className="size-3" />
                            {formatMatchPct(item.rerank_score)} match
                        </Badge>
                    ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1">
                        <Briefcase className="size-3.5 shrink-0" />
                        {modalidadLabel(job.modalidad)}
                    </span>
                    {job.ubicacion ? (
                        <span className="flex items-center gap-1">
                            <MapPin className="size-3.5 shrink-0" />
                            {job.ubicacion}
                        </span>
                    ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={salary.variant}>{salary.label}</Badge>
                    {deadline ? (
                        <Badge
                            variant={
                                deadline.urgent ? "destructive" : "outline"
                            }
                        >
                            <CalendarClock className="size-3" />
                            {deadline.label}
                        </Badge>
                    ) : null}
                </div>
            </CardHeader>

            {skills.length > 0 ? (
                <CardContent className="px-5 py-0">
                    <div className="flex flex-wrap gap-1.5">
                        {skills.slice(0, MAX_SKILLS).map((skill) => (
                            <Badge
                                key={skill}
                                variant="secondary"
                                className="font-normal"
                            >
                                {skill}
                            </Badge>
                        ))}
                        {extraSkills > 0 ? (
                            <Badge variant="outline" className="font-normal">
                                +{extraSkills}
                            </Badge>
                        ) : null}
                    </div>
                </CardContent>
            ) : null}

            <CardFooter className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-5">
                {item.match_id ? (
                    <Button asChild variant="secondary" size="sm">
                        <Link href={`/feed/${item.match_id}`}>Ver detalle</Link>
                    </Button>
                ) : null}
                {job.apply_link ? (
                    <Button asChild variant="ghost" size="sm">
                        <a
                            href={job.apply_link}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Ver convocatoria
                            <ExternalLink className="size-3.5" />
                        </a>
                    </Button>
                ) : null}
            </CardFooter>
        </Card>
    );
}
