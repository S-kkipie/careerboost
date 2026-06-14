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

// Sentinel for the "all" option: radix forbids a <SelectItem value="">.
// The parent contract uses "" for "all", so we map to/from ALL only inside
// the Select and never expose the sentinel to the parent setters.
const ALL = "todas";

const MODALIDAD_OPTIONS = [
    { value: ALL, label: "Todas" },
    { value: "remoto", label: "Remoto" },
    { value: "presencial", label: "Presencial" },
    { value: "hibrido", label: "Híbrido" },
] as const;

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
                    className="data-[state=checked]:bg-brand"
                />
                <label
                    htmlFor="solo-con-salario"
                    className="cursor-pointer text-foreground text-sm select-none"
                >
                    Solo con salario
                </label>
            </div>

            <Select
                value={modalidad === "" ? ALL : modalidad}
                onValueChange={(v) => onModalidadChange(v === ALL ? "" : v)}
            >
                <SelectTrigger size="sm" className="w-36">
                    <SelectValue placeholder="Modalidad" />
                </SelectTrigger>
                <SelectContent>
                    {MODALIDAD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
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
