import { Buffer } from "node:buffer";
import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const GRADOS = ["egresado", "bachiller", "titulado"] as const;

export const extractedProfileSchema = z.object({
    escuela_profesional: z.string(),
    grado: z.enum(GRADOS),
    ubicacion: z.string(),
    skills: z.array(z.string()),
    experiencia_resumen: z.string(),
    intereses: z.array(z.string()),
});

export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        escuela_profesional: { type: Type.STRING },
        grado: { type: Type.STRING, enum: [...GRADOS] },
        ubicacion: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        experiencia_resumen: { type: Type.STRING },
        intereses: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    propertyOrdering: [
        "escuela_profesional",
        "grado",
        "ubicacion",
        "skills",
        "experiencia_resumen",
        "intereses",
    ],
    required: [
        "escuela_profesional",
        "grado",
        "ubicacion",
        "skills",
        "experiencia_resumen",
        "intereses",
    ],
};

const PROMPT =
    "Extrae el perfil profesional del CV adjunto (PDF) y responde SOLO con JSON " +
    "según el schema. Para 'grado' infiere egresado, bachiller o titulado. " +
    "'intereses' son los roles o áreas objetivo del candidato. Si un dato no " +
    "aparece en el CV, usa cadena vacía o lista vacía.";

export function parseExtractedProfile(jsonText: string): ExtractedProfile {
    return extractedProfileSchema.parse(JSON.parse(jsonText));
}

export async function extractProfileFromPdf(
    pdfBytes: Uint8Array,
): Promise<ExtractedProfile> {
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [
            {
                inlineData: {
                    data: Buffer.from(pdfBytes).toString("base64"),
                    mimeType: "application/pdf",
                },
            },
            { text: PROMPT },
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty profile extraction");
    }
    return parseExtractedProfile(text);
}
