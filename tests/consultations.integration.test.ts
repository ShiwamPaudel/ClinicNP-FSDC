/**
 * Booked consultations: the promises the booking screen makes.
 *
 *  - the same booking sent twice is one consultation, not two
 *  - a doctor cannot be in two places at once
 *  - back to back is not a clash
 *  - a cancelled booking gives its time back
 *  - a doctor's list contains only their own patients
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(
  __dirname,
  `consultations.${process.pid}-${Date.now()}.db`,
);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const DAY_AD = "2026-09-10";
const DAY_BS = "2083-05-25";
const NEXT_AD = "2026-09-11";
const NEXT_BS = "2083-05-26";

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
     VALUES ('u_doc','Dr. Sample Karki','skarki','x','doctor','t')`,
  );
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, user_id, created_at, updated_at)
     VALUES ('doc1','Dr. Sample Karki','none', 0, 1, 'u_doc', 't','t')`,
  );
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc2','Dr. Sample Rai','none', 0, 1, 't','t')`,
  );
  const people: [string, string][] = [
    ["p1", "Sample Sharma"],
    ["p2", "Sample Thapa"],
    ["p3", "Sample Gurung"],
  ];
  for (const [id, name] of people) {
    await raw.execute({
      sql: `INSERT INTO patients (id, name, sex, active, created_at, updated_at)
            VALUES (?, ?, 'f', 1, 't', 't')`,
      args: [id, name],
    });
  }
  raw.close();
});

async function repo() {
  return import("@/lib/repos/appointments");
}

const base = {
  doctorId: "doc1",
  patientId: "p1",
  dateAd: DAY_AD,
  dateBs: DAY_BS,
  timeHhmm: "10:00",
  durationMin: 15,
  reason: "",
  bookedBy: "u1",
};

describe("booking a consultation", () => {
  it("sending the same one twice books it once", async () => {
    const { createAppointment, appointmentsForDoctorOn } = await repo();
    const first = await createAppointment({ ...base, id: "appt_same" });
    const again = await createAppointment({ ...base, id: "appt_same" });

    expect(again.id).toBe(first.id);
    const day = await appointmentsForDoctorOn("doc1", DAY_AD);
    expect(day.filter((a) => a.id === "appt_same")).toHaveLength(1);
  });

  it("refuses to put two people with one doctor at the same moment", async () => {
    const { createAppointment, DoubleBookedError } = await repo();
    await expect(
      createAppointment({
        ...base,
        id: "appt_clash",
        patientId: "p2",
        timeHhmm: "10:05",
      }),
    ).rejects.toBeInstanceOf(DoubleBookedError);
  });

  it("says who the clash is with, in words the front desk can read", async () => {
    const { createAppointment } = await repo();
    try {
      await createAppointment({
        ...base,
        id: "appt_clash2",
        patientId: "p2",
        timeHhmm: "10:10",
      });
      throw new Error("should have refused");
    } catch (err) {
      const message = (err as { userMessage?: string }).userMessage ?? "";
      expect(message).toContain("Sample Sharma");
      expect(message).not.toMatch(/error|null|SQL/i);
    }
  });

  it("allows two patients back to back", async () => {
    const { createAppointment } = await repo();
    const next = await createAppointment({
      ...base,
      id: "appt_next",
      patientId: "p2",
      timeHhmm: "10:15",
    });
    expect(next.timeHhmm).toBe("10:15");
  });

  it("lets a different doctor use the same time", async () => {
    const { createAppointment } = await repo();
    const other = await createAppointment({
      ...base,
      id: "appt_other_doc",
      doctorId: "doc2",
      patientId: "p3",
      timeHhmm: "10:00",
    });
    expect(other.doctorId).toBe("doc2");
  });
});

describe("a booking that is called off", () => {
  it("gives its time back", async () => {
    const { createAppointment, setAppointmentStatus } = await repo();
    await setAppointmentStatus("appt_same", "cancelled", "Patient rang to say no");

    const replacement = await createAppointment({
      ...base,
      id: "appt_replacement",
      patientId: "p3",
      timeHhmm: "10:00",
    });
    expect(replacement.id).toBe("appt_replacement");
  });

  it("stays on the day rather than disappearing", async () => {
    const { appointmentsForDoctorOn } = await repo();
    const day = await appointmentsForDoctorOn("doc1", DAY_AD);
    const called_off = day.find((a) => a.id === "appt_same");
    expect(called_off?.status).toBe("cancelled");
    expect(called_off?.cancelReason).toBe("Patient rang to say no");
  });
});

describe("moving a booking", () => {
  it("moves it and keeps the clash rule", async () => {
    const { createAppointment, rescheduleAppointment, appointmentsForDoctorOn, DoubleBookedError } =
      await repo();

    await createAppointment({
      ...base,
      id: "appt_tomorrow",
      patientId: "p1",
      dateAd: NEXT_AD,
      dateBs: NEXT_BS,
      timeHhmm: "09:00",
    });

    await rescheduleAppointment("appt_tomorrow", {
      dateAd: NEXT_AD,
      dateBs: NEXT_BS,
      timeHhmm: "11:30",
      durationMin: 30,
    });

    const day = await appointmentsForDoctorOn("doc1", NEXT_AD);
    const moved = day.find((a) => a.id === "appt_tomorrow");
    expect(moved?.timeHhmm).toBe("11:30");
    expect(moved?.durationMin).toBe(30);

    // Somebody else at 11:45 now collides with the half hour it was given.
    await createAppointment({
      ...base,
      id: "appt_tomorrow_2",
      patientId: "p2",
      dateAd: NEXT_AD,
      dateBs: NEXT_BS,
      timeHhmm: "13:00",
    });
    await expect(
      rescheduleAppointment("appt_tomorrow_2", {
        dateAd: NEXT_AD,
        dateBs: NEXT_BS,
        timeHhmm: "11:45",
        durationMin: 15,
      }),
    ).rejects.toBeInstanceOf(DoubleBookedError);
  });
});

describe("what a doctor sees", () => {
  it("is only their own patients", async () => {
    const { appointmentsForDoctorOn } = await repo();
    const mine = await appointmentsForDoctorOn("doc1", DAY_AD);
    const theirs = await appointmentsForDoctorOn("doc2", DAY_AD);

    expect(mine.every((a) => a.doctorId === "doc1")).toBe(true);
    expect(theirs.every((a) => a.doctorId === "doc2")).toBe(true);
    expect(theirs.map((a) => a.id)).not.toContain("appt_next");
  });

  it("is in time order", async () => {
    const { appointmentsForDoctorOn } = await repo();
    const day = await appointmentsForDoctorOn("doc1", DAY_AD);
    const times = day.map((a) => a.timeHhmm);
    expect([...times].sort()).toEqual(times);
  });

  it("carries the patient's own details, so the phone needs no second look", async () => {
    const { appointmentsForDoctorOn } = await repo();
    const day = await appointmentsForDoctorOn("doc1", DAY_AD);
    const one = day.find((a) => a.id === "appt_next");
    expect(one?.patientName).toBe("Sample Thapa");
    expect(one?.doctorName).toBe("Dr. Sample Karki");
  });

  it("finds the sign-in that belongs to a doctor, and only that one", async () => {
    const { getDoctorByUserId } = await import("@/lib/repos/doctors");
    const mine = await getDoctorByUserId("u_doc");
    expect(mine?.id).toBe("doc1");
    expect(await getDoctorByUserId("u1")).toBeNull();
  });
});

describe("the board", () => {
  it("counts what is still expected, not what was called off", async () => {
    const { countsByDoctorOn } = await repo();
    const counts = await countsByDoctorOn(DAY_AD);
    const doc1 = counts.get("doc1");
    // appt_next, appt_replacement are open; appt_same was cancelled.
    expect(doc1?.booked).toBe(2);
    expect(doc1?.total).toBe(3);
  });

  it("points at the next day a doctor actually has somebody", async () => {
    const { nextBusyDay } = await repo();
    expect(await nextBusyDay("doc1", NEXT_AD)).toBe(NEXT_AD);
    expect(await nextBusyDay("doc2", NEXT_AD)).toBeNull();
  });
});
