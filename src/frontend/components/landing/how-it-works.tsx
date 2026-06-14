import type { LucideIcon } from "lucide-react";
import { FileText, Mail, Sparkles } from "lucide-react";
import { SectionHeading } from "@/frontend/components/ui/section-heading";

interface Step {
    icon: LucideIcon;
    title: string;
    description: string;
}

const steps: Step[] = [
    {
        icon: Mail,
        title: "1. Conecta tu Gmail",
        description:
            "Acceso seguro solo-lectura para encontrar convocatorias institucionales.",
    },
    {
        icon: FileText,
        title: "2. Sube tu CV",
        description:
            "Subimos y analizamos tu perfil profesional para encontrar el match perfecto.",
    },
    {
        icon: Sparkles,
        title: "3. Recibe matches",
        description:
            "Matches directos con explicación de por qué encajas y salario transparente.",
    },
];

export function HowItWorks() {
    return (
        <section className="py-16 px-5 md:px-12">
            <div className="mx-auto max-w-[1100px]">
                <SectionHeading
                    kicker="En 3 pasos"
                    title="Cómo funciona"
                    className="mb-12"
                />

                <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
                    {steps.map((step) => {
                        const Icon = step.icon;
                        return (
                            <div
                                key={step.title}
                                className="flex flex-col items-center space-y-4 text-center"
                            >
                                <div className="flex size-16 items-center justify-center rounded-full border border-brand/20 bg-brand/10">
                                    <Icon
                                        className="size-8 text-brand"
                                        aria-hidden="true"
                                    />
                                </div>
                                <h3 className="font-serif text-lg font-semibold text-foreground">
                                    {step.title}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {step.description}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
