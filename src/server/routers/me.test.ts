import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/me", () => {
    it("returns user:null, gmailConnected:false when unauthenticated", async () => {
        const res = await app.handle(new Request("http://localhost/api/v1/me"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            user: null,
            gmailConnected: false,
        });
    });
});
