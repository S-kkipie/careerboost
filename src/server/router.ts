import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { healthRouter } from "@/server/routers/health";

const logger = getLogger(["server", "error"]);

// Better Auth is wired with an explicit `/auth/*` route rather than `.mount`.
// A root `.mount(auth.handler)` acts as a catch-all: it answers every unmatched
// path with Better Auth's own bare 404, so Elysia never raises NOT_FOUND and the
// `onError` handler below cannot shape the body. The `.all("/auth/*")` form scopes
// the handler to auth paths only, letting unknown routes fall through to `onError`.
// auth.handler still receives the full `/api/v1/auth/*` path it expects (basePath).
const betterAuth = new Elysia({ name: "better-auth" }).all(
    "/auth/*",
    ({ request }) => auth.handler(request),
);

const app = new Elysia({ prefix: "/api/v1" })
    .use(betterAuth)
    .use(elysiaLogger({ category: ["server", "http"] }))
    .onError(({ error, code, set }) => {
        if (code === "NOT_FOUND") {
            return { code: "NOT_FOUND" };
        }
        if (code === "VALIDATION") {
            return {
                code: "VALIDATION",
                message: error instanceof Error ? error.message : String(error),
            };
        }
        logger.error("API {code}: {error}", {
            code,
            error: error instanceof Error ? error.message : String(error),
        });
        set.status = 500;
        return { code: "INTERNAL_SERVER_ERROR" };
    })
    .use(healthRouter);

export default app;
export type AppRouter = typeof app;
