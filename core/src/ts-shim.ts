/**
 * Runtime TypeScript resolution for the CLI/MCP bundles. The build aliases
 * "typescript-strada" to this module, so the bundled engine runs on the
 * USER'S compiler: resolved from the project cwd first, then from whytype's
 * own install (npx case). tsgo (TS 7) has no JS API yet and is skipped.
 */
import { createRequire } from "node:module";
import path from "node:path";

function resolveTypescript(): { mod: typeof import("typescript-strada"); entry: string } {
  const bases = [path.join(process.cwd(), "__whytype_resolve__.js"), import.meta.url];
  for (const base of bases) {
    try {
      const req = createRequire(base);
      const entry = req.resolve("typescript");
      const mod = req(entry);
      if (typeof mod?.createProgram === "function") return { mod, entry };
    } catch {
      // keep trying the next base
    }
  }
  throw new Error(
    "whytype needs a usable 'typescript' package (>=5.0 <7) — TS 7 (tsgo) has no JS API yet.\n" +
      "Fix: npm i -D typescript@6   (in the project you are debugging)"
  );
}

// Resolution is deferred to first use so metadata commands (--help, --version,
// init) work in projects that have not installed typescript yet.
let cached: { mod: typeof import("typescript-strada"); entry: string } | undefined;
const resolved = () => (cached ??= resolveTypescript());

export default new Proxy({} as Record<PropertyKey, unknown>, {
  get: (_, key) => (resolved().mod as unknown as Record<PropertyKey, unknown>)[key],
}) as unknown as typeof import("typescript-strada");

/** Absolute path of the resolved lib/typescript.js — its dir holds lib.*.d.ts. */
export function typescriptEntryPath(): string {
  return resolved().entry;
}
