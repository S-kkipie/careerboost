import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { healthRouter } from "@/server/routers/health";

const logger = getLogger(["server", "error"]);

const betterAuth = new Elysia({ name: "better-auth" }).mount(auth.handler);

const app = new Elysia({ prefix: "/api/v1" })
    .use(betterAuth)
    .use(elysiaLogger())
    .onError(({ error, code }) => {
        logger.error("API {code}: {error}", {
            code,
            error: error instanceof Error ? error.message : String(error),
        });
        return { code: "INTERNAL_SERVER_ERROR" };
    })
    .use(healthRouter);

export default app;
export type AppRouter = typeof app;
