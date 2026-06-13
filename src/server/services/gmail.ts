import { auth } from "@/server/auth/auth";

export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export interface GmailProfile {
    emailAddress: string;
    messagesTotal: number;
}

export async function getGoogleAccessToken(
    userId: string,
    requestHeaders: Headers,
): Promise<string> {
    const { accessToken } = await auth.api.getAccessToken({
        body: { providerId: "google", userId },
        headers: requestHeaders,
    });
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
        throw new Error(`Gmail API error ${res.status}`);
    }
    return (await res.json()) as GmailProfile;
}
