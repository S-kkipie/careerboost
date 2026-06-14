import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const rerankFlagsSchema = z.object({
    skills_match: z.boolean(),
    salario_transparente: z.boolean(),
});

export const rerankItemSchema = z.object({
    job_id: z.string(),
    match_score: z.number(),
    explanation: z.string(),
    flags: rerankFlagsSchema,
});

export const rerankResultSchema = z.object({
    results: z.array(rerankItemSchema),
});

export type RerankFlags = z.infer<typeof rerankFlagsSchema>;
export type RerankItem = z.infer<typeof rerankItemSchema>;

export interface RerankProfileInput {
    escuelaProfesional: string | null;
    skills: string[] | null;
    experienciaResumen: string | null;
    intereses: string[] | null;
}

export interface RerankCandidateInput {
    job_id: string;
    titulo: string;
    empresa: string;
    requisitos: string;
    salario: string;
}

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        results: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    job_id: { type: Type.STRING },
                    match_score: { type: Type.NUMBER },
                    explanation: { type: Type.STRING },
                    flags: {
                        type: Type.OBJECT,
                        properties: {
                            skills_match: { type: Type.BOOLEAN },
                            salario_transparente: { type: Type.BOOLEAN },
                        },
                        propertyOrdering: [
                            "skills_match",
                            "salario_transparente",
                        ],
                        required: ["skills_match", "salario_transparente"],
                    },
                },
                propertyOrdering: [
                    "job_id",
                    "match_score",
                    "explanation",
                    "flags",
                ],
                required: ["job_id", "match_score", "explanation", "flags"],
            },
        },
    },
    propertyOrdering: ["results"],
    required: ["results"],
};

const PROMPT =
    "Eres un asistente de empleabilidad para egresados universitarios. Recibes " +
    "un perfil y una lista de vacantes (cada una con su 'job_id'). Para CADA " +
    "vacante devuelve un objeto con: 'job_id' EXACTAMENTE igual al recibido; " +
    "'match_score' entero de 0 a 100 que mida qué tan bien encaja la vacante con " +
    "el perfil (carrera, skills, experiencia e intereses); 'explanation' en " +
    "español, concreta y personal (p.ej. 'encaja con tu experiencia en X y tu " +
    "interés en Y'); y 'flags' con 'skills_match' (true si las skills requeridas " +
    "coinciden con las del perfil) y 'salario_transparente' (true si la vacante " +
    "indica un salario concreto, false si dice 'No especificado'). Responde SOLO " +
    "con JSON según el schema e incluye TODAS las vacantes recibidas.";

export function parseRerank(jsonText: string): RerankItem[] {
    return rerankResultSchema.parse(JSON.parse(jsonText)).results;
}

// Calls Gemini; verified manually.
export async function rerankJobs(
    profile: RerankProfileInput,
    candidates: RerankCandidateInput[],
): Promise<RerankItem[]> {
    const payload = JSON.stringify({ perfil: profile, vacantes: candidates });
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ text: PROMPT }, { text: payload }],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty rerank response");
    }
    return parseRerank(text);
}
