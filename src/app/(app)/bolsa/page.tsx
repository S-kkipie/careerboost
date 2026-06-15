"use client";

import { Building2 } from "lucide-react";
import { JobCard } from "@/frontend/components/jobs/job-card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { useAllJobs } from "@/frontend/hooks/api";

export default function BolsaPage() {
    const jobsQuery = useAllJobs();
    const jobs = jobsQuery.data?.jobs ?? [];

    let body: React.ReactNode;
    if (jobsQuery.isPending) {
        body = (
            <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-52 w-full" />
            </div>
        );
    } else if (jobs.length === 0) {
        body = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <Building2 aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Aún no hay vacantes en la bolsa
                    </EmptyTitle>
                    <EmptyDescription>
                        Las convocatorias aparecerán aquí en cuanto se procesen
                        los correos de la bolsa.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    } else {
        body = (
            <div className="grid gap-4 sm:grid-cols-2">
                {jobs.map((item) => (
                    <JobCard key={item.job_id} item={item} />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="font-serif font-semibold text-foreground text-xl">
                    Bolsa de empleos
                </h1>
                <p className="text-muted-foreground text-sm">
                    Todas las convocatorias del pool, no solo las que coinciden
                    con tu perfil.
                </p>
            </div>
            {body}
        </div>
    );
}
