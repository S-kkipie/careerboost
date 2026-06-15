import { describe, expect, it } from "vitest";
import {
    inboxLiveResponseSchema,
    inboxResponseSchema,
} from "@/server/routers/inbox.schema";

describe("inboxResponseSchema", () => {
    it("accepts a well-formed response", () => {
        const value = {
            counts: { total: 3, convocatorias: 1, filtrados: 2 },
            items: [
                {
                    gmailMsgId: "m1",
                    subject: "Practicante",
                    sender: "bolsa@unsa.edu.pe",
                    date: "2026-06-02T10:00:00.000Z",
                    kind: "convocatoria",
                    noiseReason: null,
                    jobId: "job-1",
                    titulo: "Practicante de Sistemas",
                    empresa: "Municipalidad",
                },
            ],
        };
        expect(inboxResponseSchema.parse(value)).toEqual(value);
    });

    it("rejects an invalid kind", () => {
        const bad = {
            counts: { total: 0, convocatorias: 0, filtrados: 0 },
            items: [
                {
                    gmailMsgId: "m1",
                    subject: null,
                    sender: null,
                    date: null,
                    kind: "otro",
                    noiseReason: null,
                    jobId: null,
                    titulo: null,
                    empresa: null,
                },
            ],
        };
        expect(() => inboxResponseSchema.parse(bad)).toThrow();
    });
});

describe("inboxLiveResponseSchema", () => {
    it("accepts unprocessed items", () => {
        const value = {
            unprocessed: [
                { gmailMsgId: "m9", subject: "Nueva", sender: "x", date: null },
            ],
        };
        expect(inboxLiveResponseSchema.parse(value)).toEqual(value);
    });
});
