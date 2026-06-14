const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokenRefresh {
    accessToken: string;
    expiresInSec: number;
    scope: string | null;
}

export function buildTokenRefreshBody(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): URLSearchParams {
    return new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        refresh_token: params.refreshToken,
        grant_type: "refresh_token",
    });
}

// Narrow with `in` + `typeof` (no casts) so the response shape is validated
// at runtime. Never include the parsed token in thrown messages.
export function parseTokenRefreshResponse(json: unknown): GoogleTokenRefresh {
    if (typeof json !== "object" || json === null) {
        throw new Error("Google token refresh: response was not an object");
    }
    const accessToken =
        "access_token" in json && typeof json.access_token === "string"
            ? json.access_token
            : null;
    if (!accessToken) {
        throw new Error("Google token refresh: missing access_token");
    }
    const expiresInSec =
        "expires_in" in json && typeof json.expires_in === "number"
            ? json.expires_in
            : 0;
    const scope =
        "scope" in json && typeof json.scope === "string" ? json.scope : null;
    return { accessToken, expiresInSec, scope };
}

// Exchange a stored refresh token for a fresh access token. Throws on HTTP
// failure. Never logs the token or the response body.
export async function refreshGoogleAccessToken(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): Promise<GoogleTokenRefresh> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildTokenRefreshBody(params),
    });
    if (!res.ok) {
        throw new Error(`Google token refresh failed: ${res.status}`);
    }
    return parseTokenRefreshResponse(await res.json());
}
