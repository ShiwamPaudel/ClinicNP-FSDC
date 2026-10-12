/**
 * crop.mjs — cuts the empty page off the bottom of each dental shot.
 *
 * The shots are taken in a tall window so nothing scrolls out of frame, which
 * leaves most of them with blank page below the last row. This finds the last
 * row that differs from the page colour and cuts a little below it.
 *
 *   node .pitch-build/dental/crop.mjs
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), ".pitch-build", "dental", "shots");
const OUT = join(process.cwd(), ".pitch-build", "dental", "cropped");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of readdirSync(SRC).filter((n) => n.endsWith(".png")).sort()) {
  const dataUrl = `data:image/png;base64,${readFileSync(join(SRC, f)).toString("base64")}`;
  const out = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width;
    const H = img.height;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, W, H).data;
    const at = (x, y) => (y * W + x) * 4;
    const bgI = at(Math.floor(W / 2), H - 3);
    const bg = [data[bgI], data[bgI + 1], data[bgI + 2]];
    let last = 0;
    for (let y = H - 1; y >= 0 && !last; y--) {
      let differing = 0;
      for (let x = 0; x < W; x += 3) {
        const i = at(x, y);
        if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 24) differing++;
      }
      if (differing > 2) last = y;
    }
    const cut = Math.min(H, last + Math.round(W * 0.018));
    const o = document.createElement("canvas");
    o.width = W;
    o.height = cut;
    o.getContext("2d").drawImage(img, 0, 0);
    return { url: o.toDataURL("image/png"), from: H, to: cut };
  }, dataUrl);
  writeFileSync(join(OUT, f), Buffer.from(out.url.split(",")[1], "base64"));
  console.log(f.padEnd(28), out.from, "→", out.to);
}
await browser.close();
