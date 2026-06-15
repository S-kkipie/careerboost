import { Elysia, t } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    editProfile,
    getProfile,
    ProfileNotFoundError,
    processCvAndSaveProfile,
} from "@/server/services/profile";

export const profileRouter = new Elysia({ prefix: "/profile" })
    .post(
        "/cv",
        async ({ request, body, status }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const bytes = new Uint8Array(await body.file.arrayBuffer());
            const profile = await processCvAndSaveProfile({
                userId: session.user.id,
                pdfBytes: bytes,
            });
            return { profile, extracted: true };
        },
        {
            body: t.Object({
                file: t.File({
                    type: "application/pdf",
                    maxSize: 10 * 1024 * 1024,
                }),
            }),
        },
    )
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const profile = await getProfile(session.user.id);
        return { profile };
    })
    .put(
        "/",
        async ({ request, body, status }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            try {
                const profile = await editProfile(session.user.id, body);
                return { profile };
            } catch (e) {
                if (e instanceof ProfileNotFoundError) {
                    return status(404, { code: "profile_not_found" });
                }
                throw e;
            }
        },
        {
            body: t.Object({
                escuelaProfesional: t.Optional(t.String()),
                grado: t.Optional(t.String()),
                ubicacion: t.Optional(t.String()),
                intereses: t.Optional(t.Array(t.String())),
                skills: t.Optional(t.Array(t.String())),
                experienciaResumen: t.Optional(t.String()),
                expectativaSalarial: t.Optional(
                    t.Union([t.Integer(), t.Null()]),
                ),
            }),
        },
    );
