import type * as React from "react";

import { Kicker } from "@/frontend/components/ui/kicker";
import { cn } from "@/frontend/lib/utils";

interface SectionHeadingProps {
    kicker?: string;
    title: React.ReactNode;
    align?: "center" | "left";
    className?: string;
}

// Serif section title + optional kicker + ochre underline rule.
export function SectionHeading({
    kicker,
    title,
    align = "center",
    className,
}: SectionHeadingProps) {
    return (
        <div
            className={cn(
                align === "center" ? "text-center" : "text-left",
                className,
            )}
        >
            {kicker ? <Kicker className="mb-2">{kicker}</Kicker> : null}
            <h2 className="font-serif text-3xl font-semibold text-foreground">
                {title}
            </h2>
            <div
                className={cn(
                    "mt-4 h-1 w-16 rounded-full bg-brand",
                    align === "center" && "mx-auto",
                )}
            />
        </div>
    );
}
