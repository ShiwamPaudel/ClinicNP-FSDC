/**
 * backup-keys.ts — what a kept backup is called, and which ones to let go.
 *
 * Pure, so the rules can be tested without a store. The `backups` table has
 * recorded a row per backup since 0001; until C-016 its `blob_url` always said
 * 'download' and no file was kept anywhere (D-138). A kept backup's row now
 * holds its storage key instead, which is all it takes to tell the two apart —
 * no migration, and the old rows stay as the honest record they are.
 */

/** Every kept backup lives under this prefix. Nothing else writes there. */
export const KEPT_PREFIX = "backups/";

/** Why a backup was taken. The table's `kind` only knows daily and manual. */
export type BackupPurpose = "nightly" | "manual" | "year-end";

/** How many of each are kept. The copy taken before closing a year is never let go. */
export const KEEP: Record<Exclude<BackupPurpose, "year-end">, number> = {
  nightly: 30,
  manual: 20,
};

export function kindFor(purpose: BackupPurpose): "daily" | "manual" {
  return purpose === "nightly" ? "daily" : "manual";
}

/** "2026-09-22T18:00:02.123Z" -> "2026-09-22T18-00-02Z", safe in a key and a file name. */
function stamp(iso: string): string {
  return iso.replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

export function keptBackupKey(createdAtIso: string, purpose: BackupPurpose): string {
  return `${KEPT_PREFIX}clinicnp-backup-${stamp(createdAtIso)}-${purpose}.json.gz`; // sweep-ok: a storage key, not prose
}

export function isKeptKey(blobUrl: string): boolean {
  return blobUrl.startsWith(KEPT_PREFIX);
}

export function purposeOf(kind: string, blobUrl: string): BackupPurpose {
  if (isKeptKey(blobUrl) && blobUrl.includes("-year-end.")) return "year-end";
  return kind === "daily" ? "nightly" : "manual";
}

/** What the downloaded file is called: the same shape as "Back up now". */
export function downloadName(createdAtIso: string, purpose: BackupPurpose): string {
  const suffix = purpose === "manual" ? "" : `-${purpose}`;
  return `clinicnp-backup-${createdAtIso.slice(0, 10)}${suffix}.json`; // sweep-ok: a downloaded file's extension, not prose
}

export interface KeptRow {
  id: string;
  kind: string;
  blobUrl: string;
  createdAt: string;
}

/**
 * The kept backups past what is kept of their kind, oldest first. Rows that
 * never had a file are not considered: they cost nothing and they are the
 * record of what happened before backups were kept.
 */
export function backupsToLetGo(rows: KeptRow[]): KeptRow[] {
  const byPurpose = new Map<BackupPurpose, KeptRow[]>();
  for (const r of rows) {
    if (!isKeptKey(r.blobUrl)) continue;
    const p = purposeOf(r.kind, r.blobUrl);
    if (p === "year-end") continue;
    byPurpose.set(p, [...(byPurpose.get(p) ?? []), r]);
  }
  const out: KeptRow[] = [];
  for (const [purpose, list] of byPurpose) {
    const newestFirst = [...list].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    out.push(...newestFirst.slice(KEEP[purpose as keyof typeof KEEP]));
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}
