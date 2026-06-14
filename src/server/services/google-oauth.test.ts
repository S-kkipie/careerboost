import { describe, expect, it } from "vitest";
import {
    buildTokenRefreshBody,
    parseTokenRefreshResponse,
} from "@/server/services/google-oauth";

describe("buildTokenRefreshBody", () => {
    it("encodes the four required refresh-token params", () => {
        const body = buildTokenRefreshBody({
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "rtoken",
        });
        expect(body.get("client_id")).toBe("cid");
        expect(body.get("client_secret")).toBe("csecret");
        expect(body.get("refresh_token")).toBe("rtoken");
        expect(body.get("grant_type")).toBe("refresh_token");
    });
});

describe("parseTokenRefreshResponse", () => {
    it("extracts access token, expiry and scope", () => {
        const out = parseTokenRefreshResponse({
            access_token: "ya29.token",
            expires_in: 3599,
            scope: "https://www.googleapis.com/auth/gmail.readonly",
        });
        expect(out.accessToken).toBe("ya29.token");
        expect(out.expiresInSec).toBe(3599);
        expect(out.scope).toBe(
            "https://www.googleapis.com/auth/gmail.readonly",
        );
    });

    it("defaults expiry to 0 and scope to null when absent", () => {
        const out = parseTokenRefreshResponse({ access_token: "ya29.token" });
        expect(out.expiresInSec).toBe(0);
        expect(out.scope).toBeNull();
    });

    it("throws when access_token is missing", () => {
        expect(() => parseTokenRefreshResponse({ expires_in: 10 })).toThrow();
    });

    it("throws when the payload is not an object", () => {
        expect(() => parseTokenRefreshResponse("nope")).toThrow();
        expect(() => parseTokenRefreshResponse(null)).toThrow();
    });
});
