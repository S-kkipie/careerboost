import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { profiles } from "@/server/drizzle/schemas/profiles";
import {
    buildProfileEmbeddingText,
    getProfile,
    upsertProfileFromCv,
} from "@/server/services/profile";

const TEST_USER_ID = "spec03-profile-test-user";

function fakeEmbedding(): number[] {
    return Array.from({ length: 768 }, () => 0.01);
}

describe("buildProfileEmbeddingText", () => {
    it("joins the relevant fields and skips empty ones", () => {
        const text = buildProfileEmbeddingText({
            escuelaProfesional: "Ing. Sistemas",
            skills: ["TS", "SQL"],
            experienciaResumen: "Backend 2 años",
            intereses: ["Data"],
        });
        expect(text).toContain("Ing. Sistemas");
        expect(text).toContain("TS, SQL");
        expect(text).toContain("Backend 2 años");
        expect(text).toContain("Data");
    });

    it("omits empty fields without leaving blank lines", () => {
        const text = buildProfileEmbeddingText({
            escuelaProfesional: "X",
            skills: [],
            experienciaResumen: null,
            intereses: null,
        });
        expect(text).toBe("X");
    });
});

describe("profile persistence", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("upserts the user's profile (insert then update, no duplicate)", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Profile Test",
            email: "spec03-profile-test@example.com",
            emailVerified: false,
        });

        const first = await upsertProfileFromCv({
            userId: TEST_USER_ID,
            cvUrl: "uploads/cv/first.pdf",
            extracted: {
                escuela_profesional: "Ing. Sistemas",
                grado: "egresado",
                ubicacion: "Arequipa",
                skills: ["TS"],
                experiencia_resumen: "v1",
                intereses: ["Backend"],
            },
            embedding: fakeEmbedding(),
        });
        expect(first.userId).toBe(TEST_USER_ID);
        expect(first.embedding).toHaveLength(768);

        const second = await upsertProfileFromCv({
            userId: TEST_USER_ID,
            cvUrl: "uploads/cv/second.pdf",
            extracted: {
                escuela_profesional: "Ing. Sistemas",
                grado: "egresado",
                ubicacion: "Lima",
                skills: ["TS", "SQL"],
                experiencia_resumen: "v2",
                intereses: ["Data"],
            },
            embedding: fakeEmbedding(),
        });
        expect(second.ubicacion).toBe("Lima");
        expect(second.experienciaResumen).toBe("v2");

        const rows = await db
            .select()
            .from(profiles)
            .where(eq(profiles.userId, TEST_USER_ID));
        expect(rows).toHaveLength(1);

        const fetched = await getProfile(TEST_USER_ID);
        expect(fetched?.ubicacion).toBe("Lima");
    });
});
