import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { gmailRouter } from "@/server/routers/gmail";
import { healthRouter } from "@/server/routers/health";
import { meRouter } from "@/server/routers/me";

const logger = getLogger(["server", "error"]);

const betterAuth = new Elysia({ name: "better-auth" }).mount(auth.handler);

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
    .use(healthRouter)
    .use(meRouter)
    .use(gmailRouter);

export default app;
export type AppRouter = typeof app;
