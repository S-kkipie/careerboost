import { describe, expect, it } from "vitest";
import app from "./router";

describe("router", () => {
    it("GET /api/v1/health returns { ok: true }", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/health"),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it("unknown route returns 404 { code: 'NOT_FOUND' }", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/nonexistent"),
        );
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "NOT_FOUND" });
    });
});
