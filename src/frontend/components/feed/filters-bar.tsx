import { Button } from "@/frontend/components/ui/button";

interface FiltersBarProps {
    soloConSalario: boolean;
    modalidad: string;
    ubicacion: string;
    onSoloConSalarioChange: (value: boolean) => void;
    onModalidadChange: (value: string) => void;
    onUbicacionChange: (value: string) => void;
}

const MODALIDADES = ["", "remoto", "presencial", "hibrido"] as const;
const MODALIDAD_LABELS: Record<string, string> = {
    "": "Todas",
    remoto: "Remoto",
    presencial: "Presencial",
    hibrido: "Híbrido",
};

export function FiltersBar({
    soloConSalario,
    modalidad,
    ubicacion,
    onSoloConSalarioChange,
    onModalidadChange,
    onUbicacionChange,
}: FiltersBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-foreground text-sm">
                <input
                    type="checkbox"
                    checked={soloConSalario}
                    onChange={(e) => onSoloConSalarioChange(e.target.checked)}
                />
                Solo con salario
            </label>

            <div className="flex gap-1">
                {MODALIDADES.map((m) => (
                    <Button
                        key={m === "" ? "todas" : m}
                        variant={modalidad === m ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => onModalidadChange(m)}
                    >
                        {MODALIDAD_LABELS[m]}
                    </Button>
                ))}
            </div>

            <input
                type="text"
                value={ubicacion}
                placeholder="Ubicación"
                aria-label="Filtrar por ubicación"
                onChange={(e) => onUbicacionChange(e.target.value)}
                className="h-8 rounded-md border bg-background px-3 text-foreground text-sm"
            />
        </div>
    );
}
