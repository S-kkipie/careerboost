import { APIError } from "better-auth";
import { auth } from "@/server/auth/auth";
import {
    extractMessageText,
    type GmailMessageResponse,
    getHeader,
} from "./gmail-parse";

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

export const DEFAULT_BOLSA_SENDERS = ["udeeg_convocatorias@unsa.edu.pe"];
// 3-month window: scan the last ~quarter of bolsa mail. Cap raised to absorb
// the higher volume so a busy quarter is not truncated mid-list.
export const INGEST_NEWER_THAN_DAYS = 90;
export const INGEST_MAX_MESSAGES = 200;

export interface ParsedGmailMessage {
    id: string;
    sender: string | null;
    subject: string | null;
    date: string | null;
    text: string;
}

export function resolveSenders(configured: string | undefined): string[] {
    const parsed = (configured ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_BOLSA_SENDERS;
}

export function buildGmailQuery(
    senders: string[],
    newerThanDays: number,
): string {
    const from = senders
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join(" OR ");
    return `from:(${from}) newer_than:${newerThanDays}d`;
}

export async function listJobMessageIds(
    accessToken: string,
    query: string,
    maxResults: number,
): Promise<string[]> {
    const url = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(
    accessToken: string,
    messageId: string,
): Promise<ParsedGmailMessage> {
    const url = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    );
    url.searchParams.set("format", "full");
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    const msg = (await res.json()) as GmailMessageResponse;
    const headers = msg.payload?.headers;
    return {
        id: msg.id,
        sender: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        text: extractMessageText(msg.payload),
    };
}

export interface GmailMessageMetadata {
    id: string;
    sender: string | null;
    subject: string | null;
    date: string | null; // raw Date header
}

// Fetches only the headers we display in the bandeja (no body is ever fetched
// here — lighter, and avoids touching message content for a transparency view).
export async function getMessageMetadata(
    accessToken: string,
    messageId: string,
): Promise<GmailMessageMetadata> {
    const url = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    );
    url.searchParams.set("format", "metadata");
    url.searchParams.append("metadataHeaders", "Subject");
    url.searchParams.append("metadataHeaders", "From");
    url.searchParams.append("metadataHeaders", "Date");
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    const msg = (await res.json()) as GmailMessageResponse;
    const headers = msg.payload?.headers;
    return {
        id: msg.id,
        sender: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
    };
}
