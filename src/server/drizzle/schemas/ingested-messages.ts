import {
    index,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { jobs } from "./jobs";

// Per-user log of processed Gmail messages. The global `jobs` pool holds only
// real convocatorias; this table records, per user, which inbox messages were
// already handled (job -> jobId set; noise -> jobId null + noiseReason).
export const ingestedMessages = pgTable(
    "ingested_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        gmailMsgId: text("gmail_msg_id").notNull(),
        jobId: uuid("job_id").references(() => jobs.id, {
            onDelete: "set null",
        }),
        noiseReason: text("noise_reason"),
        subject: text("subject"),
        sender: text("sender"),
        internalDate: timestamp("internal_date"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("ingested_messages_user_msg_unique").on(
            table.userId,
            table.gmailMsgId,
        ),
        index("ingested_messages_user_id_idx").on(table.userId),
    ],
);

export type IngestedMessage = typeof ingestedMessages.$inferSelect;
export type NewIngestedMessage = typeof ingestedMessages.$inferInsert;
