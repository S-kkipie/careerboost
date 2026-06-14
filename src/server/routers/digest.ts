import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { getDigest, markDigestSeen } from "@/server/services/digest";

export const digestRouter = new Elysia({ prefix: "/digest" })
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const matches = await getDigest(session.user.id);
        return { matches };
    })
    .post("/seen", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const count = await markDigestSeen(session.user.id);
        return { count };
    });
