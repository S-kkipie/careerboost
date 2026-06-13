import { env } from "./env";

export const ServerConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
} as const;
