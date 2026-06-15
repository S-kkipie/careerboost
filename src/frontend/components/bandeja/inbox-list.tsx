import { formatRelativeDay } from "@/frontend/lib/format";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";
import type { InboxItem, InboxLiveItem } from "@/server/routers/inbox.schema";
import { FilteredSection } from "./filtered-section";
import { InboxRow } from "./inbox-row";

interface InboxListProps {
    items: InboxItem[];
    unprocessed: InboxLiveItem[];
    email: string | null;
    now: Date;
}

export function InboxList({ items, unprocessed, email, now }: InboxListProps) {
    const convocatorias = items.filter((i) => i.kind === "convocatoria");
    const filtrados = items.filter((i) => i.kind === "filtrado");

    return (
        <div className="flex flex-col gap-3">
            {unprocessed.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {unprocessed.map((item) => (
                        <InboxRow
                            key={item.gmailMsgId}
                            href={gmailMessageUrl(email, item.gmailMsgId)}
                            variant="sin_procesar"
                            title={item.subject ?? "(sin asunto)"}
                            subtitle="Aún no sincronizada — se clasifica en la próxima sincronización"
                            dateLabel={formatRelativeDay(item.date, now)}
                        />
                    ))}
                </div>
            ) : null}

            <div className="flex flex-col gap-2">
                {convocatorias.map((item) => (
                    <InboxRow
                        key={item.gmailMsgId}
                        href={gmailMessageUrl(email, item.gmailMsgId)}
                        variant="convocatoria"
                        title={
                            item.titulo
                                ? `${item.titulo}${item.empresa ? ` · ${item.empresa}` : ""}`
                                : (item.subject ?? "(sin asunto)")
                        }
                        dateLabel={formatRelativeDay(item.date, now)}
                    />
                ))}
            </div>

            <FilteredSection items={filtrados} email={email} now={now} />
        </div>
    );
}
