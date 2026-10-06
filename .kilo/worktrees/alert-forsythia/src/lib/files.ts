/**
 * files.ts — what a patient file is allowed to be, and where its bytes go.
 *
 * Rules that do not bend (Rules §1.13, Architecture §2.6):
 *  - upload goes client -> our server -> storage, never client -> storage
 *  - storage is private; serving happens through an authenticated route
 *  - the storage key is never handed to the client
 *  - the metadata row is written only after the bytes land, so a failed upload
 *    leaves no half-record
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file (PRD §4B.6)
export const MAX_FILES_PER_UPLOAD = 10;

/** The only types the clinic actually receives back from a lab or a phone. */
export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME)[number];

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type AttachmentKind = "report" | "image" | "scan" | "other";

export class FileTooLargeError extends Error {
  readonly code = "file_too_large" as const;
  readonly userMessage =
    "That file is too big. Files can be up to 15 MB each — try a smaller photo or a lighter scan.";
  constructor() {
    super("file too large");
    this.name = "FileTooLargeError";
  }
}

export class UnsupportedFileTypeError extends Error {
  readonly code = "unsupported_file_type" as const;
  readonly userMessage =
    "That kind of file can't be added. Use a PDF or a photo (JPG, PNG, WEBP or HEIC).";
  constructor() {
    super("unsupported file type");
    this.name = "UnsupportedFileTypeError";
  }
}

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase());
}

/** Throws the typed error the route maps to plain language. */
export function assertAcceptable(mime: string, sizeBytes: number): void {
  if (!isAllowedMime(mime)) throw new UnsupportedFileTypeError();
  if (sizeBytes > MAX_FILE_BYTES) throw new FileTooLargeError();
  if (sizeBytes <= 0) throw new UnsupportedFileTypeError();
}

export function extensionFor(mime: string): string {
  return EXTENSION[mime.toLowerCase()] ?? "bin";
}

/** A PDF is a report; anything else is an image unless told otherwise. */
export function defaultKindFor(mime: string): AttachmentKind {
  return mime.toLowerCase() === "application/pdf" ? "report" : "image";
}

/**
 * Where the bytes live: `patients/<patientId>/<attachmentId>.<ext>`.
 * Never rendered into a page — serving goes through /api/files/[id].
 */
export function blobKeyFor(
  patientId: string,
  attachmentId: string,
  mime: string,
): string {
  return `patients/${patientId}/${attachmentId}.${extensionFor(mime)}`;
}

/** A safe display name; the stored name is never used as a path. */
export function safeFileName(name: string): string {
  const trimmed = name.trim().replace(/[\r\n\t]/g, " ").slice(0, 180);
  return trimmed.length > 0 ? trimmed : "file";
}

/** Human size for the attachment tile. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Images render inline; PDFs go into a sandboxed frame (Architecture §6). */
export function isImage(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}
