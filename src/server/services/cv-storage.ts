import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CV_SUBDIR = path.join("uploads", "cv");

// Dev-only local disk storage. Production should swap to a blob store
// (Vercel serverless filesystem is ephemeral). Isolated here for that reason.
export async function saveCvPdf(
    userId: string,
    bytes: Uint8Array,
): Promise<string> {
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(process.cwd(), CV_SUBDIR);
    await mkdir(dir, { recursive: true });
    const relPath = path.join(CV_SUBDIR, `${safeId}.pdf`);
    await writeFile(path.join(process.cwd(), relPath), bytes);
    return relPath;
}
