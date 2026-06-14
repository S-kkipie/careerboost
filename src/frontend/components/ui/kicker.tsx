import type * as React from "react";

import { cn } from "@/frontend/lib/utils";

// Small uppercase ochre label. Uses --brand-strong (= --brand in dark) so a
// single class passes contrast in both modes.
export function Kicker({ className, ...props }: React.ComponentProps<"p">) {
    return (
        <p
            className={cn(
                "text-xs font-medium uppercase tracking-[0.12em] text-brand-strong",
                className,
            )}
            {...props}
        />
    );
}
