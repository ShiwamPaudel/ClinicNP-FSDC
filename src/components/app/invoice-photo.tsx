"use client";

/**
 * invoice-photo.tsx — "Fill from a photo" on the purchase entry screen.
 *
 * It fills boxes. It does not record anything: the person still reads the
 * paper in their hand against what landed in the form, corrects whatever is
 * wrong, and presses Save themselves. The photo itself is read on the device
 * and dropped — it is never uploaded and never kept with the purchase (D-144).
 *
 * The reader is ~6 MB of model and runtime, so it is only fetched when
 * somebody actually picks a photo, never on the way into the page.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { buildDraft, type Draft, type DraftItem } from "@/lib/invoice-read/draft";
import { parseInvoiceText } from "@/lib/invoice-read/parse";
import { readPhotoText, type ReadStage } from "@/lib/invoice-read/ocr";

const STAGE_TEXT: Record<ReadStage, string> = {
  opening: "Opening the photo…",
  loading: "Getting the reader ready…",
  reading: "Reading the bill…",
};

/**
 * What to tell the person when a stage fails. They used to all say "check the
 * connection", which is only true of one of them and left nobody able to say
 * why a photo gave nothing back.
 */
const STAGE_FAILED: Record<ReadStage, string> = {
  opening:
    "That photo couldn't be opened. Use a JPG or PNG photo.",
  loading:
    "Couldn't download the reader (about 40 MB, first time only). Check the internet and try again.",
  reading:
    "Reading stopped part-way. Try a smaller photo, or use a computer.",
};

export function InvoicePhotoButton({
  items,
  onDraft,
}: {
  items: DraftItem[];
  onDraft: (draft: Draft) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<ReadStage | null>(null);
  // Seconds since the photo was picked. A phone can take a minute over a bill,
  // and a counter that is visibly still counting is not mistaken for stuck.
  const [seconds, setSeconds] = useState(0);
  const running = stage !== null;
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setSeconds(0);
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function onPick(file: File) {
    setStage("opening");
    // Which stage was running when something failed, so the message can say.
    let current: ReadStage = "opening";
    const track = (s: ReadStage) => {
      current = s;
      setStage(s);
    };
    try {
      const text = await readPhotoText(file, track);
      const read = parseInvoiceText(text);
      if (read.lines.length === 0) {
        toast.error(
          "Nothing could be read off that photo. Try a straighter, brighter one — or enter this bill by hand.",
        );
        return;
      }
      onDraft(buildDraft(read, items));
      toast.success(
        `Read ${read.lines.length} line${read.lines.length === 1 ? "" : "s"}. Check every one against the paper.`,
      );
    } catch (e) {
      // The person gets a sentence; whoever has to work out why gets the rest.
      console.error(`Invoice reader failed while ${current}:`, e);
      toast.error(STAGE_FAILED[current]);
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear it first, so picking the same photo twice still fires.
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />
      <Button
        variant="secondary"
        disabled={stage !== null}
        onClick={() => fileRef.current?.click()}
      >
        {stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {stage ? `${STAGE_TEXT[stage]} ${seconds} s` : "Fill from a photo"}
      </Button>
      <p className="text-[12px] text-sage-500">
        {stage
          ? "Keep this page open — this can take up to a minute."
          : "Take a photo of the supplier's bill to fill the boxes below. Check them before saving."}
      </p>
    </div>
  );
}
