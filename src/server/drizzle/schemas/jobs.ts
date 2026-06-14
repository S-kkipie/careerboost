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

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
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
        dedupeHash: text("dedupe_hash").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("jobs_dedupe_unique").on(table.dedupeHash),
        index("jobs_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
