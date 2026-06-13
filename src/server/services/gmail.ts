import { APIError } from "better-auth";
import { auth } from "@/server/auth/auth";

export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export interface GmailProfile {
    emailAddress: string;
    messagesTotal: number;
}

export class GmailApiError extends Error {
    constructor(public readonly status: number) {
        super(`Gmail API error ${status}`);
        this.name = "GmailApiError";
    }
}

export class GmailNotConnectedError extends Error {
    constructor() {
        super("Google account not connected for Gmail access");
        this.name = "GmailNotConnectedError";
    }
}

export async function getGoogleAccessToken(
    userId: string,
    requestHeaders: Headers,
): Promise<string> {
    let accessToken: string | undefined;
    try {
        const res = await auth.api.getAccessToken({
            body: { providerId: "google", userId },
            headers: requestHeaders,
        });
        accessToken = res.accessToken;
    } catch (e) {
        if (e instanceof APIError) {
            throw new GmailNotConnectedError();
        }
        throw e;
    }
    if (!accessToken) {
        throw new GmailNotConnectedError();
    }
    return accessToken;
}

export async function getGmailProfile(
    accessToken: string,
): Promise<GmailProfile> {
    const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    return (await res.json()) as GmailProfile;
}
