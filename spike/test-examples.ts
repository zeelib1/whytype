/**
 * Every gallery example must behave exactly as its note promises — a demo
 * that errors differently than advertised kills the launch video.
 * Run: npx tsx spike/test-examples.ts
 */
import fs from "node:fs";
import path from "node:path";
import { analyze, initEngine, inspect } from "../engine/analyze";
import { EXAMPLES } from "../src/examples";

const libDir = path.join(import.meta.dirname, "..", "engine", "libs");
const libs = new Map<string, string>();
for (const f of fs.readdirSync(libDir)) {
  if (f.startsWith("lib") && f.endsWith(".d.ts")) {
    libs.set("/lib/" + f, fs.readFileSync(path.join(libDir, f), "utf8"));
  }
}
initEngine(libs);

/** slug -> expected error count; null count = must be clean (inspection demo). */
const EXPECT: Record<string, { errors: number; traceAt?: string; verdict?: string }> = {
  "buried-mismatch": { errors: 1 },
  "never-parameter": { errors: 1 },
  contravariance: { errors: 1 },
  "excess-property": { errors: 1 },
  distribution: { errors: 0, traceAt: "Mixed", verdict: "distributes" },
  "any-both-branches": { errors: 0, traceAt: "Sneaky", verdict: "both" },
  "readonly-door": { errors: 1 },
  "watch-inference": { errors: 0 },
};

let failures = 0;
for (const ex of EXAMPLES) {
  const want = EXPECT[ex.slug];
  if (!want) {
    console.log(`✗ FAIL ${ex.slug}: no expectation defined`);
    failures++;
    continue;
  }
  const diags = analyze(ex.code).filter((d) => d.category === "error");
  let ok = diags.length === want.errors;
  let detail = `${diags.length} error(s)`;
  if (ok && want.traceAt) {
    // Target the alias DECLARATION — the note text may mention the name first.
    const declPos = ex.code.indexOf(`type ${want.traceAt}`) + "type ".length + 1;
    const trace = inspect(ex.code, declPos)?.conditional;
    ok = trace?.steps[0]?.verdict === want.verdict;
    detail += `, trace verdict: ${trace?.steps[0]?.verdict ?? "none"}`;
  }
  console.log(`${ok ? "✓" : "✗ FAIL"} ${ex.slug} — ${detail}`);
  if (!ok) failures++;
}

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all gallery examples behave as advertised");
process.exit(failures ? 1 : 0);
