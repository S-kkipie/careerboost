import type { FeedItem } from "@/server/services/matching";

const RESEND_API_URL = "https://api.resend.com/emails";
const KEY_MESSAGE =
    "Más de 100 correos al mes, ahora en un solo resumen. Esto es lo nuevo para ti:";

export interface DigestEmailPayload {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function salaryLine(job: FeedItem["job"]): string {
    if (!job.salario_explicito || job.salario_min == null) {
        return "Salario no especificado";
    }
    const amount =
        job.salario_max != null && job.salario_max !== job.salario_min
            ? `${job.salario_min}-${job.salario_max}`
            : `${job.salario_min}`;
    return [job.moneda ?? "", amount, job.salario_periodo ?? ""]
        .filter((segment) => segment.length > 0)
        .join(" ");
}

// Build a minimal HTML + text digest email. Pure: no network, no logging.
export function buildDigestEmail(params: {
    to: string;
    from: string;
    items: FeedItem[];
    appUrl: string;
}): DigestEmailPayload {
    const { to, from, items, appUrl } = params;
    const count = items.length;
    const noun = count === 1 ? "nueva oportunidad" : "nuevas oportunidades";
    const subject = `Tu digest CareerBoost: ${count} ${noun}`;
    const digestUrl = `${appUrl}/digest`;

    const cards = items
        .map((item) => {
            const titulo = escapeHtml(item.job.titulo ?? "Oportunidad");
            const empresa = item.job.empresa
                ? `${escapeHtml(item.job.empresa)}<br/>`
                : "";
            const salary = escapeHtml(salaryLine(item.job));
            const link = escapeHtml(item.job.apply_link ?? `${appUrl}/feed`);
            const pct =
                item.rerank_score == null
                    ? ""
                    : ` · ${Math.round(item.rerank_score)}% match`;
            return [
                `<li style="margin-bottom:16px">`,
                `<strong>${titulo}</strong>${pct}<br/>`,
                empresa,
                `${salary}<br/>`,
                `<a href="${link}">Postular</a>`,
                `</li>`,
            ].join("");
        })
        .join("");

    const html = [
        `<h2>${escapeHtml(subject)}</h2>`,
        `<p>${escapeHtml(KEY_MESSAGE)}</p>`,
        `<ul>${cards}</ul>`,
        `<p><a href="${escapeHtml(digestUrl)}">Ver tu digest completo</a></p>`,
    ].join("");

    const textLines = items.map((item) => {
        const titulo = item.job.titulo ?? "Oportunidad";
        const empresa = item.job.empresa ? ` — ${item.job.empresa}` : "";
        const link = item.job.apply_link ?? `${appUrl}/feed`;
        return `• ${titulo}${empresa}\n  ${salaryLine(item.job)}\n  ${link}`;
    });
    const text = [KEY_MESSAGE, "", ...textLines, "", digestUrl].join("\n");

    return { from, to, subject, html, text };
}

// Send via Resend's HTTP API. Throws on failure. Never logs the API key or
// the email body.
export async function sendDigestEmail(
    payload: DigestEmailPayload,
    apiKey: string,
): Promise<void> {
    const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
        }),
    });
    if (!res.ok) {
        throw new Error(`Resend send failed: ${res.status}`);
    }
}
