// Copies the TS default lib files out of the pinned typescript-strada package
// so the engine's virtual filesystem can bundle them (see engine/libs.ts).
// Runs on postinstall; engine/libs/ is gitignored.
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const src = path.join(root, "node_modules", "typescript-strada", "lib");
const dest = path.join(root, "engine", "libs");

fs.mkdirSync(dest, { recursive: true });
let count = 0;
for (const f of fs.readdirSync(src)) {
  if (f.startsWith("lib") && f.endsWith(".d.ts")) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
    count++;
  }
}
console.log(`copy-libs: ${count} lib files -> engine/libs/`);
