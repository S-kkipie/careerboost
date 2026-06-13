import { authClient } from "./auth";

export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export function requestGmailAccess() {
    return authClient.linkSocial({
        provider: "google",
        scopes: [GMAIL_READONLY_SCOPE],
    });
}
