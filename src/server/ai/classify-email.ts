import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const classifiedEmailSchema = z.object({
    is_job: z.boolean(),
    noise_reason: z.string(),
});

export type ClassifiedEmail = z.infer<typeof classifiedEmailSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        is_job: { type: Type.BOOLEAN },
        noise_reason: { type: Type.STRING },
    },
    propertyOrdering: ["is_job", "noise_reason"],
    required: ["is_job", "noise_reason"],
};

const PROMPT =
    "Clasifica si el correo contiene una oportunidad laboral real dirigida a " +
    "egresados universitarios. Responde SOLO con JSON según el schema. Cuenta " +
    "como oportunidad laboral ('is_job'=true): vacantes de empleo, prácticas " +
    "pre-profesionales o profesionales, CAS, locación de servicios, concursos " +
    "públicos de empleo y convocatorias laborales, incluso si el correo agrupa " +
    "varias vacantes o solo enlaza a la postulación. Prioriza el recall: si hay " +
    "duda razonable de que describe una oportunidad laboral concreta, pon " +
    "'is_job'=true. Pon 'is_job'=false SOLO cuando es claramente ruido " +
    "(newsletter, evento, webinar, encuesta, aviso administrativo, " +
    "felicitación, publicidad, beca o curso sin vacante) y en 'noise_reason' la " +
    "razón en una o dos palabras (p.ej. 'evento', 'encuesta', 'publicidad'). Si " +
    "'is_job'=true deja 'noise_reason' como cadena vacía.";

export function parseClassifiedEmail(jsonText: string): ClassifiedEmail {
    return classifiedEmailSchema.parse(JSON.parse(jsonText));
}

export async function classifyEmail(
    emailText: string,
): Promise<ClassifiedEmail> {
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ text: PROMPT }, { text: emailText }],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty classification");
    }
    return parseClassifiedEmail(text);
}
