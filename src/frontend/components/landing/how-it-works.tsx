import type { LucideIcon } from "lucide-react";
import { FileText, Mail, Sparkles } from "lucide-react";

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
                <div className="mb-12 text-center">
                    <h2 className="text-3xl font-semibold text-foreground">
                        Cómo funciona
                    </h2>
                    <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-primary" />
                </div>

                <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
                    {steps.map((step) => {
                        const Icon = step.icon;
                        return (
                            <div
                                key={step.title}
                                className="flex flex-col items-center space-y-4 text-center"
                            >
                                <div className="flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                                    <Icon className="size-8 text-primary" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">
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
