import {
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const ingestionRuns = pgTable(
    "ingestion_runs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        startedAt: timestamp("started_at").notNull().defaultNow(),
        finishedAt: timestamp("finished_at"),
        emailsScanned: integer("emails_scanned").notNull().default(0),
        jobsFound: integer("jobs_found").notNull().default(0),
        noiseFiltered: integer("noise_filtered").notNull().default(0),
        dupesRemoved: integer("dupes_removed").notNull().default(0),
    },
    (table) => [index("ingestion_runs_user_id_idx").on(table.userId)],
);

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
