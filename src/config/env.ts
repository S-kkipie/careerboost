import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        DATABASE_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(32),
        // Tightened to required in Spec 01 (auth); empty is OK during early dev.
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
        GEMINI_API_KEY: z.string().min(1),
        RESEND_API_KEY: z.string().optional(),
        CRON_SECRET: z.string().min(16),
        // Spec 04 — comma-separated bolsa sender addresses; empty falls back to a const.
        BOLSA_SENDERS: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_APP_URL: z.url(),
    },
    runtimeEnv: {
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        CRON_SECRET: process.env.CRON_SECRET,
        BOLSA_SENDERS: process.env.BOLSA_SENDERS,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
});
