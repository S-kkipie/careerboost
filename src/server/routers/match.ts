import { Elysia, t } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    getFeed,
    ProfileNotReadyError,
    runMatching,
    setMatchStatus,
} from "@/server/services/matching";

export const matchRouter = new Elysia({ prefix: "/match" })
    .post("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            return await runMatching({ userId: session.user.id });
        } catch (e) {
            if (e instanceof ProfileNotReadyError) {
                return status(400, { code: "profile_not_ready" });
            }
            throw e;
        }
    })
    .get(
        "/",
        async ({ request, status, query }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const feed = await getFeed(session.user.id, {
                soloConSalario: query.solo_con_salario === "true",
                modalidad: query.modalidad,
                ubicacion: query.ubicacion,
            });
            return { matches: feed };
        },
        {
            query: t.Object({
                solo_con_salario: t.Optional(t.String()),
                modalidad: t.Optional(t.String()),
                ubicacion: t.Optional(t.String()),
            }),
        },
    )
    .patch(
        "/:id",
        async ({ request, status, params, body }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const updated = await setMatchStatus(
                session.user.id,
                params.id,
                body.status,
            );
            if (!updated) {
                return status(404, { code: "match_not_found" });
            }
            return { match: updated };
        },
        {
            params: t.Object({ id: t.String() }),
            body: t.Object({
                status: t.Union([
                    t.Literal("seen"),
                    t.Literal("saved"),
                    t.Literal("dismissed"),
                ]),
            }),
        },
    );
