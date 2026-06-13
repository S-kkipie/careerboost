import { describe, expect, it } from "vitest";
import { parseExtractedProfile } from "@/server/ai/extract-profile";

const VALID = JSON.stringify({
    escuela_profesional: "Ingeniería de Sistemas",
    grado: "egresado",
    ubicacion: "Arequipa",
    skills: ["TypeScript", "SQL"],
    experiencia_resumen: "2 años en backend.",
    intereses: ["Backend", "Data"],
});

describe("parseExtractedProfile", () => {
    it("parses a valid extraction JSON into a typed profile", () => {
        const p = parseExtractedProfile(VALID);
        expect(p.escuela_profesional).toBe("Ingeniería de Sistemas");
        expect(p.grado).toBe("egresado");
        expect(p.skills).toEqual(["TypeScript", "SQL"]);
    });

    it("throws when grado is not an allowed value", () => {
        const bad = JSON.stringify({
            escuela_profesional: "X",
            grado: "doctorado",
            ubicacion: "Y",
            skills: [],
            experiencia_resumen: "",
            intereses: [],
        });
        expect(() => parseExtractedProfile(bad)).toThrow();
    });

    it("throws when a required field is missing", () => {
        const bad = JSON.stringify({ grado: "egresado" });
        expect(() => parseExtractedProfile(bad)).toThrow();
    });
});
