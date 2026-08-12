/**
 * Builds @whytype/core from ../engine sources.
 *
 * The repo's engine imports "typescript-strada" (an npm alias pinning the
 * last JS-based compiler). Published consumers bring their own `typescript`
 * peer instead, so both the bundles and the declarations are rewritten to
 * import plain "typescript".
 */
import { execFileSync } from "node:child_process";
import esbuild from "../node_modules/esbuild/lib/main.js";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const dist = path.join(import.meta.dirname, "dist");
fs.rmSync(dist, { recursive: true, force: true });

const aliasToTypescript = {
  name: "alias-typescript",
  setup(build) {
    build.onResolve({ filter: /^typescript-strada$/ }, () => ({
      path: "typescript",
      external: true,
    }));
  },
};

for (const [format, outfile] of [
  ["esm", "index.js"],
  ["cjs", "index.cjs"],
]) {
  await esbuild.build({
    entryPoints: [path.join(root, "engine", "index.ts")],
    bundle: true,
    format,
    platform: "neutral",
    target: "es2022",
    outfile: path.join(dist, outfile),
    plugins: [aliasToTypescript],
  });
}

// Declarations via the pinned TS 6 compiler, then the same import rewrite.
execFileSync(
  "node",
  [
    path.join(root, "node_modules", "typescript-strada", "lib", "tsc.js"),
    ...["engine/index.ts", "--ignoreConfig", "--declaration", "--emitDeclarationOnly"],
    ...["--outDir", dist, "--target", "es2022", "--module", "esnext"],
    ...["--moduleResolution", "bundler", "--strict", "--skipLibCheck"],
  ],
  { cwd: root, stdio: "inherit" }
);

for (const f of fs.readdirSync(dist)) {
  if (!f.endsWith(".d.ts")) continue;
  const p = path.join(dist, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("typescript-strada", "typescript"));
}
console.log("built @whytype/core ->", fs.readdirSync(dist).join(", "));
