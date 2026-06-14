import type * as React from "react";

import { Card, CardContent } from "@/frontend/components/ui/card";
import { cn } from "@/frontend/lib/utils";

import type { StepState } from "./stepper";

interface StepCardProps {
    state: StepState;
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}

export function StepCard({
    state,
    icon,
    title,
    description,
    children,
}: StepCardProps) {
    return (
        <Card
            className={cn(
                "transition-all",
                state === "active" && "border-2 border-primary shadow-md",
                state === "upcoming" && "opacity-60 grayscale",
            )}
        >
            <CardContent className="pt-6 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div
                        className={cn(
                            "p-3 rounded-lg shrink-0",
                            state === "completed" &&
                                "bg-success/10 text-success",
                            state === "active" && "bg-primary/10 text-primary",
                            state === "upcoming" &&
                                "bg-muted text-muted-foreground",
                        )}
                    >
                        {icon}
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-base text-foreground leading-tight">
                            {title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {description}
                        </p>
                    </div>
                </div>
                {children}
            </CardContent>
        </Card>
    );
}
