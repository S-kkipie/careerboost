import { describe, expect, it } from "vitest";
import { buildDigestEmail, escapeHtml } from "@/server/services/digest-email";
import type { FeedItem } from "@/server/services/matching";

function makeItem(over: Partial<FeedItem["job"]> = {}): FeedItem {
    return {
        id: "m1",
        rerank_score: 82,
        explanation: "Encaja con tu perfil.",
        job: {
            titulo: "Backend Developer",
            empresa: "Acme",
            modalidad: "remoto",
            ubicacion: "Arequipa",
            salario_min: 3000,
            salario_max: 4000,
            moneda: "PEN",
            salario_periodo: "mes",
            salario_explicito: true,
            apply_link: "https://jobs.example/123",
            deadline: null,
            ...over,
        },
        status: "new",
    };
}

describe("escapeHtml", () => {
    it("escapes the five HTML-sensitive characters", () => {
        expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
            "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;",
        );
    });
});

describe("buildDigestEmail", () => {
    const base = {
        to: "egresado@unsa.edu.pe",
        from: "CareerBoost <onboarding@resend.dev>",
        appUrl: "https://app.example",
    };

    it("uses a singular subject for one item", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.subject).toBe("Tu digest CareerBoost: 1 nueva oportunidad");
    });

    it("uses a plural subject for several items", () => {
        const out = buildDigestEmail({
            ...base,
            items: [makeItem(), makeItem({ titulo: "Data Analyst" })],
        });
        expect(out.subject).toBe(
            "Tu digest CareerBoost: 2 nuevas oportunidades",
        );
    });

    it("includes the job title and apply link in the HTML", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.html).toContain("Backend Developer");
        expect(out.html).toContain("https://jobs.example/123");
    });

    it("falls back to the feed URL when a job has no apply link", () => {
        const out = buildDigestEmail({
            ...base,
            items: [makeItem({ apply_link: null })],
        });
        expect(out.html).toContain("https://app.example/feed");
    });

    it("puts the key anti-saturation message in the text body", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.text).toContain("100 correos");
        expect(out.text).toContain("https://app.example/digest");
    });

    it("carries from/to through to the payload", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.from).toBe(base.from);
        expect(out.to).toBe(base.to);
    });
});
