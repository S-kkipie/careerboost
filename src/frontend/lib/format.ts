// Pure UI formatters. No React, no I/O — unit-tested and shared by client
// components. Field names match the API response (snake_case) where they come
// straight from a feed item.

export interface SalaryBadgeInput {
    salario_explicito: boolean;
    salario_min: number | null;
    salario_max: number | null;
    moneda: string | null;
    salario_periodo: string | null;
}

export interface SalaryBadge {
    label: string;
    variant: "success" | "muted";
}

const PERIODO_SUFFIX: Record<string, string> = {
    mes: "/mes",
    anio: "/año",
    año: "/año",
    hora: "/hora",
    dia: "/día",
};

export function formatSalaryBadge(input: SalaryBadgeInput): SalaryBadge {
    if (!input.salario_explicito || input.salario_min === null) {
        return { label: "Sueldo no informado", variant: "muted" };
    }
    const moneda = input.moneda ?? "";
    const amount =
        input.salario_max !== null && input.salario_max !== input.salario_min
            ? `${input.salario_min}-${input.salario_max}`
            : `${input.salario_min}`;
    const periodo = input.salario_periodo
        ? (PERIODO_SUFFIX[input.salario_periodo] ?? "")
        : "";
    const head = [moneda, amount].filter((s) => s.length > 0).join(" ");
    const label = periodo ? `${head} ${periodo}` : head;
    return { label: label.trim(), variant: "success" };
}

export function formatMatchPct(rerankScore: number | null): string {
    if (rerankScore === null) {
        return "—";
    }
    return `${Math.round(rerankScore)}%`;
}

const MODALIDAD_LABELS: Record<string, string> = {
    remoto: "Remoto",
    presencial: "Presencial",
    hibrido: "Híbrido",
    híbrido: "Híbrido",
};

export function modalidadLabel(modalidad: string | null): string {
    if (!modalidad) {
        return "No especificada";
    }
    return MODALIDAD_LABELS[modalidad.toLowerCase()] ?? modalidad;
}

export interface ImpactRun {
    emailsScanned: number;
    noiseFiltered: number;
    jobsFound: number;
    dupesRemoved: number;
}

export interface ImpactStat {
    label: string;
    value: number;
}

export function buildImpactStats(run: ImpactRun | null): ImpactStat[] | null {
    if (!run) {
        return null;
    }
    return [
        { label: "Correos escaneados", value: run.emailsScanned },
        { label: "Ruido filtrado", value: run.noiseFiltered },
        { label: "Empleos reales", value: run.jobsFound },
        { label: "Duplicados quitados", value: run.dupesRemoved },
    ];
}

const MESES_ES = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
];

export interface DeadlineBadge {
    label: string;
    urgent: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `deadline` and `today` are YYYY-MM-DD strings; lexicographic compare equals
// chronological for that format. Pure — the caller supplies `today`.
export function formatDeadline(
    deadline: string | null,
    today: string,
): DeadlineBadge | null {
    if (!deadline) {
        return null;
    }
    // Data crosses the network — only format a well-formed ISO date and never
    // throw on an unexpected shape (RegExp.test coerces non-strings to string).
    if (!ISO_DATE_RE.test(deadline)) {
        return null;
    }
    if (deadline < today) {
        return { label: "Convocatoria cerrada", urgent: true };
    }
    if (deadline === today) {
        return { label: "Cierra hoy", urgent: true };
    }
    const [, month, day] = deadline.split("-");
    const mes = MESES_ES[Number(month) - 1] ?? "";
    return { label: `Cierra ${Number(day)} ${mes}`.trim(), urgent: false };
}

// Eden returns { data, error } on non-2xx; our hooks throw `error`, whose body
// is in `.value`. Narrow with typeof + `in` guards (no casts).
export function errorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null) {
        return null;
    }
    if (!("value" in error)) {
        return null;
    }
    const value = error.value;
    if (typeof value !== "object" || value === null) {
        return null;
    }
    if (!("code" in value)) {
        return null;
    }
    const code = value.code;
    return typeof code === "string" ? code : null;
}

const ERROR_MESSAGES: Record<string, string> = {
    gmail_not_connected: "Conecta tu Gmail antes de sincronizar.",
    profile_not_ready: "Sube tu CV antes de generar matches.",
    profile_not_found: "No encontramos tu perfil. Sube tu CV primero.",
    unauthenticated: "Tu sesión expiró. Inicia sesión de nuevo.",
};

export function errorMessage(error: unknown): string {
    const code = errorCode(error);
    const known = code ? ERROR_MESSAGES[code] : undefined;
    return known ?? "Algo salió mal. Intenta de nuevo.";
}
