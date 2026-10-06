/**
 * icons.mjs — turns a lucide-react icon module into an inline SVG string, so
 * the product document uses exactly the icon family the app itself draws with
 * and nothing has to be fetched at render time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "node_modules", "lucide-react", "dist", "esm", "icons");

/** Pull the [tag, props] element list out of the module source. */
function parseElements(src) {
  // Each element is ["tag", { k: "v", ... }] — possibly across several lines.
  const out = [];
  const re = /\[\s*"([a-zA-Z]+)"\s*,\s*\{([\s\S]*?)\}\s*\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const body = m[2];
    const props = {};
    const pre = /([a-zA-Z0-9_-]+|"[^"]+")\s*:\s*"([^"]*)"/g;
    let p;
    while ((p = pre.exec(body)) !== null) {
      const key = p[1].replace(/"/g, "");
      if (key === "key") continue; // React bookkeeping, not an SVG attribute
      props[key] = p[2];
    }
    if (Object.keys(props).length > 0) out.push([tag, props]);
  }
  return out;
}

const cache = new Map();

/**
 * @param {string} name  kebab-case lucide name, e.g. "flask-conical"
 * @param {object} opts  { size, stroke, className }
 */
export function icon(name, opts = {}) {
  const size = opts.size ?? 24;
  const stroke = opts.stroke ?? 1.75;
  const cls = opts.className ? ` class="${opts.className}"` : "";
  if (!cache.has(name)) {
    const src = readFileSync(join(DIR, `${name}.js`), "utf8");
    cache.set(name, parseElements(src));
  }
  const els = cache
    .get(name)
    .map(
      ([tag, props]) =>
        `<${tag} ${Object.entries(props)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")} />`,
    )
    .join("");
  return (
    `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${els}</svg>`
  );
}
