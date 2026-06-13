import {
    boolean,
    date,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    vector,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        gmailMsgId: text("gmail_msg_id").notNull(),
        sourceSender: text("source_sender"),
        titulo: text("titulo"),
        empresa: text("empresa"),
        modalidad: text("modalidad"), // presencial | remoto | hibrido
        ubicacion: text("ubicacion"),
        salarioMin: integer("salario_min"),
        salarioMax: integer("salario_max"),
        moneda: text("moneda"), // PEN | USD
        salarioPeriodo: text("salario_periodo"), // mes | hora | anio
        salarioExplicito: boolean("salario_explicito").notNull().default(false),
        requisitos: text("requisitos"),
        skills: text("skills").array(),
        deadline: date("deadline"),
        applyLink: text("apply_link"),
        rawEmail: text("raw_email"),
        isJob: boolean("is_job").notNull().default(true),
        noiseReason: text("noise_reason"),
        dedupeHash: text("dedupe_hash").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("jobs_user_gmail_msg_unique").on(table.userId, table.gmailMsgId),
        unique("jobs_user_dedupe_unique").on(table.userId, table.dedupeHash),
        index("jobs_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
        index("jobs_user_id_idx").on(table.userId),
    ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
