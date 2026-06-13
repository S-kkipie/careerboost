import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
    decodeBase64Url,
    extractMessageText,
    getHeader,
    stripHtml,
} from "@/server/services/gmail-parse";

function b64url(s: string): string {
    return Buffer.from(s, "utf8").toString("base64url");
}

describe("decodeBase64Url", () => {
    it("decodes base64url back to utf8", () => {
        expect(decodeBase64Url(b64url("hola mundo"))).toBe("hola mundo");
    });
});

describe("getHeader", () => {
    it("finds a header case-insensitively", () => {
        const headers = [
            { name: "From", value: "a@b.com" },
            { name: "Subject", value: "Vacante" },
        ];
        expect(getHeader(headers, "from")).toBe("a@b.com");
        expect(getHeader(headers, "SUBJECT")).toBe("Vacante");
    });

    it("returns null when absent or undefined", () => {
        expect(getHeader([], "From")).toBeNull();
        expect(getHeader(undefined, "From")).toBeNull();
    });
});

describe("stripHtml", () => {
    it("removes tags, scripts, styles and decodes basic entities", () => {
        const html =
            "<style>x{}</style><p>Hola&nbsp;&amp; <b>mundo</b></p><script>1</script>";
        expect(stripHtml(html)).toBe("Hola & mundo");
    });
});

describe("extractMessageText", () => {
    it("prefers text/plain over text/html", () => {
        const payload = {
            mimeType: "multipart/alternative",
            parts: [
                {
                    mimeType: "text/plain",
                    body: { data: b64url("plano  texto") },
                },
                {
                    mimeType: "text/html",
                    body: { data: b64url("<p>html</p>") },
                },
            ],
        };
        expect(extractMessageText(payload)).toBe("plano texto");
    });

    it("falls back to stripped text/html when no plain part exists", () => {
        const payload = {
            mimeType: "multipart/alternative",
            parts: [
                {
                    mimeType: "text/html",
                    body: { data: b64url("<p>solo html</p>") },
                },
            ],
        };
        expect(extractMessageText(payload)).toBe("solo html");
    });

    it("reads a single-part body when there are no sub-parts", () => {
        const payload = {
            mimeType: "text/plain",
            body: { data: b64url("cuerpo") },
        };
        expect(extractMessageText(payload)).toBe("cuerpo");
    });

    it("returns empty string for an empty payload", () => {
        expect(extractMessageText(undefined)).toBe("");
    });
});
