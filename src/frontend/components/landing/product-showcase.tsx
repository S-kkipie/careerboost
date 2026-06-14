import {
    MatchCard,
    type MatchCardItem,
} from "@/frontend/components/feed/match-card";
import { SectionHeading } from "@/frontend/components/ui/section-heading";

// Static sample used only for the landing visual. Not wired to any data.
const SAMPLE: MatchCardItem = {
    id: "sample",
    rerank_score: 92,
    explanation:
        "Tu experiencia en Python y SQL encaja con los requisitos; el salario está dentro de tu expectativa.",
    status: "new",
    job: {
        titulo: "Analista de Datos Junior",
        empresa: "Gobierno Regional de Arequipa",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salario_min: 2500,
        salario_max: 3500,
        moneda: "PEN",
        salario_periodo: "mensual",
        salario_explicito: true,
        apply_link: null,
        deadline: "2026-06-25",
    },
};

const captions = [
    "Cada match explica por qué encajas.",
    "Mostramos el salario que otros ocultan.",
    "Un clic para postular, sin rastrear tu bandeja.",
];

export function ProductShowcase() {
    return (
        <section className="px-5 py-16 md:px-12" aria-label="Tu feed">
            <div className="mx-auto max-w-[1100px]">
                <SectionHeading kicker="Tu feed" title="Mira lo que recibes" />

                <div className="mt-12 grid items-center gap-10 md:grid-cols-2">
                    {/* Browser-chrome frame around a real MatchCard (visual only) */}
                    <div className="animate-rise overflow-hidden rounded-xl border border-border shadow-lg">
                        <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-3">
                            {/* decorative window dots — the one allowed literal-colour spot */}
                            <span className="size-2.5 rounded-full bg-[#ef4444]" />
                            <span className="size-2.5 rounded-full bg-[#eab308]" />
                            <span className="size-2.5 rounded-full bg-[#22c55e]" />
                        </div>
                        <div
                            className="pointer-events-none select-none bg-background p-4"
                            aria-hidden="true"
                            inert
                        >
                            <MatchCard
                                item={SAMPLE}
                                isPending={false}
                                onSave={() => {}}
                                onDismiss={() => {}}
                            />
                        </div>
                    </div>

                    <ul className="flex flex-col gap-4">
                        {captions.map((caption) => (
                            <li
                                key={caption}
                                className="flex items-start gap-3 text-foreground"
                            >
                                <span
                                    className="mt-2 size-2 shrink-0 rounded-full bg-brand"
                                    aria-hidden="true"
                                />
                                <span className="text-base text-muted-foreground">
                                    {caption}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}
