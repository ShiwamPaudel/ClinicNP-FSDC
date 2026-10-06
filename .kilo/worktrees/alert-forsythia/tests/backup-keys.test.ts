/**
 * What a kept backup is called and which ones are let go (D-138).
 */
import { describe, it, expect } from "vitest";
import {
  KEEP,
  backupsToLetGo,
  downloadName,
  isKeptKey,
  keptBackupKey,
  purposeOf,
  type KeptRow,
} from "@/lib/backup-keys";

describe("naming a kept backup", () => {
  it("is safe as a storage key and says why it was taken", () => {
    const key = keptBackupKey("2026-09-22T18:00:02.123Z", "nightly");
    expect(key).toBe("backups/clinicnp-backup-2026-09-22T18-00-02Z-nightly.json.gz");
    expect(isKeptKey(key)).toBe(true);
    expect(purposeOf("daily", key)).toBe("nightly");
    expect(purposeOf("manual", keptBackupKey("2026-09-22T05:00:00.000Z", "year-end"))).toBe(
      "year-end",
    );
    expect(purposeOf("manual", keptBackupKey("2026-09-22T05:00:00.000Z", "manual"))).toBe(
      "manual",
    );
  });

  it("tells the old size-only rows apart", () => {
    expect(isKeptKey("download")).toBe(false);
    expect(purposeOf("daily", "download")).toBe("nightly");
    expect(purposeOf("manual", "download")).toBe("manual");
  });

  it("downloads under the name Back up now has always used", () => {
    expect(downloadName("2026-09-22T18:00:02.123Z", "manual")).toBe(
      "clinicnp-backup-2026-09-22.json",
    );
    expect(downloadName("2026-09-22T18:00:02.123Z", "nightly")).toBe(
      "clinicnp-backup-2026-09-22-nightly.json",
    );
  });
});

function rows(n: number, purpose: "nightly" | "manual" | "year-end", day0 = 1): KeptRow[] {
  return Array.from({ length: n }, (_, i) => {
    const createdAt = new Date(Date.UTC(2026, 0, day0 + i, 18)).toISOString();
    return {
      id: `${purpose}-${i}`,
      kind: purpose === "nightly" ? "daily" : "manual",
      blobUrl: keptBackupKey(createdAt, purpose),
      createdAt,
    };
  });
}

describe("which kept backups are let go", () => {
  it("keeps the newest thirty nightly copies and lets the oldest go", () => {
    const nightly = rows(KEEP.nightly + 3, "nightly");
    const gone = backupsToLetGo(nightly).map((r) => r.id);
    expect(gone).toEqual(["nightly-0", "nightly-1", "nightly-2"]);
  });

  it("keeps twenty from Back up now, counted apart from the nightly ones", () => {
    const all = [...rows(KEEP.nightly, "nightly"), ...rows(KEEP.manual + 1, "manual")];
    expect(backupsToLetGo(all).map((r) => r.id)).toEqual(["manual-0"]);
  });

  it("never lets go of the copy taken before closing a year", () => {
    expect(backupsToLetGo(rows(40, "year-end"))).toEqual([]);
  });

  it("leaves the old size-only rows alone", () => {
    const old: KeptRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: `old-${i}`,
      kind: "daily",
      blobUrl: "download",
      createdAt: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
    }));
    expect(backupsToLetGo(old)).toEqual([]);
  });
});
