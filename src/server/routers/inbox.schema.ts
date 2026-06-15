import { z } from "zod";

// Zod is the source of truth for inbox shapes; types are derived via z.infer.
// The Elysia handlers .parse() their output, so Eden Treaty infers the
// frontend types from these schemas — no hand-written interfaces anywhere.

export const inboxKindSchema = z.enum(["convocatoria", "filtrado"]);

export const inboxItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(), // ISO string from internal_date, or null
    kind: inboxKindSchema,
    noiseReason: z.string().nullable(), // set when kind === "filtrado"
    jobId: z.string().nullable(), // set when kind === "convocatoria"
    titulo: z.string().nullable(), // joined jobs row (convocatoria)
    empresa: z.string().nullable(), // joined jobs row (convocatoria)
});

export const inboxCountsSchema = z.object({
    total: z.number(),
    convocatorias: z.number(),
    filtrados: z.number(),
});

export const inboxResponseSchema = z.object({
    counts: inboxCountsSchema,
    items: z.array(inboxItemSchema),
});

export const inboxLiveItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(),
});

export const inboxLiveResponseSchema = z.object({
    unprocessed: z.array(inboxLiveItemSchema),
});

export type InboxKind = z.infer<typeof inboxKindSchema>;
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxCounts = z.infer<typeof inboxCountsSchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;
export type InboxLiveItem = z.infer<typeof inboxLiveItemSchema>;
export type InboxLiveResponse = z.infer<typeof inboxLiveResponseSchema>;
