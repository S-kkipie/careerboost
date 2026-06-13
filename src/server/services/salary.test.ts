import { describe, expect, it } from "vitest";
import {
    detectSalaryFromText,
    normalizeMoneda,
    normalizeSalary,
} from "@/server/services/salary";

describe("normalizeMoneda", () => {
    it("maps soles markers to PEN and dollar markers to USD", () => {
        expect(normalizeMoneda("soles")).toBe("PEN");
        expect(normalizeMoneda("S/")).toBe("PEN");
        expect(normalizeMoneda("USD")).toBe("USD");
        expect(normalizeMoneda("dólares")).toBe("USD");
    });

    it("returns null for unknown or empty", () => {
        expect(normalizeMoneda(null)).toBeNull();
        expect(normalizeMoneda("xyz")).toBeNull();
    });
});

describe("detectSalaryFromText", () => {
    it("detects a single soles amount with the S/ marker", () => {
        const s = detectSalaryFromText("Sueldo S/ 1500 mensual");
        expect(s).not.toBeNull();
        expect(s?.salarioMin).toBe(1500);
        expect(s?.moneda).toBe("PEN");
        expect(s?.salarioExplicito).toBe(true);
    });

    it("detects a soles range with trailing word", () => {
        const s = detectSalaryFromText("Entre 1200 y 1800 soles");
        expect(s?.salarioMin).toBe(1200);
        expect(s?.salarioMax).toBe(1800);
        expect(s?.moneda).toBe("PEN");
    });

    it("detects a USD amount", () => {
        const s = detectSalaryFromText("Pago USD 800 al mes");
        expect(s?.salarioMin).toBe(800);
        expect(s?.moneda).toBe("USD");
    });

    it("handles thousands separators", () => {
        const s = detectSalaryFromText("Remuneración S/ 2,000");
        expect(s?.salarioMin).toBe(2000);
    });

    it("returns null when there is no amount", () => {
        expect(detectSalaryFromText("Remuneración según mercado")).toBeNull();
    });

    it("ignores a bare year without a currency marker", () => {
        expect(
            detectSalaryFromText("Convocatoria 2026 para egresados"),
        ).toBeNull();
    });

    it("ignores a currency-less number range (phones, counts)", () => {
        expect(detectSalaryFromText("Tel: 987-654-321")).toBeNull();
        expect(detectSalaryFromText("De 100 a 200 participantes")).toBeNull();
    });

    it("ignores a bare year range even when a currency word appears", () => {
        expect(
            detectSalaryFromText("Contrato de 2024 a 2026, pago en USD"),
        ).toBeNull();
    });

    it("parses an amount with decimal cents", () => {
        const s = detectSalaryFromText("Remuneración S/ 1,500.50 mensual");
        expect(s?.salarioMin).toBe(1500);
    });
});

describe("normalizeSalary", () => {
    it("trusts the LLM when it reports an explicit amount", () => {
        const out = normalizeSalary(
            {
                min: 2500,
                max: 3000,
                moneda: "PEN",
                periodo: "mes",
                explicito: true,
            },
            "irrelevante",
        );
        expect(out.salarioMin).toBe(2500);
        expect(out.salarioMax).toBe(3000);
        expect(out.salarioExplicito).toBe(true);
        expect(out.moneda).toBe("PEN");
    });

    it("falls back to regex when the LLM is not explicit", () => {
        const out = normalizeSalary(
            {
                min: null,
                max: null,
                moneda: null,
                periodo: null,
                explicito: false,
            },
            "El sueldo es S/ 1600 mensuales",
        );
        expect(out.salarioMin).toBe(1600);
        expect(out.moneda).toBe("PEN");
        expect(out.salarioExplicito).toBe(true);
    });

    it("marks not explicit when neither LLM nor regex find an amount", () => {
        const out = normalizeSalary(
            {
                min: null,
                max: null,
                moneda: null,
                periodo: "mes",
                explicito: false,
            },
            "Remuneración a tratar",
        );
        expect(out.salarioMin).toBeNull();
        expect(out.salarioExplicito).toBe(false);
        expect(out.salarioPeriodo).toBe("mes");
    });

    it("rounds a fractional LLM amount", () => {
        const out = normalizeSalary(
            {
                min: 1500.6,
                max: null,
                moneda: "PEN",
                periodo: "mes",
                explicito: true,
            },
            "x",
        );
        expect(out.salarioMin).toBe(1501);
    });
});
