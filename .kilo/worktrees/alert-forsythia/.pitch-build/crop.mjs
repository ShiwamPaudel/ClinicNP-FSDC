/**
 * crop.mjs — trims the dead space off the bottom of each screenshot.
 *
 * A list screen photographed at 1440x900 is often half empty below the last
 * row, which in a document wastes a third of a page and makes the part you
 * actually want to read smaller. This finds the last row that carries content
 * in the main panel and cuts just below it.
 *
 * The sidebar and the counter's payment pane are solid full-height blocks, so
 * they are excluded from the scan: only the middle of the page decides.
 *
 * Run: node .pitch-build/crop.mjs
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), ".pitch-build", "shots");
const OUT = join(process.cwd(), ".pitch-build", "cropped");
mkdirSync(OUT, { recursive: true });

/** Screens that must not be cropped — the whole frame is the point. */
const KEEP_WHOLE = new Set(["login"]);

const browser = await chromium.launch();
const page = await browser.newPage();

const files = readdirSync(SRC).filter((f) => f.endsWith(".png")).sort();
const report = [];

for (const f of files) {
  const b64 = readFileSync(join(SRC, f)).toString("base64");
  const keep = KEEP_WHOLE.has(f.replace(".png", ""));

  const result = await page.evaluate(
    async ({ dataUrl, keep }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const W = img.width;
      const H = img.height;

      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0);

      let cutY = H;
      if (!keep) {
        // Scan only the middle band: past the sidebar, short of any right pane.
        const x0 = Math.floor(W * 0.26);
        const x1 = Math.floor(W * 0.72);
        const bandW = x1 - x0;

        // Background = the colour of the bottom-left of that band, which on
        // every one of these screens is empty page.
        const bg = cx.getImageData(x0 + 4, H - 6, 1, 1).data;
        const isBg = (r, g, b) =>
          Math.abs(r - bg[0]) < 10 &&
          Math.abs(g - bg[1]) < 10 &&
          Math.abs(b - bg[2]) < 10;

        const band = cx.getImageData(x0, 0, bandW, H).data;
        const minKeep = Math.floor(H * 0.24); // never cut above this
        let found = false;
        for (let y = H - 1; y >= minKeep; y--) {
          let differing = 0;
          const rowStart = y * bandW * 4;
          for (let x = 0; x < bandW; x += 2) {
            const i = rowStart + x * 4;
            if (!isBg(band[i], band[i + 1], band[i + 2])) differing++;
          }
          // a real row of content, not a stray antialiased pixel
          if (differing > bandW * 0.004) {
            cutY = Math.min(H, y + Math.round(H * 0.035));
            found = true;
            break;
          }
        }
        // A very sparse screen — one card near the top — has no content row
        // anywhere above the floor. Cut to the floor rather than keeping the
        // whole empty frame.
        if (!found) cutY = minKeep;
      }

      const out = document.createElement("canvas");
      out.width = W;
      out.height = cutY;
      const ox = out.getContext("2d");
      ox.drawImage(cv, 0, 0, W, cutY, 0, 0, W, cutY);
      return { url: out.toDataURL("image/png"), W, H, cutY };
    },
    { dataUrl: `data:image/png;base64,${b64}`, keep },
  );

  writeFileSync(
    join(OUT, f),
    Buffer.from(result.url.split(",")[1], "base64"),
  );
  report.push([f, result.H, result.cutY]);
}

await browser.close();

console.log("cropped → .pitch-build/cropped\n");
for (const [f, h, c] of report) {
  const pct = Math.round((c / h) * 100);
  console.log(
    `  ${f.replace(".png", "").padEnd(26)} ${String(h).padStart(4)} → ${String(c).padStart(4)}  (${pct}%)`,
  );
}
