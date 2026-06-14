import {
    BadgeDollarSign,
    GraduationCap,
    Lock,
    type LucideIcon,
    Sparkles,
} from "lucide-react";

interface TrustItem {
    icon: LucideIcon;
    label: string;
}

const items: TrustItem[] = [
    { icon: Lock, label: "Acceso solo-lectura" },
    { icon: GraduationCap, label: "Hecho para la UNSA" },
    { icon: Sparkles, label: "IA personalizada" },
    { icon: BadgeDollarSign, label: "Salario transparente" },
];

export function TrustStrip() {
    return (
        <section
            className="border-y border-border bg-muted/50 py-6"
            aria-label="Garantías"
        >
            <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 md:px-12">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div
                            key={item.label}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Icon
                                className="size-4 text-brand"
                                aria-hidden="true"
                            />
                            {item.label}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
