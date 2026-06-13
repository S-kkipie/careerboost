import type { ExtractedSalario } from "@/server/ai/extract-job";

export interface NormalizedSalary {
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
}

const PEN_HINT = /(s\/\.?|soles|\bpen\b)/i;
const USD_HINT = /(us\$|\busd\b|d[óo]lares|\$)/i;

// A plausible monthly/annual salary amount — filters out years, phone digits, etc.
function isPlausible(n: number): boolean {
    return Number.isFinite(n) && n >= 100 && n <= 1_000_000;
}

function parseAmount(raw: string): number {
    return Number.parseInt(raw.replace(/[.,\s]/g, ""), 10);
}

export function normalizeMoneda(raw: string | null): string | null {
    if (!raw) {
        return null;
    }
    if (USD_HINT.test(raw)) {
        return "USD";
    }
    if (PEN_HINT.test(raw)) {
        return "PEN";
    }
    return null;
}

// Matches 1500, 2,000, 1.500 (3+ digit groups or a single bare number).
const AMOUNT = String.raw`(\d[\d.,]*\d|\d)`;
const RANGE_RE = new RegExp(`${AMOUNT}\\s*(?:-|–|a|hasta|y)\\s*${AMOUNT}`, "i");
const BEFORE_RE = new RegExp(`(?:s/\\.?|us\\$|usd|\\$)\\s*${AMOUNT}`, "i");
const AFTER_RE = new RegExp(`${AMOUNT}\\s*(?:soles|pen|d[óo]lares|usd)`, "i");

export function detectSalaryFromText(text: string): NormalizedSalary | null {
    const moneda = normalizeMoneda(text);

    const range = text.match(RANGE_RE);
    if (range) {
        const min = parseAmount(range[1]);
        const max = parseAmount(range[2]);
        if (isPlausible(min) && isPlausible(max)) {
            return {
                salarioMin: min,
                salarioMax: max,
                moneda,
                salarioPeriodo: null,
                salarioExplicito: true,
            };
        }
    }

    const single = text.match(BEFORE_RE) ?? text.match(AFTER_RE);
    if (single) {
        const val = parseAmount(single[1]);
        if (isPlausible(val)) {
            return {
                salarioMin: val,
                salarioMax: null,
                moneda,
                salarioPeriodo: null,
                salarioExplicito: true,
            };
        }
    }

    return null;
}

// Reconcile the LLM salary block with a deterministic regex fallback.
// Trust the LLM only when it claims an explicit numeric amount; otherwise
// let the regex decide. No amount anywhere -> explicito=false.
export function normalizeSalary(
    llm: ExtractedSalario,
    rawText: string,
): NormalizedSalary {
    if (llm.explicito && llm.min != null) {
        return {
            salarioMin: Math.round(llm.min),
            salarioMax: llm.max != null ? Math.round(llm.max) : null,
            moneda: normalizeMoneda(llm.moneda),
            salarioPeriodo: llm.periodo,
            salarioExplicito: true,
        };
    }

    const detected = detectSalaryFromText(rawText);
    if (detected) {
        return { ...detected, salarioPeriodo: llm.periodo };
    }

    return {
        salarioMin: llm.min != null ? Math.round(llm.min) : null,
        salarioMax: llm.max != null ? Math.round(llm.max) : null,
        moneda: normalizeMoneda(llm.moneda),
        salarioPeriodo: llm.periodo,
        salarioExplicito: false,
    };
}
