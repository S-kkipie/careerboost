import { describe, expect, it } from "vitest";
import { parseExtractedJob } from "@/server/ai/extract-job";

const VALID = JSON.stringify({
    titulo: "Practicante de Backend",
    empresa: "Acme S.A.C.",
    modalidad: "remoto",
    ubicacion: "Arequipa",
    salario: {
        min: 1500,
        max: 1800,
        moneda: "PEN",
        periodo: "mes",
        explicito: true,
    },
    requisitos: "Node.js, SQL",
    skills: ["Node.js", "SQL"],
    deadline: "2026-07-01",
    apply_link: "https://acme.test/apply",
});

describe("parseExtractedJob", () => {
    it("parses a fully populated vacancy", () => {
        const j = parseExtractedJob(VALID);
        expect(j.titulo).toBe("Practicante de Backend");
        expect(j.salario.min).toBe(1500);
        expect(j.salario.explicito).toBe(true);
        expect(j.skills).toEqual(["Node.js", "SQL"]);
    });

    it("accepts null salary amounts, deadline and apply_link", () => {
        const j = parseExtractedJob(
            JSON.stringify({
                titulo: "Analista",
                empresa: "X",
                modalidad: "presencial",
                ubicacion: "Lima",
                salario: {
                    min: null,
                    max: null,
                    moneda: null,
                    periodo: null,
                    explicito: false,
                },
                requisitos: "",
                skills: [],
                deadline: null,
                apply_link: null,
            }),
        );
        expect(j.salario.min).toBeNull();
        expect(j.deadline).toBeNull();
        expect(j.apply_link).toBeNull();
    });

    it("throws when a required field is missing", () => {
        expect(() =>
            parseExtractedJob(JSON.stringify({ titulo: "X" })),
        ).toThrow();
    });
});
