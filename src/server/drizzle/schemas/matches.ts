import {
    index,
    integer,
    jsonb,
    pgTable,
    real,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { jobs } from "./jobs";

export const matches = pgTable(
    "matches",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        jobId: uuid("job_id")
            .notNull()
            .references(() => jobs.id, { onDelete: "cascade" }),
        score: real("score"),
        rerankScore: integer("rerank_score"),
        explanation: text("explanation"),
        flags: jsonb("flags"),
        status: text("status").notNull().default("new"), // new | seen | saved | dismissed
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("matches_user_job_unique").on(table.userId, table.jobId),
        index("matches_user_id_idx").on(table.userId),
    ],
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
