import { env } from "./env";

const DEFAULT_RESEND_FROM = "CareerBoost <onboarding@resend.dev>";

export const ServerConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    gemini: {
        apiKey: env.GEMINI_API_KEY,
    },
    ingest: {
        // Comma-separated bolsa sender addresses; empty -> DEFAULT_BOLSA_SENDERS in gmail.ts.
        senders: env.BOLSA_SENDERS,
    },
    cron: {
        secret: env.CRON_SECRET,
    },
    resend: {
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM ?? DEFAULT_RESEND_FROM,
    },
} as const;
