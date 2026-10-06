import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getAttachmentWithKey } from "@/lib/repos/attachments";
import { getFile } from "@/lib/file-store";
import { isImage } from "@/lib/files";

/**
 * GET /api/files/[id] — the ONLY way a patient file is served.
 *
 * Session, role and module are re-checked on every request. A URL that works
 * when logged out is a defect that blocks the phase (Rules §1.13), so this
 * route never redirects to storage and never leaks the storage key: it streams
 * the bytes itself.
 *
 * `?download=1` forces a save instead of inline display.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    // Not a redirect: a redirect to the login page would still confirm that
    // something exists at this address.
    return new NextResponse(null, { status: 401 });
  }

  try {
    await requireModule("clinic");
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return new NextResponse(null, { status: 404 });
    }
    throw err;
  }

  const { id } = await params;
  const attachment = await getAttachmentWithKey(id);
  if (!attachment) return new NextResponse(null, { status: 404 });

  const stored = await getFile(attachment.blobKey);
  if (!stored) {
    console.error("[/api/files] bytes missing for", id);
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  // Images and PDFs display inline; anything else is always a download.
  const inline = !download && (isImage(attachment.mime) || attachment.mime === "application/pdf");
  const filename = attachment.fileName.replace(/"/g, "");

  return new NextResponse(Buffer.from(stored.body), {
    status: 200,
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(stored.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      // The file is served from our origin, so it must never be sniffed into
      // something executable, framed by another site, or cached by a proxy.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
