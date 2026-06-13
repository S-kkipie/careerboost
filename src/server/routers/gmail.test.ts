import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/gmail/profile", () => {
    it("returns 401 { code: 'unauthenticated' } when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/gmail/profile"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
