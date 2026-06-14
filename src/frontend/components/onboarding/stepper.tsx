import { CheckCircle2 } from "lucide-react";

import { cn } from "@/frontend/lib/utils";

export type StepState = "completed" | "active" | "upcoming";

export interface Step {
    label: string;
    state: StepState;
}

interface StepperProps {
    steps: Step[];
}

export function Stepper({ steps }: StepperProps) {
    return (
        <div className="flex items-center justify-between relative px-2">
            {/* connector line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-10" />
            {steps.map((step, i) => (
                <div
                    key={step.label}
                    className="flex flex-col items-center bg-background px-2"
                >
                    <div
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center border-4 border-background shadow-sm",
                            step.state === "completed" &&
                                "bg-primary text-primary-foreground",
                            step.state === "active" &&
                                "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2",
                            step.state === "upcoming" &&
                                "bg-muted text-muted-foreground",
                        )}
                    >
                        {step.state === "completed" ? (
                            <CheckCircle2 className="size-5" />
                        ) : (
                            <span className="text-sm font-bold">{i + 1}</span>
                        )}
                    </div>
                    <span
                        className={cn(
                            "text-xs font-semibold tracking-wide mt-2",
                            step.state === "completed" && "text-primary",
                            step.state === "active" && "text-foreground",
                            step.state === "upcoming" &&
                                "text-muted-foreground",
                        )}
                    >
                        {step.label}
                    </span>
                </div>
            ))}
        </div>
    );
}
