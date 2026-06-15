"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/frontend/components/ui/collapsible";
import { formatRelativeDay } from "@/frontend/lib/format";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";
import { cn } from "@/frontend/lib/utils";
import type { InboxItem } from "@/server/routers/inbox.schema";
import { InboxRow } from "./inbox-row";

interface FilteredSectionProps {
    items: InboxItem[];
    email: string | null;
    now: Date;
}

export function FilteredSection({ items, email, now }: FilteredSectionProps) {
    const [open, setOpen] = useState(false);
    if (items.length === 0) {
        return null;
    }
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
                <ChevronDown
                    aria-hidden="true"
                    className={cn(
                        "size-4 transition-transform",
                        open && "rotate-180",
                    )}
                />
                {open
                    ? "Ocultar filtrados"
                    : `Ver ${items.length} correos filtrados`}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
                {items.map((item) => (
                    <InboxRow
                        key={item.gmailMsgId}
                        href={gmailMessageUrl(email, item.gmailMsgId)}
                        variant="filtrado"
                        title={item.subject ?? "(sin asunto)"}
                        subtitle={item.noiseReason}
                        dateLabel={formatRelativeDay(item.date, now)}
                    />
                ))}
            </CollapsibleContent>
        </Collapsible>
    );
}
