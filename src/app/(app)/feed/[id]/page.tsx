"use client";

import {
    ArrowLeft,
    Briefcase,
    Building2,
    CalendarClock,
    Mail,
    MapPin,
    Send,
    Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/frontend/components/ui/badge";
import { buttonVariants } from "@/frontend/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/frontend/components/ui/card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { useMatchDetail } from "@/frontend/hooks/api";
import {
    type DeadlineBadge as DeadlineBadgeType,
    formatDeadline,
    formatMatchPct,
    formatSalaryBadge,
    gmailComposeUrl,
    gmailMessageUrl,
    modalidadLabel,
    parseEmailAddress,
} from "@/frontend/lib/format";

function BackLink() {
    return (
        <Link
            href="/feed"
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al feed
        </Link>
    );
}

function DetailInner() {
    const params = useParams<{ id: string }>();
    const detailQuery = useMatchDetail(params.id);
    const detail = detailQuery.data?.detail;

    if (detailQuery.isPending) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink />
                <Skeleton className="h-80 w-full" />
            </div>
        );
    }

    if (!detail) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink />
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia
                            variant="icon"
                            className="bg-brand/10 text-brand"
                        >
                            <Briefcase aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle className="font-serif">
                            No encontramos esa vacante
                        </EmptyTitle>
                        <EmptyDescription>
                            Puede haber expirado o no pertenece a tu feed.
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        );
    }

    const { job } = detail;
    const salary = formatSalaryBadge(job);
    const today = new Date().toISOString().slice(0, 10);
    const deadline: DeadlineBadgeType | null = formatDeadline(
        job.deadline,
        today,
    );
    const replyTo = parseEmailAddress(detail.email_sender);
    const replySubject = `Re: ${detail.email_subject ?? job.titulo ?? "Convocatoria"}`;
    const hasActions = Boolean(replyTo) || Boolean(detail.gmail_msg_id);

    return (
        <div className="flex flex-col gap-6">
            <BackLink />

            <Card className="gap-0 py-0">
                <CardHeader className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="font-serif font-semibold text-foreground text-xl leading-snug">
                                {job.titulo ?? "Vacante"}
                            </h1>
                            {job.empresa ? (
                                <p className="mt-1 flex items-center gap-1 text-muted-foreground text-sm">
                                    <Building2 className="size-3.5 shrink-0" />
                                    {job.empresa}
                                </p>
                            ) : null}
                        </div>
                        <Badge
                            variant="default"
                            className="shrink-0 bg-primary text-primary-foreground"
                        >
                            <Sparkles className="size-3" />
                            {formatMatchPct(detail.rerank_score)} match
                        </Badge>
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

                <CardContent className="flex flex-col gap-4 px-5 py-4">
                    {detail.explanation ? (
                        <div className="rounded-md border-brand border-l-2 bg-brand/5 px-3 py-2 text-sm">
                            <span className="font-medium text-foreground">
                                ¿Por qué?{" "}
                            </span>
                            <span className="text-muted-foreground">
                                {detail.explanation}
                            </span>
                        </div>
                    ) : null}

                    {job.requisitos ? (
                        <section>
                            <h2 className="mb-1 font-medium text-foreground text-sm">
                                Requisitos
                            </h2>
                            <p className="whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
                                {job.requisitos}
                            </p>
                        </section>
                    ) : null}

                    {job.skills && job.skills.length > 0 ? (
                        <section>
                            <h2 className="mb-1.5 font-medium text-foreground text-sm">
                                Skills
                            </h2>
                            <div className="flex flex-wrap gap-1.5">
                                {job.skills.map((skill) => (
                                    <Badge key={skill} variant="outline">
                                        {skill}
                                    </Badge>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </CardContent>

                {hasActions ? (
                    <CardFooter className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-5">
                        {replyTo ? (
                            <a
                                href={gmailComposeUrl(replyTo, replySubject)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={buttonVariants({
                                    variant: "default",
                                    size: "sm",
                                })}
                            >
                                <Send className="size-3.5" />
                                Responder por correo
                            </a>
                        ) : null}
                        {detail.gmail_msg_id ? (
                            <a
                                href={gmailMessageUrl(detail.gmail_msg_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={buttonVariants({
                                    variant: "outline",
                                    size: "sm",
                                })}
                            >
                                <Mail className="size-3.5" />
                                Ver correo en Gmail
                            </a>
                        ) : null}
                    </CardFooter>
                ) : null}
            </Card>
        </div>
    );
}

export default function MatchDetailPage() {
    return <DetailInner />;
}
