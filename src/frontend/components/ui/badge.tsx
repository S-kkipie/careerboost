import type { ComponentProps } from "react";
import { cn } from "@/frontend/lib/utils";

export type BadgeVariant = "default" | "success" | "muted" | "warning";

const BADGE_CLASSES: Record<BadgeVariant, string> = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success text-success-foreground",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-warning text-warning-foreground",
};

interface BadgeProps extends ComponentProps<"span"> {
    variant?: BadgeVariant;
}

export function Badge({
    variant = "default",
    className,
    ...props
}: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs",
                BADGE_CLASSES[variant],
                className,
            )}
            {...props}
        />
    );
}
