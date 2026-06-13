import { Buffer } from "node:buffer";

export interface GmailHeader {
    name: string;
    value: string;
}

export interface GmailPayloadPart {
    mimeType?: string;
    filename?: string;
    headers?: GmailHeader[];
    body?: { data?: string; size?: number };
    parts?: GmailPayloadPart[];
}

export interface GmailMessageResponse {
    id: string;
    payload?: GmailPayloadPart;
    snippet?: string;
}

export function decodeBase64Url(data: string): string {
    return Buffer.from(data, "base64url").toString("utf8");
}

export function getHeader(
    headers: GmailHeader[] | undefined,
    name: string,
): string | null {
    const target = name.toLowerCase();
    const found = headers?.find((h) => h.name.toLowerCase() === target);
    return found?.value ?? null;
}

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function findPart(
    part: GmailPayloadPart,
    mimeType: string,
): GmailPayloadPart | null {
    if (part.mimeType === mimeType && part.body?.data) {
        return part;
    }
    for (const child of part.parts ?? []) {
        const found = findPart(child, mimeType);
        if (found) {
            return found;
        }
    }
    return null;
}

// Walk the MIME tree; prefer text/plain, fall back to stripped text/html,
// then to a single-part body. Returns "" when nothing decodable is present.
export function extractMessageText(
    payload: GmailPayloadPart | undefined,
): string {
    if (!payload) {
        return "";
    }
    const plain = findPart(payload, "text/plain");
    if (plain?.body?.data) {
        return decodeBase64Url(plain.body.data).replace(/\s+/g, " ").trim();
    }
    const html = findPart(payload, "text/html");
    if (html?.body?.data) {
        return stripHtml(decodeBase64Url(html.body.data));
    }
    if (payload.body?.data) {
        return decodeBase64Url(payload.body.data).replace(/\s+/g, " ").trim();
    }
    return "";
}
