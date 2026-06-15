import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/frontend/lib/utils";

export type InboxRowVariant = "convocatoria" | "filtrado" | "sin_procesar";

const VARIANT: Record<
    InboxRowVariant,
    { label: string; dot: string; badge: string; muted: boolean }
> = {
    convocatoria: {
        label: "Convocatoria",
        dot: "bg-success",
        badge: "border-success/30 bg-success/10 text-success",
        muted: false,
    },
    filtrado: {
        label: "Filtrado",
        dot: "bg-muted-foreground/40",
        badge: "border-border bg-muted text-muted-foreground",
        muted: true,
    },
    sin_procesar: {
        label: "Sin procesar",
        dot: "bg-brand",
        badge: "border-brand/30 bg-brand/10 text-brand-strong",
        muted: false,
    },
};

export interface InboxRowProps {
    href: string;
    variant: InboxRowVariant;
    title: string;
    subtitle?: string | null;
    dateLabel: string;
}

export function InboxRow({
    href,
    variant,
    title,
    subtitle,
    dateLabel,
}: InboxRowProps) {
    const v = VARIANT[variant];
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={title}
            className={cn(
                "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent",
                v.muted && "opacity-70",
            )}
        >
            <span
                aria-hidden="true"
                className={cn("size-2 flex-none rounded-full", v.dot)}
            />
            <div className="min-w-0 flex-1">
                <p
                    className={cn(
                        "truncate text-sm",
                        v.muted ? "font-normal" : "font-medium",
                    )}
                >
                    {title}
                </p>
                {subtitle ? (
                    <p className="truncate text-muted-foreground text-xs">
                        {subtitle}
                    </p>
                ) : null}
            </div>
            <Badge
                variant="outline"
                className={cn("flex-none text-[10px]", v.badge)}
            >
                {v.label}
            </Badge>
            {dateLabel ? (
                <span className="flex-none text-muted-foreground text-xs tabular-nums">
                    {dateLabel}
                </span>
            ) : null}
        </a>
    );
}
