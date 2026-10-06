/**
 * copy-ort.mjs — put the WebAssembly runtime the invoice reader needs where
 * the browser can fetch it from this app.
 *
 * onnxruntime-web otherwise pulls its .wasm off a public CDN at the moment
 * somebody presses "Read the photo", which is the worst moment for a clinic on
 * a bad line to depend on somebody else's server. Copying it into public/ort
 * at install and build time keeps it on our own origin, where the service
 * worker can cache it like anything else.
 *
 * The files are big and come straight out of node_modules, so they are
 * gitignored and re-copied rather than committed.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Only the single-threaded build: the reader asks for one thread, and the
// threaded and WebGPU variants together are another 40 MB for nothing.
const FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

// The package does not export its own package.json, so resolve() cannot find
// the folder; the install layout can, since it is a direct dependency.
const dist = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
if (!existsSync(dist)) {
  console.log("copy-ort: onnxruntime-web is not installed — nothing to copy.");
  process.exit(0);
}

const out = join(process.cwd(), "public", "ort");
mkdirSync(out, { recursive: true });

let copied = 0;
for (const name of FILES) {
  const from = join(dist, name);
  const to = join(out, name);
  if (!existsSync(from)) {
    console.warn(`copy-ort: ${name} is missing from onnxruntime-web.`);
    continue;
  }
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(copied ? `copy-ort: copied ${copied} file(s) into public/ort.` : "copy-ort: already up to date.");
