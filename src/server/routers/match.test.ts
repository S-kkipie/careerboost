import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/match (auth gating)", () => {
    it("POST /match returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match", { method: "POST" }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /match returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /match/:id returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match/some-id"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("PATCH /match/:id returns 401 when unauthenticated (valid body)", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match/some-id", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "seen" }),
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
