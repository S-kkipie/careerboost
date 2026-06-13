import { integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const profiles = pgTable("profiles", {
    userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    escuelaProfesional: text("escuela_profesional"),
    grado: text("grado"), // egresado | bachiller | titulado (MVP: egresado)
    ubicacion: text("ubicacion"),
    intereses: text("intereses").array(),
    expectativaSalarial: integer("expectativa_salarial"),
    cvUrl: text("cv_url"),
    rawCvText: text("raw_cv_text"),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
