/**
 * Harness for `whytype init` (built CLI) — merge safety and idempotency.
 * Requires `npm run build:core` first. Run: npx tsx spike/test-init.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const cli = path.join(root, "core", "dist", "cli.js");

let failures = 0;
function check(what: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✓" : "✗ FAIL:"} ${what}${ok ? "" : " — " + JSON.stringify(extra)?.slice(0, 300)}`);
  if (!ok) failures++;
}

function run(cwd: string, ...args: string[]): { code: number; stdout: string } {
  try {
    return { code: 0, stdout: execFileSync("node", [cli, "init", ...args], { cwd, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? "" };
  }
}

function inTemp(name: string, fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `whytype-init-${name}-`));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), "utf8");

// ── fresh directory ────────────────────────────────────────────────────────
inTemp("fresh", (dir) => {
  const r = run(dir);
  check("fresh init exits 0", r.code === 0, r);
  const mcp = JSON.parse(read(dir, ".mcp.json"));
  check(
    ".mcp.json has the whytype server",
    mcp.mcpServers?.whytype?.command === "npx" &&
      JSON.stringify(mcp.mcpServers.whytype.args) === '["whytype","mcp"]',
    mcp
  );
  check("no Cursor config without a .cursor dir", !fs.existsSync(path.join(dir, ".cursor")));
  check("hints at missing CLAUDE.md", r.stdout.includes("no CLAUDE.md/AGENTS.md"), r.stdout);
});

// ── merge preserves a foreign server ───────────────────────────────────────
inTemp("merge", (dir) => {
  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: { other: { command: "foo", args: ["bar"] } } }, null, 2)
  );
  run(dir);
  const mcp = JSON.parse(read(dir, ".mcp.json"));
  check("foreign server survives the merge", mcp.mcpServers?.other?.command === "foo", mcp);
  check("whytype added next to it", !!mcp.mcpServers?.whytype, mcp);
});

// ── invalid JSON is never touched ──────────────────────────────────────────
inTemp("invalid", (dir) => {
  const broken = '{ "mcpServers": { oops ';
  fs.writeFileSync(path.join(dir, ".mcp.json"), broken);
  const r = run(dir);
  check("invalid .mcp.json alone exits 2", r.code === 2, r);
  check("invalid .mcp.json is untouched", read(dir, ".mcp.json") === broken);
  check("manual instruction is printed", r.stdout.includes("add manually"), r.stdout);
  // With another target succeeding, the same failure is non-fatal.
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Project\n");
  const r2 = run(dir);
  check("invalid .mcp.json + working CLAUDE.md exits 0", r2.code === 0, r2);
  check("invalid .mcp.json still untouched", read(dir, ".mcp.json") === broken);
});

// ── a different whytype entry is left alone ────────────────────────────────
inTemp("conflict", (dir) => {
  const custom = { mcpServers: { whytype: { command: "node", args: ["./my-fork.js"] } } };
  fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify(custom, null, 2));
  const r = run(dir);
  check("conflicting entry is not overwritten", JSON.parse(read(dir, ".mcp.json")).mcpServers.whytype.command === "node");
  check("conflict is reported", r.stdout.includes("leaving it alone"), r.stdout);
});

// ── CLAUDE.md block: added once, refresh is byte-identical ─────────────────
inTemp("claudemd", (dir) => {
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# My project\n\nNotes.\n");
  run(dir);
  const after1 = read(dir, "CLAUDE.md");
  check("instruction block lands in CLAUDE.md", after1.includes("whytype_explain") && after1.includes("BEGIN whytype"), after1);
  check("original content is preserved", after1.startsWith("# My project"));
  run(dir);
  check("second run is byte-identical", read(dir, "CLAUDE.md") === after1);
});

// ── Cursor config when .cursor/ exists ─────────────────────────────────────
inTemp("cursor", (dir) => {
  fs.mkdirSync(path.join(dir, ".cursor"));
  run(dir);
  const mcp = JSON.parse(read(dir, path.join(".cursor", "mcp.json")));
  check(".cursor/mcp.json gets the server", !!mcp.mcpServers?.whytype, mcp);
});

// ── --hooks wires PostToolUse exactly once ─────────────────────────────────
inTemp("hooks", (dir) => {
  run(dir, "--hooks");
  const s1 = JSON.parse(read(dir, path.join(".claude", "settings.json")));
  const entries = s1.hooks?.PostToolUse ?? [];
  check("settings.json has the PostToolUse hook", entries.length === 1 && entries[0].hooks?.[0]?.command === "npx whytype hook", s1);
  run(dir, "--hooks");
  const s2 = JSON.parse(read(dir, path.join(".claude", "settings.json")));
  check("second --hooks run adds nothing", (s2.hooks?.PostToolUse ?? []).length === 1, s2);
});

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all init checks pass");
process.exit(failures ? 1 : 0);
