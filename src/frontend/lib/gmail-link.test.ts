import { describe, expect, it } from "vitest";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";

describe("gmailMessageUrl", () => {
    it("builds an authuser URL with the encoded email", () => {
        expect(gmailMessageUrl("a+b@unsa.edu.pe", "msg123")).toBe(
            "https://mail.google.com/mail/?authuser=a%2Bb%40unsa.edu.pe#all/msg123",
        );
    });

    it("falls back to u/0 when no email", () => {
        expect(gmailMessageUrl(null, "msg123")).toBe(
            "https://mail.google.com/mail/u/0/#all/msg123",
        );
    });
});
