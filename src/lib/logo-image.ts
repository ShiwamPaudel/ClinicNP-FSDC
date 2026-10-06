/**
 * logo-image.ts — the shop's printed letterhead, small enough to live in the
 * company row.
 *
 * The header on a bill is an image, not text: a shop has a letterhead with its
 * name set the way it wants it, its logo, a Devanagari line no font here would
 * render the same way twice. So it is uploaded, and it has to survive being
 * printed from any machine at the counter, offline, on the day the internet is
 * down. That rules out a file on one PC's disk and it rules out a fetch at
 * print time.
 *
 * So the image is downscaled here, in the browser, to a data URL that is
 * stored in `company.logo_url` like any other setting — carried with the rest
 * of the company profile, cached with it, backed up with it, and already in
 * the page by the time anybody presses Print.
 *
 * The cap is what makes that honest. A phone photograph of a letterhead is
 * four megabytes, and four megabytes in a database row is a mistake that only
 * shows up as slowness weeks later. Everything is re-encoded to fit
 * MAX_BYTES — width first, then quality — and an image that cannot be made to
 * fit is refused rather than stored.
 */

/** 1600px is more than a 210mm sheet at 300dpi can show for a header band. */
const MAX_WIDTH = 1600;

/** Comfortably under any row limit, and still crisp across the top of A4. */
export const MAX_BYTES = 220_000;

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * A problem with the chosen image that is worth repeating to the person who
 * chose it. Everything thrown from here carries a sentence they can act on;
 * anything else that escapes (a browser quirk, a decoder fault) is not their
 * fault to read, so the screen shows its own wording for those instead.
 */
export class ImageProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProblem";
  }
}

/** What a data URL costs as characters, which is what actually gets stored. */
export function dataUrlBytes(dataUrl: string): number {
  return dataUrl.length;
}

export interface DownscaleResult {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProblem("That file could not be read as an image."));
    };
    img.src = url;
  });
}

/**
 * Re-encode an uploaded image to a data URL that fits MAX_BYTES.
 *
 * The canvas is filled white before drawing. A logo with a transparent
 * background would otherwise come out black once encoded as JPEG, and the
 * paper it is printed on is white anyway.
 */
export async function downscaleToDataUrl(file: File): Promise<DownscaleResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new ImageProblem("Use a PNG, JPG or WEBP image.");
  }

  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new ImageProblem("That image has no size.");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProblem("This browser cannot resize images.");

  let width = Math.min(MAX_WIDTH, img.naturalWidth);

  // Width first, then quality: a header that is too wide wastes bytes on
  // detail no printer resolves, and dropping quality first would blur it
  // while it was still oversized.
  for (let attempt = 0; attempt < 6; attempt++) {
    const height = Math.round((width / img.naturalWidth) * img.naturalHeight);
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.92, 0.85, 0.75, 0.65]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= MAX_BYTES) {
        return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl) };
      }
    }
    width = Math.round(width * 0.75);
    if (width < 320) break;
  }

  throw new ImageProblem(
    "That image is too detailed to fit. Crop it to just the header band and try again.",
  );
}
