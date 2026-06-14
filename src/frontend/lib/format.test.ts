import { describe, expect, it } from "vitest";
import {
    buildImpactStats,
    errorCode,
    errorMessage,
    formatMatchPct,
    formatSalaryBadge,
    modalidadLabel,
} from "@/frontend/lib/format";

describe("formatSalaryBadge", () => {
    it("formats an explicit range with currency and period", () => {
        expect(
            formatSalaryBadge({
                salario_explicito: true,
                salario_min: 1500,
                salario_max: 1800,
                moneda: "S/",
                salario_periodo: "mes",
            }),
        ).toEqual({ label: "S/ 1500-1800 /mes", variant: "success" });
    });

    it("collapses equal min/max to a single amount", () => {
        expect(
            formatSalaryBadge({
                salario_explicito: true,
                salario_min: 2500,
                salario_max: 2500,
                moneda: "USD",
                salario_periodo: "mes",
            }),
        ).toEqual({ label: "USD 2500 /mes", variant: "success" });
    });

    it("returns muted when salary is not explicit", () => {
        expect(
            formatSalaryBadge({
                salario_explicito: false,
                salario_min: null,
                salario_max: null,
                moneda: null,
                salario_periodo: null,
            }),
        ).toEqual({ label: "Sueldo no informado", variant: "muted" });
    });

    it("returns muted when explicit but min is null", () => {
        expect(
            formatSalaryBadge({
                salario_explicito: true,
                salario_min: null,
                salario_max: null,
                moneda: "S/",
                salario_periodo: "mes",
            }),
        ).toEqual({ label: "Sueldo no informado", variant: "muted" });
    });
});

describe("formatMatchPct", () => {
    it("formats a score as a percentage", () => {
        expect(formatMatchPct(87)).toBe("87%");
    });
    it("rounds and handles null", () => {
        expect(formatMatchPct(72.6)).toBe("73%");
        expect(formatMatchPct(null)).toBe("—");
    });
});

describe("modalidadLabel", () => {
    it("maps known modalidades", () => {
        expect(modalidadLabel("remoto")).toBe("Remoto");
        expect(modalidadLabel("hibrido")).toBe("Híbrido");
    });
    it("falls back for null/unknown", () => {
        expect(modalidadLabel(null)).toBe("No especificada");
        expect(modalidadLabel("otra")).toBe("otra");
    });
});

describe("buildImpactStats", () => {
    it("returns null when there is no run", () => {
        expect(buildImpactStats(null)).toBeNull();
    });
    it("builds four labeled stats from a run", () => {
        expect(
            buildImpactStats({
                emailsScanned: 240,
                noiseFiltered: 95,
                jobsFound: 18,
                dupesRemoved: 4,
            }),
        ).toEqual([
            { label: "Correos escaneados", value: 240 },
            { label: "Ruido filtrado", value: 95 },
            { label: "Empleos reales", value: 18 },
            { label: "Duplicados quitados", value: 4 },
        ]);
    });
});

describe("errorCode / errorMessage", () => {
    it("extracts a code from an eden-style error", () => {
        expect(
            errorCode({ status: 400, value: { code: "gmail_not_connected" } }),
        ).toBe("gmail_not_connected");
    });
    it("returns null for unrecognized shapes", () => {
        expect(errorCode("boom")).toBeNull();
        expect(errorCode({ value: {} })).toBeNull();
        expect(errorCode(null)).toBeNull();
    });
    it("maps known codes to Spanish messages", () => {
        expect(errorMessage({ value: { code: "profile_not_ready" } })).toBe(
            "Sube tu CV antes de generar matches.",
        );
    });
    it("falls back for unknown codes", () => {
        expect(errorMessage({ value: { code: "weird" } })).toBe(
            "Algo salió mal. Intenta de nuevo.",
        );
    });
});
