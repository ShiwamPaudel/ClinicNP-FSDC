/**
 * scripts/make-icons.mjs — the installed-app icons, made from the real mark.
 *
 * The app's icons were placeholder artwork from the previous product for a
 * long time (Memory.md D-013). The owner has now supplied the real ClinicNP
 * mark, and this derives the three sizes a browser and an installed app ask
 * for so nobody has to open an image editor to get them consistent.
 *
 * There is no image library in this project and adding one for a job that runs
 * about once a year is not worth it, so the resizing happens in the browser
 * that is already here for the accessibility gate.
 *
 * The maskable icon is the one worth explaining: Android crops an installed
 * icon to whatever shape the launcher uses, and it is allowed to eat
 * everything outside the middle 80%. So that one gets a solid tile in the
 * mark's own navy with the mark inset, and the corners it loses are corners
 * with nothing in them.
 *
 * Run: node scripts/make-icons.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ICONS = join(process.cwd(), "public", "icons");
const SOURCE = join(ICONS, "favicon.png");

const src = `data:image/png;base64,${readFileSync(SOURCE).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const made = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  /** The navy the mark's disc is drawn in, read rather than guessed. */
  function discColour() {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    // A little in from the left edge, halfway down: inside the disc, clear of
    // the lettering.
    const p = x.getImageData(Math.round(img.width * 0.08), Math.round(img.height / 2), 1, 1).data;
    return `rgb(${p[0]} ${p[1]} ${p[2]})`;
  }

  const navy = discColour();

  /** Draw the mark at `size`, optionally on a filled tile and inset. */
  function render(size, { fill = null, inset = 0 } = {}) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    if (fill) {
      x.fillStyle = fill;
      x.fillRect(0, 0, size, size);
    }
    const box = size * (1 - inset * 2);
    x.drawImage(img, size * inset, size * inset, box, box);
    return c.toDataURL("image/png");
  }

  return {
    navy,
    "icon-192.png": render(192),
    "icon-512.png": render(512),
    // 12% in on every side leaves the lettering well inside the safe area.
    "icon-maskable-512.png": render(512, { fill: navy, inset: 0.12 }),
    // iOS ignores transparency and composites a home-screen icon onto black,
    // which would put black corners around the disc. So this one is filled.
    "apple-touch-icon.png": render(180, { fill: navy }),
  };
}, src);

await browser.close();

console.log(`the mark's navy reads as ${made.navy}`);
for (const [name, dataUrl] of Object.entries(made)) {
  if (name === "navy") continue;
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(join(ICONS, name), bytes);
  console.log(`  wrote ${name}  ${(bytes.length / 1024).toFixed(0)} KB`);
}
