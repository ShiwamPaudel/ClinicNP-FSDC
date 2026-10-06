"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { BackupRecord } from "@/lib/repos/backup";
import type { BackupStorage } from "@/lib/backups";
import { KEEP, isKeptKey, purposeOf, type BackupPurpose } from "@/lib/backup-keys";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { strings } from "@/lib/strings";

const PURPOSE_LABEL: Record<BackupPurpose, string> = {
  nightly: "Nightly",
  manual: "Back up now",
  "year-end": "Before closing the year",
};

/** What the file picker will offer. A file extension, not words. */
const BACKUP_FILE_TYPES = "application/json,.json"; // sweep-ok: not prose

export function BackupPanel({
  backups,
  storage,
}: {
  backups: BackupRecord[];
  storage: BackupStorage;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState("");
  const [archiveText, setArchiveText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setArchiveText(String(reader.result));
    reader.readAsText(file);
  }

  async function restore() {
    if (!archiveText) {
      toast.error("Choose a backup file first.");
      return;
    }
    let archive: unknown;
    try {
      archive = JSON.parse(archiveText);
    } catch {
      toast.error("That file couldn't be read.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm, archive }),
    });
    setBusy(false);
    const data = await res.json();
    if (data.ok) {
      // Say plainly what came back, including anything that did not.
      const f = data.files as
        | { expected: number; found: number; missing: number }
        | undefined;
      if (f && f.expected > 0 && f.found < f.expected) {
        toast.error(
          `Restored. ${f.found} of ${f.expected} patient files were found — ${f.missing} could not be.`,
        );
      } else if (f && f.expected > 0) {
        toast.success(
          `Restored, with all ${f.expected} patient files accounted for.`,
        );
      } else {
        toast.success("Restored");
      }
      setConfirm("");
      setArchiveText(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      toast.error(data.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <h2 className="text-[16px] font-semibold text-sage-900">Back up your data</h2>
        <p className="mt-1 max-w-md text-[13px] text-sage-500">
          Download a full copy of everything — items, stock, bills, and settings —
          as a single file you can keep safe.
        </p>
        <a href="/api/backup/download" className="mt-3 inline-block">
          <Button>
            <Download className="h-4 w-4" />
            Back up now
          </Button>
        </a>
        <StorageStatus storage={storage} />
      </div>

      <div className="rounded-[10px] border border-danger-600/40 bg-cream-50 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-danger-600" />
          <h2 className="text-[16px] font-semibold text-sage-900">
            Restore from a backup
          </h2>
        </div>
        <p className="mt-1 max-w-md text-[13px] text-sage-500">
          This returns the <b>whole system</b> to how it was when the backup was
          taken — every bill, patient, visit, service, price and stock figure,
          and the fiscal years with whichever one was open at the time. Anything
          entered since then is gone, and it can&apos;t be undone. Type{" "}
          <b>RESTORE</b> to confirm.
        </p>
        <p className="mt-1 max-w-md text-[13px] text-sage-500">
          Patient files are not inside the backup file — a clinic&apos;s scans
          are far too large for that. The backup lists which files should exist,
          and after restoring you are told how many of them can still be found.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:max-w-md">
          <input
            ref={fileRef}
            type="file"
            accept={BACKUP_FILE_TYPES}
            onChange={onFile}
            className="text-[13px] text-sage-700 file:mr-3 file:rounded-[8px] file:border file:border-line file:bg-cream-100 file:px-3 file:py-1.5 file:text-sage-900"
          />
          {fileName && (
            <p className="text-[12px] text-sage-500">Selected: {fileName}</p>
          )}
          <Input
            placeholder="Type RESTORE"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            variant="destructive"
            onClick={restore}
            disabled={busy || confirm !== "RESTORE" || !archiveText}
          >
            <Upload className="h-4 w-4" />
            Restore data
          </Button>
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
          Recent backups
        </h2>
        {backups.length === 0 ? (
          <p className="text-[14px] text-sage-500">
            No backups yet. Use “Back up now” to make your first one.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-[14px]">
            {backups.map((b) => {
              const kept = isKeptKey(b.blobUrl);
              const date = formatBS(toBS(adFromIso(b.createdAt.slice(0, 10))), {
                form: "long",
                monthScript: "en",
              });
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sage-700"
                >
                  <span className="min-w-0">
                    {date} · {PURPOSE_LABEL[purposeOf(b.kind, b.blobUrl)]}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="tnum text-sage-500">
                      {(b.size / 1024).toFixed(1)} KB
                    </span>
                    {kept ? (
                      <a
                        href={`/api/backup/kept/${b.id}`}
                        className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 font-medium text-sage-900 hover:bg-cream-200"
                        aria-label={`Download the backup from ${date}`}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    ) : (
                      <span className="text-[13px] text-sage-500">
                        {b.kind === "daily" ? "Not kept" : "Downloaded only"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {backups.some((b) => !isKeptKey(b.blobUrl)) && (
          <p className="mt-3 max-w-xl text-[12px] text-sage-500">
            “Not kept” and “Downloaded only” mean no copy is stored here. Before
            backups were kept, the nightly job wrote down a backup&apos;s size
            and nothing else. A “Back up now” file is wherever it was saved on
            the computer that downloaded it.
          </p>
        )}
      </div>
    </div>
  );
}

/** Whether anything is being kept on its own, in words the owner can act on. */
function StorageStatus({ storage }: { storage: BackupStorage }) {
  if (storage === "cloud" || storage === "local") {
    return (
      <p className="mt-3 flex max-w-xl items-start gap-2 rounded-[8px] bg-ok-100 p-3 text-[13px] text-ok-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Automatic backups are on. A full copy is saved to private storage
          every night and the last {KEEP.nightly} are kept. Each “Back up now”
          keeps a copy there too (the last {KEEP.manual}), and the copy taken
          before closing a year is kept for good.
          {storage === "local" && " (Test setup: copies are kept on this computer.)"}
        </span>
      </p>
    );
  }
  return (
    <p className="mt-3 flex max-w-xl items-start gap-2 rounded-[8px] bg-warn-100 p-3 text-[13px] text-warn-600">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <b>Automatic backups are off.</b>{" "}
        {storage === "refused"
          ? "The storage connected to ClinicNP is public, so it is not used for anything with patient details in it."
          : "No private storage is connected, so nothing is saved on its own."}{" "}
        Until it is, press “Back up now” regularly and keep the file somewhere
        safe, away from this computer.
      </span>
    </p>
  );
}
