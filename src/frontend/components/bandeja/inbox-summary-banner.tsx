import type { InboxCounts } from "@/server/routers/inbox.schema";

export function InboxSummaryBanner({ counts }: { counts: InboxCounts }) {
    return (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
                De <strong className="text-foreground">{counts.total}</strong>{" "}
                correos de la bolsa, filtramos{" "}
                <strong className="text-foreground">{counts.filtrados}</strong>.
                Estas son tus{" "}
                <strong className="text-brand-strong">
                    {counts.convocatorias}
                </strong>{" "}
                convocatorias.
            </p>
        </div>
    );
}
