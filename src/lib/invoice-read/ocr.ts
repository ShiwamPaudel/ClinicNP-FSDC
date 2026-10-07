/**
 * ocr.ts — read the text off a photo of a supplier's invoice, in the browser.
 *
 * PaddleOCR (PP-OCRv6 tiny, MIT licence) runs as WebAssembly on the device.
 * That is the whole point of choosing it: the photo never leaves the phone or
 * the PC, there is no account, no key and no per-page charge, and once the
 * model is cached it works with the internet down. The photo is thrown away as
 * soon as the text is out of it — nothing is kept with the purchase (D-144).
 *
 * The model files and the runtime are served from this app, not from a CDN, so
 * a clinic on a bad line is not at the mercy of somebody else's server.
 *
 * Settings below are the ones measured against Family Smile Dental Care Center's own ten bills: the tiny
 * model beat the small and medium ones on dot-matrix print and is a quarter of
 * their size, "per-line" keeps a row's figures together on one line of text,
 * which is what makes a row usable at all, and the image is scaled up rather
 * than sharpened — hard thresholding wiped dot-matrix text out completely.
 */

/** Longest side to aim for before reading. Small photos are scaled up to it. */
const TARGET_LONGEST_SIDE = 1800;
/** Never blow a photo up past this, or the read gets slower with no gain. */
const MAX_UPSCALE = 3;

const MODEL = {
  detection: "/ocr/PP-OCRv6_tiny_det.ort",
  recognition: "/ocr/PP-OCRv6_tiny_rec.ort",
  charactersDictionary: "/ocr/ppocrv6_tiny_dict.txt",
};

type Service = { recognize: (image: ArrayBuffer) => Promise<{ text: string }> };

let service: Promise<Service> | null = null;

/**
 * Flatten the photo and scale it up, then hand it over as PNG bytes.
 *
 * Straightening is not a nicety. A bill photographed flat gives back every row
 * it has; the same bill photographed at the angle a person actually holds a
 * phone gives back almost nothing, because the rows are no longer rows. So the
 * sheet of paper is found in the photo — it is the big bright shape against a
 * darker desk — and its four corners are warped square before anything is read.
 *
 * Every step is guarded: if the paper cannot be found, or the shape found is
 * too small to be the page, the photo is read as it came. A wrong crop would
 * lose lines silently, which is worse than a crooked read the person can see.
 */
async function prepare(file: File | Blob): Promise<ArrayBuffer> {
  const raw = await file.arrayBuffer();
  const { ImageProcessor, CanvasProcessor, Contours, cv, setPlatform, webPlatform } =
    await import("ppu-ocv/web");
  // In a browser ppu-ocv expects OpenCV to be in place already: its Node entry
  // loads it itself, its web entry looks for it on the global and leaves
  // putting it there to the app.
  setPlatform(webPlatform);
  const opencv = (await import("@techstark/opencv-js")).default;
  (globalThis as { cv?: unknown }).cv ??= opencv;
  await ImageProcessor.initRuntime();

  const original = await CanvasProcessor.prepareCanvas(raw);
  let page = original;
  try {
    const mask = new ImageProcessor(original)
      .execute("grayscale")
      .execute("blur", { size: [9, 9] })
      .execute("threshold", { type: cv.THRESH_BINARY + cv.THRESH_OTSU });
    const contours = new Contours(mask.toMat(), {
      mode: cv.RETR_EXTERNAL,
      method: cv.CHAIN_APPROX_SIMPLE,
    });
    const { points, bbox } = contours.getCornerPoints({ canvas: original });
    const wide = (bbox.x1 - bbox.x0) > original.width * 0.4;
    const tall = (bbox.y1 - bbox.y0) > original.height * 0.4;
    if (wide && tall) {
      page = new ImageProcessor(original).execute("warp", { points, bbox }).toCanvas();
    }
    contours.destroy();
    mask.destroy?.();
  } catch {
    // The paper could not be found. Read the photo as it came.
  }

  const longest = Math.max(page.width, page.height);
  const scale = Math.min(MAX_UPSCALE, Math.max(1, TARGET_LONGEST_SIDE / longest));
  const processor = new ImageProcessor(page);
  if (scale !== 1) {
    processor.execute("resize", {
      width: Math.round(page.width * scale),
      height: Math.round(page.height * scale),
    });
  }
  const bytes = await CanvasProcessor.prepareBuffer(processor.toCanvas());
  processor.destroy?.();
  return bytes;
}

async function getService(): Promise<Service> {
  service ??= (async () => {
    const ort = await import("onnxruntime-web");
    // Served by this app, so the reader keeps working when the CDN does not.
    ort.env.wasm.wasmPaths = "/ort/";
    // One thread: several would need the page to be cross-origin isolated,
    // which would mean loosening headers the whole app is protected by.
    ort.env.wasm.numThreads = 1;
    const { PaddleOcrService } = await import("ppu-paddle-ocr/web");
    // The published types mark the loaded character list as required on the
    // options, though it is filled in by the service itself and the library's
    // own examples leave it out. Hence the cast, which is only about the type.
    type Options = ConstructorParameters<typeof PaddleOcrService>[0];
    const svc = new PaddleOcrService({
      model: MODEL,
      recognition: { strategy: "per-line" },
      session: { executionProviders: ["wasm"] },
    } as unknown as Options);
    await svc.initialize();
    return svc as unknown as Service;
  })();
  try {
    return await service;
  } catch (e) {
    // A failed load must not poison every later attempt.
    service = null;
    throw e;
  }
}

export type ReadStage = "opening" | "loading" | "reading";

/**
 * The text of one invoice photo. Throws with a message meant for the person,
 * not for a log — this runs on a counter, not a console.
 */
export async function readPhotoText(
  file: File | Blob,
  onStage?: (stage: ReadStage) => void,
): Promise<string> {
  onStage?.("opening");
  const image = await prepare(file);
  onStage?.("loading");
  const svc = await getService();
  onStage?.("reading");
  const result = await svc.recognize(image);
  return result.text ?? "";
}

/** Whether the model has already been fetched and set up in this tab. */
export function readerIsReady(): boolean {
  return service !== null;
}
