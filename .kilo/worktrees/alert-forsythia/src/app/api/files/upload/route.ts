import { NextResponse } from "next/server";
import { ulid } from "ulid";
import { auth } from "@/auth";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { canBill } from "@/lib/session";
import { putFile } from "@/lib/file-store";
import { recordAttachment } from "@/lib/repos/attachments";
import { getPatient } from "@/lib/repos/patients";
import {
  assertAcceptable,
  blobKeyFor,
  defaultKindFor,
  safeFileName,
  FileTooLargeError,
  UnsupportedFileTypeError,
  MAX_FILES_PER_UPLOAD,
  type AttachmentKind,
} from "@/lib/files";
import { checkRateLimit, tooManyRequestsBody } from "@/lib/rate-limit";

/** Uploads are heavy; a burst is a stuck retry, not a person. */
const UPLOAD_LIMIT = { name: "file-upload", limit: 60, windowSeconds: 300 };

/**
 * POST /api/files/upload — the ONLY way bytes enter storage.
 *
 * Client -> our server -> storage, never client -> storage (Architecture §2.6).
 * Session, role, module, size and type are all checked here, and the metadata
 * row is written only after the bytes land, so a failure leaves no half-record.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  try {
    await requireModule("clinic");
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    throw err;
  }

  // An Accountant is read-only.
  if (!canBill(session.user.role)) {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(UPLOAD_LIMIT, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't read the file. Please try again." },
      { status: 400 },
    );
  }

  const patientId = String(form.get("patientId") ?? "");
  const visitId = (form.get("visitId") as string | null) || null;
  const kindRaw = String(form.get("kind") ?? "");
  const titleRaw = String(form.get("title") ?? "");

  const patient = await getPatient(patientId);
  if (!patient) {
    return NextResponse.json(
      { ok: false, userMessage: "That patient record no longer exists." },
      { status: 404 },
    );
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, userMessage: "Choose a file to add." },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json(
      {
        ok: false,
        userMessage: `You can add up to ${MAX_FILES_PER_UPLOAD} files at a time.`,
      },
      { status: 400 },
    );
  }

  const saved: { id: string; title: string }[] = [];

  for (const file of files) {
    const mime = file.type || "application/octet-stream";
    try {
      assertAcceptable(mime, file.size);
    } catch (err) {
      if (
        err instanceof FileTooLargeError ||
        err instanceof UnsupportedFileTypeError
      ) {
        return NextResponse.json(
          { ok: false, code: err.code, userMessage: err.userMessage },
          { status: 400 },
        );
      }
      throw err;
    }

    const id = ulid();
    const key = blobKeyFor(patient.id, id, mime);
    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
      // Bytes first. Only if this succeeds do we write the row.
      await putFile(key, bytes, mime);
    } catch (err) {
      console.error("[/api/files/upload] storage write failed", err);
      return NextResponse.json(
        {
          ok: false,
          userMessage: "Couldn't add the file — try again.",
        },
        { status: 500 },
      );
    }

    const kind: AttachmentKind = (
      ["report", "image", "scan", "other"] as const
    ).includes(kindRaw as AttachmentKind)
      ? (kindRaw as AttachmentKind)
      : defaultKindFor(mime);

    const title =
      titleRaw.trim() || safeFileName(file.name).replace(/\.[^.]+$/, "");

    const row = await recordAttachment({
      id,
      patientId: patient.id,
      visitId,
      kind,
      title,
      fileName: safeFileName(file.name),
      mime,
      sizeBytes: file.size,
      blobKey: key,
      uploadedBy: session.user.id,
    });
    saved.push({ id: row.id, title: row.title });
  }

  return NextResponse.json({ ok: true, files: saved });
}
