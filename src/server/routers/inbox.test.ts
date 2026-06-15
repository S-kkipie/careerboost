import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/inbox (auth gating)", () => {
    it("GET /inbox returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /inbox/live returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox/live"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /inbox/pending-count returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox/pending-count"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
