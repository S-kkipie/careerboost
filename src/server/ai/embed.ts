import { EMBEDDING_DIM, GEMINI_EMBED_MODEL, genai } from "./client";

export function toEmbeddingVector(values: number[] | undefined): number[] {
    if (!values || values.length !== EMBEDDING_DIM) {
        throw new Error(
            `Expected ${EMBEDDING_DIM}-dim embedding, got ${values?.length ?? 0}`,
        );
    }
    return values;
}

export async function embedText(text: string): Promise<number[]> {
    const res = await genai.models.embedContent({
        model: GEMINI_EMBED_MODEL,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIM },
    });
    return toEmbeddingVector(res.embeddings?.[0]?.values);
}
