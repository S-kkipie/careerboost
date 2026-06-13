import { eq } from "drizzle-orm";
import { embedText } from "@/server/ai/embed";
import {
    type ExtractedProfile,
    extractProfileFromPdf,
} from "@/server/ai/extract-profile";
import { db } from "@/server/drizzle/db";
import { type Profile, profiles } from "@/server/drizzle/schemas/profiles";

export class ProfileNotFoundError extends Error {
    constructor() {
        super("Profile not found for user");
        this.name = "ProfileNotFoundError";
    }
}

export interface ProfilePatch {
    escuelaProfesional?: string;
    grado?: string;
    ubicacion?: string;
    intereses?: string[];
    skills?: string[];
    experienciaResumen?: string;
    expectativaSalarial?: number | null;
}

export function buildProfileEmbeddingText(input: {
    escuelaProfesional: string | null;
    skills: string[] | null;
    experienciaResumen: string | null;
    intereses: string[] | null;
}): string {
    return [
        input.escuelaProfesional ?? "",
        (input.skills ?? []).join(", "),
        input.experienciaResumen ?? "",
        (input.intereses ?? []).join(", "),
    ]
        .filter((segment) => segment.trim().length > 0)
        .join("\n");
}

export async function getProfile(userId: string): Promise<Profile | null> {
    const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
    return rows[0] ?? null;
}

export async function upsertProfileFromCv(params: {
    userId: string;
    cvUrl: string;
    extracted: ExtractedProfile;
    embedding: number[];
}): Promise<Profile> {
    const { userId, cvUrl, extracted, embedding } = params;
    const fields = {
        escuelaProfesional: extracted.escuela_profesional,
        grado: extracted.grado,
        ubicacion: extracted.ubicacion,
        skills: extracted.skills,
        experienciaResumen: extracted.experiencia_resumen,
        intereses: extracted.intereses,
        cvUrl,
        embedding,
    };
    const [row] = await db
        .insert(profiles)
        .values({ userId, ...fields })
        .onConflictDoUpdate({
            target: profiles.userId,
            set: { ...fields, updatedAt: new Date() },
        })
        .returning();
    return row;
}

export async function updateProfileFields(
    userId: string,
    patch: ProfilePatch,
    embedding: number[],
): Promise<Profile> {
    const [row] = await db
        .update(profiles)
        .set({ ...patch, embedding, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))
        .returning();
    return row;
}

// --- Orchestrators (call Gemini; verified manually) ---

export async function processCvAndSaveProfile(params: {
    userId: string;
    cvUrl: string;
    pdfBytes: Uint8Array;
}): Promise<Profile> {
    const extracted = await extractProfileFromPdf(params.pdfBytes);
    const embedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: extracted.escuela_profesional,
            skills: extracted.skills,
            experienciaResumen: extracted.experiencia_resumen,
            intereses: extracted.intereses,
        }),
    );
    return upsertProfileFromCv({
        userId: params.userId,
        cvUrl: params.cvUrl,
        extracted,
        embedding,
    });
}

export async function editProfile(
    userId: string,
    patch: ProfilePatch,
): Promise<Profile> {
    const current = await getProfile(userId);
    if (!current) {
        throw new ProfileNotFoundError();
    }
    const merged = { ...current, ...patch };
    const embedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: merged.escuelaProfesional,
            skills: merged.skills,
            experienciaResumen: merged.experienciaResumen,
            intereses: merged.intereses,
        }),
    );
    return updateProfileFields(userId, patch, embedding);
}
