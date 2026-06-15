import { and, count, eq, inArray, sql } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { db } from "@/server/drizzle/db";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import { jobs } from "@/server/drizzle/schemas/jobs";
import type {
    InboxItem,
    InboxLiveItem,
    InboxResponse,
} from "@/server/routers/inbox.schema";
import {
    buildGmailQuery,
    getMessageMetadata,
    INGEST_MAX_MESSAGES,
    INGEST_NEWER_THAN_DAYS,
    listJobMessageIds,
    resolveSenders,
} from "./gmail";
import { toDate } from "./ingestion";

interface InboxRow {
    gmailMsgId: string;
    subject: string | null;
    sender: string | null;
    internalDate: Date | null;
    noiseReason: string | null;
    jobId: string | null;
    titulo: string | null;
    empresa: string | null;
}

// Pure: a DB row -> API item. A row with a jobId is a kept convocatoria;
// otherwise it was filtered as noise.
export function mapInboxRow(row: InboxRow): InboxItem {
    return {
        gmailMsgId: row.gmailMsgId,
        subject: row.subject,
        sender: row.sender,
        date: row.internalDate ? row.internalDate.toISOString() : null,
        kind: row.jobId ? "convocatoria" : "filtrado",
        noiseReason: row.noiseReason,
        jobId: row.jobId,
        titulo: row.titulo,
        empresa: row.empresa,
    };
}

// Pure: which of the live-listed ids are not yet stored for this user.
export function diffNewIds(allIds: string[], storedIds: Set<string>): string[] {
    return allIds.filter((id) => !storedIds.has(id));
}

const INBOX_ITEM_LIMIT = 100;

// Stored, already-classified inbox for a user (instant; DB only). Counts span
// the full set even though items are capped.
export async function getStoredInbox(userId: string): Promise<InboxResponse> {
    const rows = await db
        .select({
            gmailMsgId: ingestedMessages.gmailMsgId,
            subject: ingestedMessages.subject,
            sender: ingestedMessages.sender,
            internalDate: ingestedMessages.internalDate,
            noiseReason: ingestedMessages.noiseReason,
            jobId: ingestedMessages.jobId,
            titulo: jobs.titulo,
            empresa: jobs.empresa,
        })
        .from(ingestedMessages)
        .leftJoin(jobs, eq(ingestedMessages.jobId, jobs.id))
        .where(eq(ingestedMessages.userId, userId))
        .orderBy(sql`${ingestedMessages.internalDate} desc nulls last`)
        .limit(INBOX_ITEM_LIMIT);

    const [agg] = await db
        .select({
            total: count(),
            convocatorias: count(ingestedMessages.jobId),
        })
        .from(ingestedMessages)
        .where(eq(ingestedMessages.userId, userId));

    const total = agg?.total ?? 0;
    const convocatorias = agg?.convocatorias ?? 0;
    return {
        counts: { total, convocatorias, filtrados: total - convocatorias },
        items: rows.map(mapInboxRow),
    };
}

// Live diff: bolsa emails present in Gmail but not yet synced for this user.
// One messages.list call + a headers-only fetch per *new* id (bounded).
export async function getUnprocessedInbox(
    userId: string,
    accessToken: string,
): Promise<InboxLiveItem[]> {
    const senders = resolveSenders(ServerConfig.ingest.senders);
    const query = buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS);
    const ids = await listJobMessageIds(
        accessToken,
        query,
        INGEST_MAX_MESSAGES,
    );
    if (ids.length === 0) {
        return [];
    }
    const storedRows = await db
        .select({ gmailMsgId: ingestedMessages.gmailMsgId })
        .from(ingestedMessages)
        .where(
            and(
                eq(ingestedMessages.userId, userId),
                inArray(ingestedMessages.gmailMsgId, ids),
            ),
        );
    const stored = new Set(storedRows.map((r) => r.gmailMsgId));
    const fresh = diffNewIds(ids, stored);

    const items: InboxLiveItem[] = [];
    for (const id of fresh) {
        try {
            const m = await getMessageMetadata(accessToken, id);
            const parsed = toDate(m.date);
            items.push({
                gmailMsgId: m.id,
                subject: m.subject,
                sender: m.sender,
                date: parsed ? parsed.toISOString() : null,
            });
        } catch {
            // Tolerate a single failed metadata fetch; never log raw content.
        }
    }
    return items;
}
