/**
 * A backup is kept, can be read back byte for byte, and old ones are let go
 * (D-138). Runs with no storage credentials, so the file store keeps copies
 * in the gitignored .filestore folder — the same code path the private cloud
 * store takes, minus the network.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `backups-kept.${process.pid}-${Date.now()}.db`);

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

beforeAll(async () => {
  // Never reach a real store from a test.
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });

  const c = createClient({ url: `file:${DB_FILE}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migrations, f), "utf8"))) {
      await c.execute(stmt);
    }
  }
  await c.execute(
    "INSERT INTO company (id, name, updated_at) VALUES (1, 'Backup Check', '2026-09-22T00:00:00Z')",
  );
  c.close();
});

/** Every copy this suite kept goes first, then the rows — never the other way. */
async function clearBackups() {
  const { db } = await import("@/lib/db");
  const { deleteFile } = await import("@/lib/file-store");
  const res = await db().execute("SELECT blob_url FROM backups WHERE blob_url LIKE 'backups/%'");
  for (const r of res.rows) await deleteFile(r.blob_url as string);
  await db().execute("DELETE FROM backups");
}

afterAll(async () => {
  await clearBackups();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

describe("keeping a backup", () => {
  it("knows it may keep one here, and that a live server with nothing connected may not", async () => {
    const { backupStorage, keepsBackups } = await import("@/lib/backups");
    expect(await backupStorage()).toBe("local");
    expect(keepsBackups("none")).toBe(false);
    expect(keepsBackups("refused")).toBe(false);
  });

  it("stores the whole archive and hands back exactly the same JSON", async () => {
    const { exportAll, getBackupRecord } = await import("@/lib/repos/backup");
    const { keepBackup, readKeptBackup } = await import("@/lib/backups");

    const archive = await exportAll();
    const kept = await keepBackup(archive, "nightly");

    const rec = await getBackupRecord(kept.id);
    expect(rec?.kind).toBe("daily");
    expect(rec?.blobUrl).toBe(kept.key);
    expect(rec?.size).toBe(JSON.stringify(archive).length);

    const back = await readKeptBackup(kept.id);
    expect(back).not.toBeNull();
    expect(back!.json.toString("utf8")).toBe(JSON.stringify(archive));
    expect(back!.fileName).toBe(
      `clinicnp-backup-${archive.createdAt.slice(0, 10)}-nightly.json`,
    );
    // and it is the company we put there
    const parsed = JSON.parse(back!.json.toString("utf8"));
    expect(parsed.tables.company[0].name).toBe("Backup Check");
  });

  it("will not hand over a row that never had a file", async () => {
    const { recordBackup } = await import("@/lib/repos/backup");
    const { readKeptBackup } = await import("@/lib/backups");
    const id = await recordBackup("daily", 1234);
    expect(await readKeptBackup(id)).toBeNull();
    expect(await readKeptBackup("no-such-id")).toBeNull();
  });
});

describe("letting old backups go", () => {
  it("keeps thirty nightly and twenty manual copies, every year-end copy and every old row", async () => {
    const { exportAll, recordBackup, listKeptBackupRows, listBackups } = await import(
      "@/lib/repos/backup"
    );
    const { keepBackup, letGoOfOldBackups } = await import("@/lib/backups");
    const { getFile } = await import("@/lib/file-store");

    await clearBackups();
    const archive = await exportAll();
    const at = (day: number) =>
      ({ ...archive, createdAt: new Date(Date.UTC(2026, 0, day, 18)).toISOString() });

    const nightly = [];
    for (let d = 1; d <= 32; d++) nightly.push(await keepBackup(at(d), "nightly"));
    for (let d = 1; d <= 21; d++) await keepBackup(at(d), "manual");
    await keepBackup(at(1), "year-end");
    await recordBackup("daily", 999, "download", "2025-01-01T00:00:00.000Z");

    const removed = await letGoOfOldBackups();
    expect(removed).toBe(3); // two nightly, one manual

    const kept = await listKeptBackupRows();
    expect(kept.filter((r) => r.kind === "daily")).toHaveLength(30);
    expect(kept.filter((r) => r.blobUrl.includes("-manual."))).toHaveLength(20);
    expect(kept.filter((r) => r.blobUrl.includes("-year-end."))).toHaveLength(1);
    // the two oldest nightly copies are gone, file and row
    for (const gone of nightly.slice(0, 2)) {
      expect(kept.some((r) => r.id === gone.id)).toBe(false);
      expect(await getFile(gone.key)).toBeNull();
    }
    // the size-only row from before is still listed
    expect((await listBackups()).some((b) => b.blobUrl === "download")).toBe(true);
  });
});

describe("the backup a year close needs when nothing is kept", () => {
  it("counts a backup taken in the last day, and not an older one", async () => {
    const { recordBackup, backupTakenSince } = await import("@/lib/repos/backup");
    await clearBackups();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    await recordBackup("manual", 10, "download", new Date(Date.now() - 30 * 3600 * 1000).toISOString());
    expect(await backupTakenSince(dayAgo)).toBe(false);

    // a nightly row does not count: it is not the admin's own copy
    await recordBackup("daily", 10);
    expect(await backupTakenSince(dayAgo)).toBe(false);

    await recordBackup("manual", 10);
    expect(await backupTakenSince(dayAgo)).toBe(true);
  });
});
