import { describe, expect, it } from "vitest";
import { diffNewIds, mapInboxRow } from "@/server/services/inbox";

describe("mapInboxRow", () => {
    it("maps a job row to a convocatoria item with ISO date", () => {
        const item = mapInboxRow({
            gmailMsgId: "m1",
            subject: "Asunto",
            sender: "bolsa@unsa.edu.pe",
            internalDate: new Date("2026-06-02T10:00:00.000Z"),
            noiseReason: null,
            jobId: "job-1",
            titulo: "Practicante",
            empresa: "Municipalidad",
        });
        expect(item.kind).toBe("convocatoria");
        expect(item.date).toBe("2026-06-02T10:00:00.000Z");
        expect(item.titulo).toBe("Practicante");
    });

    it("maps a noise row to a filtrado item with null date", () => {
        const item = mapInboxRow({
            gmailMsgId: "m2",
            subject: "Boletín",
            sender: "bolsa@unsa.edu.pe",
            internalDate: null,
            noiseReason: "no es convocatoria",
            jobId: null,
            titulo: null,
            empresa: null,
        });
        expect(item.kind).toBe("filtrado");
        expect(item.date).toBeNull();
        expect(item.noiseReason).toBe("no es convocatoria");
    });
});

describe("diffNewIds", () => {
    it("returns only ids not already stored", () => {
        expect(diffNewIds(["a", "b", "c"], new Set(["b"]))).toEqual(["a", "c"]);
    });

    it("returns empty when all stored", () => {
        expect(diffNewIds(["a"], new Set(["a"]))).toEqual([]);
    });
});
