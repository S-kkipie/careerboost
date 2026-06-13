import { Elysia } from "elysia";

export const healthRouter = new Elysia().get("/health", () => ({ ok: true }));
