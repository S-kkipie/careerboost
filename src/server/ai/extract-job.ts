import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const extractedSalarioSchema = z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    moneda: z.string().nullable(),
    periodo: z.string().nullable(),
    explicito: z.boolean(),
});

export const extractedJobSchema = z.object({
    titulo: z.string(),
    empresa: z.string(),
    modalidad: z.string(),
    ubicacion: z.string(),
    salario: extractedSalarioSchema,
    requisitos: z.string(),
    skills: z.array(z.string()),
    deadline: z.string().nullable(),
    apply_link: z.string().nullable(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type ExtractedSalario = z.infer<typeof extractedSalarioSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING },
        empresa: { type: Type.STRING },
        modalidad: { type: Type.STRING },
        ubicacion: { type: Type.STRING },
        salario: {
            type: Type.OBJECT,
            properties: {
                min: { type: Type.NUMBER, nullable: true },
                max: { type: Type.NUMBER, nullable: true },
                moneda: { type: Type.STRING, nullable: true },
                periodo: { type: Type.STRING, nullable: true },
                explicito: { type: Type.BOOLEAN },
            },
            propertyOrdering: ["min", "max", "moneda", "periodo", "explicito"],
            required: ["min", "max", "moneda", "periodo", "explicito"],
        },
        requisitos: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        deadline: { type: Type.STRING, nullable: true },
        apply_link: { type: Type.STRING, nullable: true },
    },
    propertyOrdering: [
        "titulo",
        "empresa",
        "modalidad",
        "ubicacion",
        "salario",
        "requisitos",
        "skills",
        "deadline",
        "apply_link",
    ],
    required: [
        "titulo",
        "empresa",
        "modalidad",
        "ubicacion",
        "salario",
        "requisitos",
        "skills",
        "deadline",
        "apply_link",
    ],
};

const PROMPT =
    "Extrae la vacante laboral del correo y responde SOLO con JSON según el " +
    "schema. Si el correo agrupa varias vacantes, extrae la principal o la " +
    "primera. 'titulo': el cargo conciso, sin el nombre de la organización ni " +
    "adornos (p.ej. 'Practicante de Sistemas', no 'UNSA - Convocatoria para " +
    "Practicante'). 'empresa': la organización que contrata; NO uses la bolsa de " +
    "trabajo, universidad o remitente del correo salvo que sea el empleador real; " +
    "cadena vacía si no se identifica. 'ubicacion': ciudad o región en Perú; " +
    "vacía si no aparece. 'modalidad' debe ser una de: presencial, remoto, " +
    "hibrido; si no se indica usa 'presencial'. 'moneda' debe ser PEN o USD si se " +
    "conoce; si no, null. 'periodo' uno de: mes, hora, anio si se conoce; si no, " +
    "null. Para 'salario.explicito' pon true SOLO si el correo da un monto " +
    "concreto; pon false si dice 'según mercado', 'a tratar', 'remuneración " +
    "competitiva' o no menciona monto, y deja min/max en null en ese caso. " +
    "'deadline' en formato YYYY-MM-DD o null; convierte fechas en español (p.ej. " +
    "'15 de marzo de 2026' -> '2026-03-15'). 'skills': lista de tecnologías o " +
    "competencias concretas, en minúsculas, sin duplicados, máximo 12. " +
    "'apply_link': la URL o correo de postulación si aparece; si no, null. Si un " +
    "dato no aparece usa cadena vacía, lista vacía o null según el tipo.";

export function parseExtractedJob(jsonText: string): ExtractedJob {
    return extractedJobSchema.parse(JSON.parse(jsonText));
}

export async function extractJob(emailText: string): Promise<ExtractedJob> {
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
        throw new Error("Gemini returned an empty job extraction");
    }
    return parseExtractedJob(text);
}
