"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/frontend/auth/auth";
import { InboxList } from "@/frontend/components/bandeja/inbox-list";
import { InboxSummaryBanner } from "@/frontend/components/bandeja/inbox-summary-banner";
import { RefreshFromGmailButton } from "@/frontend/components/bandeja/refresh-from-gmail-button";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { useInbox, useInboxLive } from "@/frontend/hooks/api";
import type { InboxLiveItem } from "@/server/routers/inbox.schema";

export default function BandejaPage() {
    const inbox = useInbox();
    const live = useInboxLive();
    const session = authClient.useSession();
    const email = session.data?.user.email ?? null;
    const [now] = useState(() => new Date());
    const [unprocessed, setUnprocessed] = useState<InboxLiveItem[]>([]);

    const onRefresh = () => {
        live.mutate(undefined, {
            onSuccess: (data) => setUnprocessed(data.unprocessed),
        });
    };

    if (inbox.isPending) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
            </div>
        );
    }

    if (inbox.isError) {
        return (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
                <p className="text-destructive text-sm">
                    No pudimos cargar tu bandeja. Inténtalo de nuevo.
                </p>
                <Button type="button" onClick={() => void inbox.refetch()}>
                    Reintentar
                </Button>
            </div>
        );
    }

    const { counts, items } = inbox.data;

    if (counts.total === 0) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <Inbox aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Tu bandeja está vacía
                    </EmptyTitle>
                    <EmptyDescription>
                        Sincroniza tu bolsa para ver aquí todos los correos y lo
                        que filtramos por ti.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild>
                        <Link href="/feed">Ir a sincronizar</Link>
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-serif font-bold text-foreground text-xl">
                    Bandeja de la bolsa
                </h1>
                <RefreshFromGmailButton
                    isPending={live.isPending}
                    error={live.error}
                    onRefresh={onRefresh}
                />
            </div>
            <InboxSummaryBanner counts={counts} />
            <InboxList
                items={items}
                unprocessed={unprocessed}
                email={email}
                now={now}
            />
        </div>
    );
}
