import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/jobs (auth gating)", () => {
    it("GET /jobs returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/jobs"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
