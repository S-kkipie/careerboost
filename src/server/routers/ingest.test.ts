import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/ingest (auth gating)", () => {
    it("POST /ingest returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/ingest", { method: "POST" }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /ingest/last returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/ingest/last"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
