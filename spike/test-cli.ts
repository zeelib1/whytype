/**
 * Harness for the built CLI (core/dist/cli.js) against the demo fixture.
 * Requires `npm run build:core` first. Run: npx tsx spike/test-cli.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const fixture = path.join(import.meta.dirname, "fixtures", "demo-project");
const cli = path.join(root, "core", "dist", "cli.js");

// The fixture plays the consumer: give it its own `typescript` (the pinned
// TS 6) so the CLI's cwd-first resolution finds a JS-API compiler — the
// repo root's typescript@7 (tsgo) has none.
const fixtureTsLink = path.join(fixture, "node_modules", "typescript");
fs.mkdirSync(path.dirname(fixtureTsLink), { recursive: true });
if (!fs.existsSync(fixtureTsLink)) {
  fs.symlinkSync(path.join(root, "node_modules", "typescript-strada"), fixtureTsLink, "dir");
}

let failures = 0;
function check(what: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✓" : "✗ FAIL:"} ${what}${ok ? "" : " — " + JSON.stringify(extra)?.slice(0, 300)}`);
  if (!ok) failures++;
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [cli, ...args], { cwd: fixture, encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

// ── check ──────────────────────────────────────────────────────────────────
const chk = run(["check"]);
check("check exits 1", chk.code === 1, chk);
check("check reports TS2322", chk.stdout.includes("TS2322"), chk.stdout);
check("check shows a because bullet", /Because:\n- TS\d+/.test(chk.stdout), chk.stdout);
check("check paths are relativized", chk.stdout.includes("src/main.ts:4:"), chk.stdout);
check("check prints a summary", /\d+ error\(s\) in \d+ file\(s\)/.test(chk.stdout), chk.stdout);

// ── explain shorthand with :line:col — conditional trace ───────────────────
const mainText = fs.readFileSync(path.join(fixture, "src", "main.ts"), "utf8");
const condLine = mainText.split("\n").findIndex((l) => l.includes("Unwrap<Promise<Date>>")) + 1;
const condCol = mainText.split("\n")[condLine - 1].indexOf("Unwrap") + 2;
const exp = run([`src/main.ts:${condLine}:${condCol}`]);
check("explain at conditional exits 1 (file has an error)", exp.code === 1, exp);
check("explain shows the conditional trace", exp.stdout.includes("Conditional trace:"), exp.stdout);
check("trace verdict is rendered", exp.stdout.includes("**true**"), exp.stdout);

// ── check --json ───────────────────────────────────────────────────────────
const js = run(["check", "--json"]);
check("check --json parses", (() => { try { JSON.parse(js.stdout); return true; } catch { return false; } })(), js.stdout.slice(0, 200));
const diags = JSON.parse(js.stdout);
check("json diagnostics carry file paths", Array.isArray(diags) && !!diags[0]?.file, diags[0]);

// ── explain with no position: whole file + auto-inspect ────────────────────
const whole = run(["explain", "src/main.ts"]);
check("explain file exits 1", whole.code === 1, whole);
check("explain file has the error header", whole.stdout.includes("## error TS2322 — src/main.ts:"), whole.stdout);

// ── usage errors ───────────────────────────────────────────────────────────
check("unknown flag exits 2", run(["check", "--nope"]).code === 2);
check("no args exits 2 and prints usage", (() => { const r = run([]); return r.code === 2 && r.stdout.includes("Usage:"); })());
check("missing file exits 2", run(["explain", "src/nope.ts"]).code === 2);
check("--version exits 0", (() => { const r = run(["--version"]); return r.code === 0 && /^\d+\.\d+\.\d+$/.test(r.stdout.trim()); })());

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all CLI checks pass");
process.exit(failures ? 1 : 0);
