import { Elysia } from "elysia";

export const app = new Elysia({ prefix: "/api" }).group("/v1", (v1) =>
    v1.get("/health", () => ({ ok: true })),
);

export type AppRouter = typeof app;
