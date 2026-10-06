/**
 * Phase 2 acceptance: patients, visits and files, against an isolated file DB.
 * Walks the checklist in Phases.md Phase 2.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase2-clinic.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const TODAY_AD = "2026-08-29";
const TODAY_BS = "2083-05-13";

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Anita','anita','x','staff','t')`,
  );
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('admin1','Sarita','admin','x','admin','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  raw.close();
});

async function register(name: string, phone: string, extra = {}) {
  const { createPatient } = await import("@/lib/repos/patients");
  return createPatient({
    name,
    sex: "f",
    ageValue: 34,
    ageUnit: "y",
    ageAsOfAd: TODAY_AD,
    dobAd: null,
    phone,
    address: "Bhaktapur, Suryabinayak-4",
    userId: "u1",
    ...extra,
  });
}

describe("Phase 2 — the lifetime patient number", () => {
  it("starts at P-000001 and runs sequentially", async () => {
    const { formatPatientNo } = await import("@/lib/patient-no");
    const a = await register("Anita Shrestha", "9841000001");
    const b = await register("Bikash Karki", "9841000002");

    expect(a.patientNo).toBe(1);
    expect(formatPatientNo(a.patientNo!)).toBe("P-000001");
    expect(b.patientNo).toBe(2);
  });

  it("does not change when the fiscal year rolls", async () => {
    const { closeYearAndOpenNext } = await import("@/lib/repos/fiscal");
    const { getPatient } = await import("@/lib/repos/patients");
    const { db } = await import("@/lib/db");

    const before = await getPatient(
      (await db().execute("SELECT id FROM patients WHERE patient_no = 1")).rows[0]!
        .id as string,
    );

    await closeYearAndOpenNext("admin1");

    const after = await getPatient(before!.id);
    expect(after!.patientNo).toBe(1);

    // and the next patient still continues the lifetime sequence
    const c = await register("Third Person", "9841000003");
    expect(c.patientNo).toBe(3);
  });

  it("is idempotent on the client id, so a re-sync makes one patient", async () => {
    const { createPatient, countPatients } = await import("@/lib/repos/patients");
    const payload = {
      id: "01TESTULIDPATIENT0000000AA",
      name: "Offline Person",
      sex: "m" as const,
      ageValue: 20,
      ageUnit: "y" as const,
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9800000000",
      address: "Kathmandu",
      userId: "u1",
    };
    const first = await createPatient(payload);
    const before = await countPatients();
    const second = await createPatient(payload);
    const after = await countPatients();

    expect(second.id).toBe(first.id);
    expect(second.patientNo).toBe(first.patientNo);
    expect(after).toBe(before);
  });
});

describe("Phase 2 — duplicates are surfaced, never resolved", () => {
  it("flags a same name and phone match with the last visit date", async () => {
    const { findPossibleDuplicates } = await import("@/lib/repos/patients");
    const matches = await findPossibleDuplicates(
      "Anita Shrestha",
      "9841000001",
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.reason).toBe("Same name and phone number");
    expect(matches[0]).toHaveProperty("lastVisitBs");
  });

  it("still lets both records exist — a warning is not a block", async () => {
    const { countPatients } = await import("@/lib/repos/patients");
    const before = await countPatients();
    const twin = await register("Anita Shrestha", "9841000001");
    const after = await countPatients();
    expect(after).toBe(before + 1);
    expect(twin.patientNo).not.toBe(1);
  });
});

describe("Phase 2 — visits", () => {
  it("numbers from the open fiscal year and starts as Waiting", async () => {
    const { createVisit, visitsOn, visitCountsOn } = await import(
      "@/lib/repos/visits"
    );
    const { db } = await import("@/lib/db");
    const patientId = (
      await db().execute("SELECT id FROM patients WHERE patient_no = 1")
    ).rows[0]!.id as string;

    const visit = await createVisit({
      patientId,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      type: "new",
      department: "OPD",
      complaint: "Fever for three days",
      userId: "u1",
    });

    expect(visit.visitNo).toBe(1);
    expect(visit.status).toBe("waiting");

    const todayList = await visitsOn(TODAY_AD);
    expect(todayList.map((v) => v.id)).toContain(visit.id);
    expect(todayList[0]!.patientName).toBeTruthy();

    const counts = await visitCountsOn(TODAY_AD);
    expect(counts.total).toBeGreaterThanOrEqual(1);
    expect(counts.waiting).toBeGreaterThanOrEqual(1);
  });

  it("is cancelled with a reason, never deleted, and drops out of the counts", async () => {
    const { createVisit, cancelVisit, getVisit, visitCountsOn } = await import(
      "@/lib/repos/visits"
    );
    const { db } = await import("@/lib/db");
    const patientId = (
      await db().execute("SELECT id FROM patients WHERE patient_no = 2")
    ).rows[0]!.id as string;

    const v = await createVisit({
      patientId,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      type: "new",
      userId: "u1",
    });
    const before = await visitCountsOn(TODAY_AD);

    await cancelVisit(v.id, "Registered by mistake", "admin1");

    const after = await visitCountsOn(TODAY_AD);
    const still = await getVisit(v.id);

    expect(still).not.toBeNull(); // never deleted
    expect(still!.status).toBe("cancelled");
    expect(still!.cancelReason).toBe("Registered by mistake");
    expect(after.total).toBe(before.total - 1);

    const audit = await db().execute(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.cancelled'",
    );
    expect(Number(audit.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase 2 — merging patients", () => {
  it("moves visits, bills and files, retires the number, and logs it", async () => {
    const { mergePatients, getPatient } = await import("@/lib/repos/patients");
    const { createVisit } = await import("@/lib/repos/visits");
    const { recordAttachment } = await import("@/lib/repos/attachments");
    const { db } = await import("@/lib/db");

    const keep = await register("Merge Keep", "9812345678");
    const gone = await register("Merge Gone", "9812345678");

    await createVisit({
      patientId: gone.id,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      type: "new",
      userId: "u1",
    });
    await recordAttachment({
      id: "att-merge-1",
      patientId: gone.id,
      kind: "report",
      title: "Old report",
      fileName: "old.pdf",
      mime: "application/pdf",
      sizeBytes: 100,
      blobKey: `patients/${gone.id}/att-merge-1.pdf`,
      uploadedBy: "u1",
    });
    await db().execute({
      sql: `INSERT INTO bills (id, date_ad, date_bs, patient_id, client_created_at)
            VALUES ('bill-merge-1', ?, ?, ?, 't')`,
      args: [TODAY_AD, TODAY_BS, gone.id],
    });

    const res = await mergePatients(keep.id, gone.id, "admin1");
    expect(res.moved).toEqual({ visits: 1, bills: 1, files: 1 });

    const moved = await db().execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM visits WHERE patient_id = ?) AS v,
              (SELECT COUNT(*) FROM bills WHERE patient_id = ?) AS b,
              (SELECT COUNT(*) FROM attachments WHERE patient_id = ?) AS f`,
      args: [keep.id, keep.id, keep.id],
    });
    expect(Number(moved.rows[0]!.v)).toBe(1);
    expect(Number(moved.rows[0]!.b)).toBe(1);
    expect(Number(moved.rows[0]!.f)).toBe(1);

    const after = await getPatient(gone.id);
    expect(after!.mergedIntoId).toBe(keep.id);
    expect(after!.active).toBe(false);
    // the number is retired, not blanked and not reissued
    expect(after!.patientNo).toBe(gone.patientNo);

    const nextPatient = await register("After Merge", "9800000123");
    expect(nextPatient.patientNo).toBeGreaterThan(gone.patientNo!);

    const audit = await db().execute(
      "SELECT detail_json FROM audit_log WHERE action = 'patient.merged' ORDER BY at DESC LIMIT 1",
    );
    const detail = JSON.parse(audit.rows[0]!.detail_json as string);
    expect(detail.keptId).toBe(keep.id);
    expect(detail.retiredNo).toBe(gone.patientNo);
  });

  it("refuses to merge a record into itself", async () => {
    const { mergePatients, MergeError } = await import("@/lib/repos/patients");
    const p = await register("Self Merge", "9800000999");
    await expect(mergePatients(p.id, p.id, "admin1")).rejects.toBeInstanceOf(
      MergeError,
    );
  });

  it("follows the trail from a merged record to the one that survived", async () => {
    const { resolveMerged, getPatient } = await import("@/lib/repos/patients");
    const { db } = await import("@/lib/db");
    const gone = (
      await db().execute(
        "SELECT id, merged_into_id FROM patients WHERE merged_into_id IS NOT NULL LIMIT 1",
      )
    ).rows[0]!;
    const resolved = await resolveMerged(gone.id as string);
    const target = await getPatient(gone.merged_into_id as string);
    expect(resolved!.id).toBe(target!.id);
  });
});

describe("Phase 2 — search", () => {
  it("finds by partial name, by phone, and by number", async () => {
    const { searchPatients } = await import("@/lib/repos/patients");

    const byName = await searchPatients("anita");
    expect(byName.some((p) => p.name.includes("Anita"))).toBe(true);

    const byPhone = await searchPatients("9841000002");
    expect(byPhone.some((p) => p.phone === "9841000002")).toBe(true);

    const byNumber = await searchPatients("P-000001");
    expect(byNumber.some((p) => p.patientNo === 1)).toBe(true);
  });

  it("leaves merged-away records out of the results", async () => {
    const { searchPatients } = await import("@/lib/repos/patients");
    const results = await searchPatients("Merge Gone");
    expect(results).toHaveLength(0);
  });

  it("stays fast across a realistic register", async () => {
    const { createPatient, searchPatients } = await import(
      "@/lib/repos/patients"
    );
    for (let i = 0; i < 300; i++) {
      await createPatient({
        name: `Sample Patient ${i}`,
        sex: i % 2 ? "m" : "f",
        ageValue: 20 + (i % 50),
        ageUnit: "y",
        ageAsOfAd: TODAY_AD,
        dobAd: null,
        phone: `98${String(10000000 + i)}`,
        address: "Bhaktapur",
        userId: "u1",
      });
    }
    const started = Date.now();
    const found = await searchPatients("Sample Patient 21");
    const took = Date.now() - started;
    expect(found.length).toBeGreaterThan(0);
    expect(took).toBeLessThan(300);
  });
});

describe("Phase 2 — files", () => {
  it("records metadata and lists it against the patient and the visit", async () => {
    const {
      recordAttachment,
      attachmentsForPatient,
      attachmentsForVisit,
    } = await import("@/lib/repos/attachments");
    const { createVisit } = await import("@/lib/repos/visits");

    const p = await register("File Owner", "9700000001");
    const v = await createVisit({
      patientId: p.id,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      type: "new",
      userId: "u1",
    });

    await recordAttachment({
      id: "att-1",
      patientId: p.id,
      visitId: v.id,
      kind: "report",
      title: "USG report",
      fileName: "usg.pdf",
      mime: "application/pdf",
      sizeBytes: 2048,
      blobKey: `patients/${p.id}/att-1.pdf`,
      uploadedBy: "u1",
    });
    await recordAttachment({
      id: "att-2",
      patientId: p.id,
      visitId: v.id,
      kind: "image",
      title: "Paper report photo",
      fileName: "photo.jpg",
      mime: "image/jpeg",
      sizeBytes: 4096,
      blobKey: `patients/${p.id}/att-2.jpg`,
      uploadedBy: "u1",
    });

    expect(await attachmentsForPatient(p.id)).toHaveLength(2);
    expect(await attachmentsForVisit(v.id)).toHaveLength(2);
  });

  it("soft-deletes, keeps the bytes for 30 days, then lets the sweep take them", async () => {
    const {
      softDeleteAttachment,
      getAttachment,
      attachmentsPastGrace,
      purgeAttachmentRow,
    } = await import("@/lib/repos/attachments");
    const { db } = await import("@/lib/db");

    await softDeleteAttachment("att-2", "admin1");

    // gone from the interface immediately
    expect(await getAttachment("att-2")).toBeNull();
    // but still on record, and not yet due for the sweep
    expect(await attachmentsPastGrace(30)).toHaveLength(0);

    const audit = await db().execute(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'file.deleted'",
    );
    expect(Number(audit.rows[0]!.n)).toBe(1);

    // wind the clock back past the grace period
    await db().execute({
      sql: "UPDATE attachments SET deleted_at = ? WHERE id = 'att-2'",
      args: [new Date(Date.now() - 31 * 86_400_000).toISOString()],
    });

    const due = await attachmentsPastGrace(30);
    expect(due.map((d) => d.id)).toContain("att-2");

    await purgeAttachmentRow("att-2");
    const left = await db().execute(
      "SELECT COUNT(*) AS n FROM attachments WHERE id = 'att-2'",
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });

  it("lists visits still waiting for a file, oldest first", async () => {
    const { filesPending, countPendingFiles } = await import(
      "@/lib/repos/attachments"
    );
    const rows = await filesPending();
    const count = await countPendingFiles();
    expect(count).toBe(rows.length);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.dateAd <= rows[i]!.dateAd).toBe(true);
    }
  });
});

describe("Phase 2 — what a file is allowed to be", () => {
  it("accepts the types a clinic actually receives", async () => {
    const { assertAcceptable } = await import("@/lib/files");
    for (const m of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]) {
      expect(() => assertAcceptable(m, 1024)).not.toThrow();
    }
  });

  it("refuses anything else, in plain language", async () => {
    const { assertAcceptable, UnsupportedFileTypeError } = await import(
      "@/lib/files"
    );
    try {
      assertAcceptable("application/x-msdownload", 1024);
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedFileTypeError);
      expect((err as InstanceType<typeof UnsupportedFileTypeError>).userMessage)
        .not.toMatch(/mime|type allow|application\//i);
    }
  });

  it("refuses anything over 15 MB", async () => {
    const { assertAcceptable, FileTooLargeError, MAX_FILE_BYTES } = await import(
      "@/lib/files"
    );
    expect(() => assertAcceptable("image/jpeg", MAX_FILE_BYTES + 1)).toThrow(
      FileTooLargeError,
    );
    expect(() => assertAcceptable("image/jpeg", MAX_FILE_BYTES)).not.toThrow();
  });

  it("builds a storage key that stays inside the patient's folder", async () => {
    const { blobKeyFor } = await import("@/lib/files");
    expect(blobKeyFor("pat1", "att1", "application/pdf")).toBe(
      "patients/pat1/att1.pdf",
    );
    expect(blobKeyFor("pat1", "att1", "image/jpeg")).toBe(
      "patients/pat1/att1.jpg",
    );
  });
});
