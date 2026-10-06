import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".pitch-build", process.env.DIR ?? "shots");
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();

function dataUri(p) {
  return "data:image/png;base64," + readFileSync(p).toString("base64");
}

const cells = files
  .map(
    (f) =>
      `<figure><img src="${dataUri(join(dir, f))}"><figcaption>${f.replace(
        ".png",
        "",
      )}</figcaption></figure>`,
  )
  .join("");

const html = `<style>
 body{margin:0;background:#222;font:11px system-ui;color:#fff}
 .g{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:8px}
 figure{margin:0}
 img{width:100%;display:block;border:1px solid #555}
 figcaption{padding:2px 0;font-size:11px;color:#9f9}
</style><div class="g">${cells}</div>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1900, height: 1000 } });
await p.setContent(html);
await p.waitForTimeout(3000);
await p.screenshot({
  path: join(process.cwd(), ".pitch-build", process.env.OUTNAME ?? "sheet.png"),
  fullPage: true,
});
await b.close();
console.log("sheet built:", files.length, "shots");
