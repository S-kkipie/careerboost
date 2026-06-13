import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        DATABASE_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(32),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
        GEMINI_API_KEY: z.string().min(1),
        RESEND_API_KEY: z.string().optional(),
        CRON_SECRET: z.string().min(16),
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
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
});
