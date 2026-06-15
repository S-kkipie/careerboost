// Builds a Gmail web URL that opens an exact message. The Gmail API message id
// is valid in the #all/<id> fragment; authuser disambiguates multiple accounts.
export function gmailMessageUrl(
    email: string | null | undefined,
    gmailMsgId: string,
): string {
    if (!email) {
        return `https://mail.google.com/mail/u/0/#all/${gmailMsgId}`;
    }
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${gmailMsgId}`;
}
