"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Trash2, Download, Camera, Upload } from "lucide-react";
import { deleteAttachmentAction } from "@/app/(app)/patients/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatSize, isImage, MAX_FILES_PER_UPLOAD } from "@/lib/files";
import { cn } from "@/lib/cn";

export interface AttachmentView {
  id: string;
  title: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  kind: string;
  createdAt: string;
  uploaderName: string;
}

const KIND_LABEL: Record<string, string> = {
  report: "Report",
  image: "Image",
  scan: "Scan",
  other: "Other",
};

/**
 * Files attached to a patient or a visit. Upload goes through our server, and
 * every tile links to the authenticated serving route — a blob URL never
 * appears in the page (Rules §1.13).
 */
export function AttachmentGrid({
  patientId,
  visitId,
  files,
  canDelete,
}: {
  patientId: string;
  visitId?: string | null;
  files: AttachmentView[];
  /** Only Admin sees the delete control at all (PRD §4B.6). */
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<AttachmentView | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (list.length > MAX_FILES_PER_UPLOAD) {
      toast.error(`You can add up to ${MAX_FILES_PER_UPLOAD} files at a time.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("patientId", patientId);
      if (visitId) body.set("visitId", visitId);
      for (const f of Array.from(list)) body.append("file", f);

      const res = await fetch("/api/files/upload", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; userMessage?: string }
        | null;

      if (!res.ok || !json?.ok) {
        toast.error(
          json?.userMessage ?? "Couldn't add the file — try again.",
        );
        return;
      }
      toast.success(list.length === 1 ? "File added" : "Files added");
      router.refresh();
    } catch {
      toast.error("Couldn't add the file — try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function remove(file: AttachmentView) {
    startTransition(async () => {
      const res = await deleteAttachmentAction(file.id, patientId);
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      setConfirming(null);
      setTyped("");
      toast.success("File deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-wrap items-center justify-center gap-3 rounded-[10px] border border-dashed px-4 py-6 text-center",
          dragging ? "border-clinic-500 bg-clinic-75" : "border-line bg-cream-50",
        )}
      >
        <p className="text-[14px] text-sage-500">
          {busy ? "Adding…" : "Drag a report here, or take a photo."}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Choose a file
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Take a photo
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <p className="w-full text-[12px] text-sage-500">
          PDF or photo, up to 15 MB each.
        </p>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="group relative w-[150px] rounded-[10px] border border-line bg-cream-50 p-3"
            >
              <a
                href={`/api/files/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-1.5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-clinic-75 text-clinic-700">
                  {isImage(f.mime) ? (
                    <ImageIcon className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </span>
                <span className="line-clamp-2 text-[13px] font-medium text-sage-900">
                  {f.title || f.fileName}
                </span>
                <span className="text-[11px] text-sage-500">
                  {KIND_LABEL[f.kind] ?? f.kind} · {formatSize(f.sizeBytes)}
                </span>
                <span className="text-[11px] text-sage-500">
                  {f.createdAt.slice(0, 10)}
                </span>
              </a>
              <div className="mt-2 flex gap-1">
                <a
                  href={`/api/files/${f.id}?download=1`}
                  className="rounded-[6px] p-1.5 text-sage-500 hover:bg-cream-200 hover:text-sage-900"
                  aria-label={`Download ${f.title || f.fileName}`}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(f);
                      setTyped("");
                    }}
                    aria-label={`Delete ${f.title || f.fileName}`}
                    className="rounded-[6px] p-1.5 text-sage-500 hover:bg-danger-100 hover:text-danger-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this file?"
      >
        <p className="text-[14px] leading-[1.5] text-sage-900">
          <span className="font-semibold">
            {confirming?.title || confirming?.fileName}
          </span>{" "}
          will be removed from the patient&apos;s record. It stays recoverable for
          30 days, then it is gone for good.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-sage-900">
          Type <span className="font-mono text-magenta-600">delete</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim().toLowerCase() !== "delete" || pending}
            onClick={() => confirming && remove(confirming)}
          >
            Delete file
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
