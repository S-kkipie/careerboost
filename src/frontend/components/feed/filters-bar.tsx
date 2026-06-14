import { Search } from "lucide-react";
import { Input } from "@/frontend/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/frontend/components/ui/select";
import { Switch } from "@/frontend/components/ui/switch";

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
            <div className="flex items-center gap-2">
                <Switch
                    id="solo-con-salario"
                    checked={soloConSalario}
                    onCheckedChange={onSoloConSalarioChange}
                    size="sm"
                />
                <label
                    htmlFor="solo-con-salario"
                    className="cursor-pointer text-foreground text-sm select-none"
                >
                    Solo con salario
                </label>
            </div>

            <Select value={modalidad} onValueChange={onModalidadChange}>
                <SelectTrigger size="sm" className="w-36">
                    <SelectValue placeholder="Modalidad" />
                </SelectTrigger>
                <SelectContent>
                    {MODALIDADES.map((m) => (
                        <SelectItem key={m === "" ? "todas" : m} value={m}>
                            {MODALIDAD_LABELS[m]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="text"
                    value={ubicacion}
                    placeholder="Ubicación"
                    aria-label="Filtrar por ubicación"
                    onChange={(e) => onUbicacionChange(e.target.value)}
                    className="h-8 w-44 pl-8"
                />
            </div>
        </div>
    );
}
