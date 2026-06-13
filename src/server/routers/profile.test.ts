import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/profile (auth gating)", () => {
    it("GET returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("PUT returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ubicacion: "Arequipa" }),
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("POST /cv returns 401 when unauthenticated (valid PDF supplied)", async () => {
        const form = new FormData();
        const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
            type: "application/pdf",
        });
        form.append("file", pdf, "cv.pdf");
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile/cv", {
                method: "POST",
                body: form,
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
