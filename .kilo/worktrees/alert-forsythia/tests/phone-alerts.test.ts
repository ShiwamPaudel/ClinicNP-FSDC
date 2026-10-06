/**
 * Alerts to a doctor's phone: the encryption, and the bookkeeping around it.
 *
 * The delivery itself cannot be tested here — that needs a real browser and a
 * real delivery service. What can be tested is everything up to the wire, and
 * that is where the bugs would be: a key handed over as text and turned back
 * into bytes wrongly makes `web-push` throw before it opens a connection, so
 * "it got as far as failing to connect" is the signal worth having.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `push-scratch.${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = "mailto:admin@example.com";

function b64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function statements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

beforeAll(async () => {
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of statements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u_doc','Dr. Sample Karki','skarki','x','doctor','t')`,
  );
  raw.close();
});

describe("alerts to a phone", () => {
  it("encrypts against a real browser key and only the delivery fails", async () => {
    const { saveDevice, devicesForUser } = await import("@/lib/repos/alerts");
    const { pushToUser, pushConfigured } = await import("@/lib/push");

    expect(pushConfigured()).toBe(true);

    // A browser's own key pair, exactly the shape one hands over.
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();

    await saveDevice({
      userId: "u_doc",
      // Nothing is listening here, so delivery fails after encryption succeeds.
      endpoint: "http://127.0.0.1:9/alert/abc123",
      p256dh: b64url(ecdh.getPublicKey()),
      auth: b64url(randomBytes(16)),
      label: "a phone",
    });

    const out = await pushToUser("u_doc", {
      title: "New consultation booked",
      body: "Sample Sharma — Bhadra 27 at 2:30 PM",
      url: "/my/schedule",
      tag: "booking-x",
    });

    // Encryption is the part under test. If the keys were mishandled web-push
    // throws before it ever opens a connection, and this would be 0 failed.
    expect(out.sent).toBe(0);
    expect(out.failed).toBe(1);
    expect(out.detail).not.toMatch(/ECONNREFUSED|Error:|undefined/);

    // A refusal that is not 404/410 keeps the device — it may work later.
    expect(await devicesForUser("u_doc")).toHaveLength(1);
  });

  it("says so plainly when there is no phone at all", async () => {
    const { forgetDevicesForUser } = await import("@/lib/repos/alerts");
    const { pushToUser } = await import("@/lib/push");
    await forgetDevicesForUser("u_doc");
    const out = await pushToUser("u_doc", {
      title: "t",
      body: "b",
      url: "/my/schedule",
    });
    expect(out.sent).toBe(0);
    expect(out.detail).toBe("No phone has alerts switched on.");
  });

  it("re-registering the same phone does not double it", async () => {
    const { saveDevice, devicesForUser } = await import("@/lib/repos/alerts");
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    for (let i = 0; i < 3; i++) {
      await saveDevice({
        userId: "u_doc",
        endpoint: "http://127.0.0.1:9/alert/same",
        p256dh: b64url(ecdh.getPublicKey()),
        auth: b64url(randomBytes(16)),
        label: "a phone",
      });
    }
    expect(await devicesForUser("u_doc")).toHaveLength(1);
  });
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows
    }
  }
});
