import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { getAllJobs } from "@/server/services/matching";

export const jobsRouter = new Elysia({ prefix: "/jobs" }).get(
    "/",
    async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const jobs = await getAllJobs(session.user.id);
        return { jobs };
    },
);
