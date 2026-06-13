import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getLogger } from "@logtape/logtape";
import { APIError, betterAuth } from "better-auth";
import { multiSession, openAPI } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache } from "react";
import { ServerConfig } from "@/config/server-config";
import { db } from "@/server/drizzle/db";
import * as authSchema from "@/server/drizzle/schemas/auth-schema";

const logger = getLogger(["server", "auth"]);

export const auth = betterAuth({
    experimental: { joins: true },
    baseURL: ServerConfig.baseUrl,
    basePath: "/api/v1/auth",
    socialProviders: {
        google: {
            clientId: ServerConfig.google.clientId,
            clientSecret: ServerConfig.google.clientSecret,
            // Needed for a refresh token (offline Gmail access).
            accessType: "offline",
            prompt: "select_account consent",
        },
    },
    plugins: [openAPI(), multiSession()],
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
});

export const authenticate = cache(async () => {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) return null;
        return { user: session.user, session: session.session };
    } catch (e) {
        if (e instanceof APIError) {
            logger.warn("auth APIError: {error}", { error: e.message });
            return null;
        }
        logger.error("auth error: {error}", { error: e });
        return null;
    }
});
