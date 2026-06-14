import { Card } from "@/frontend/components/ui/card";

const stats = [
    {
        value: "100+",
        label: "correos/mes procesados",
        color: "text-primary",
    },
    {
        value: "27%",
        label: "ruido eliminado de tu bandeja",
        color: "text-brand",
    },
    {
        value: "90%",
        label: "sin salario visible → lo mostramos",
        color: "text-success",
    },
] as const;

export function ImpactBand() {
    return (
        <section className="border-y border-border bg-muted py-16">
            <div className="mx-auto max-w-[1100px] px-5 md:px-12">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {stats.map((stat) => (
                        <Card
                            key={stat.label}
                            className="items-center justify-center p-8 text-center gap-2 hover:border-brand transition-colors"
                        >
                            <div
                                className={`font-serif text-4xl font-bold ${stat.color}`}
                            >
                                {stat.value}
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">
                                {stat.label}
                            </p>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
