import { createHash } from "node:crypto";

export function normalizeTitle(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ISO 8601 year-week (e.g. "2026-W24") of a YYYY-MM-DD date string.
// Deterministic: the caller supplies the date, never `now`.
export function weekKey(isoDate: string): string {
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return "nodate";
    }
    const date = new Date(
        Date.UTC(
            parsed.getUTCFullYear(),
            parsed.getUTCMonth(),
            parsed.getUTCDate(),
        ),
    );
    // Shift to the Thursday of this ISO week.
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const isoYear = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week =
        1 +
        Math.round(
            (date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000),
        );
    return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function computeDedupeHash(input: {
    titulo: string;
    empresa: string;
    weekDate: string | null;
}): string {
    const key = [
        normalizeTitle(input.titulo),
        normalizeTitle(input.empresa),
        input.weekDate ? weekKey(input.weekDate) : "nodate",
    ].join("|");
    return createHash("sha256").update(key).digest("hex");
}
