import { env } from "./env";

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
} as const;
