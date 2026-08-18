/**
 * Harness for real-project mode: createProject over the demo fixture.
 * Run: npx tsx spike/test-project.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createProject, createProjectLoader } from "../engine/node";
import { renderDiagnostic } from "../engine/render";

const fixture = path.join(import.meta.dirname, "fixtures", "demo-project");
const project = createProject({ rootDir: fixture });
console.log(`project typescript@${project.tsVersion}`);
console.log(`config: ${project.configPath}`);
console.log(`files: ${project.fileNames.map((f) => path.basename(f)).join(", ")}\n`);

let failures = 0;
function check(what: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✓" : "✗ FAIL:"} ${what}${ok ? "" : " — got " + JSON.stringify(extra)}`);
  if (!ok) failures++;
}

// ── analyze: whole project ─────────────────────────────────────────────────
const all = project.analyze();
check("analyze() finds exactly two errors", all.length === 2, all.map((d) => d.code));
check("the second error has a because chain", (all[1]?.chain.children.length ?? 0) > 0, all[1]?.chain);
const diag = all[0];
check("it is TS2322", diag?.code === 2322, diag?.code);
check("diag.file points at main.ts", !!diag?.file?.endsWith("src/main.ts"), diag?.file);
check(
  "cross-file related info points at shapes.ts with a position",
  !!diag?.related.some((r) => r.file?.endsWith("src/shapes.ts") && r.line != null && r.column != null),
  diag?.related
);

// ── analyze: one file, via relative path with ./ noise ─────────────────────
const one = project.analyze("./spike/../spike/fixtures/demo-project/src/main.ts");
check("analyze(relative-with-dots file) works", one.length === 2 && one[0].code === 2322);

// ── inspect: generic inference at the pick() call ──────────────────────────
const mainPath = path.join(fixture, "src", "main.ts");
const mainText = fs.readFileSync(mainPath, "utf8");
const pickLine = mainText.split("\n").findIndex((l) => l.includes("pick(cfg")) + 1;
const pickCol = mainText.split("\n")[pickLine - 1].indexOf("pick(") + 2;
const ins = project.inspect(mainPath, { line: pickLine, column: pickCol });
check("inspect returns a result at pick()", !!ins);
check("inspect result carries file", !!ins?.file?.endsWith("src/main.ts"), ins?.file);
const bindings = ins?.call?.bindings ?? [];
console.log(
  `   pick bindings: ${bindings.map((b) => `${b.name}=${b.type}`).join(", ")} → ${ins?.call?.returnType}`
);
check(
  "T inferred as Config, K as \"host\"",
  bindings.some((b) => b.name === "T" && b.type === "Config") &&
    bindings.some((b) => b.name === "K" && b.type === '"host"'),
  bindings
);

// ── inspect: conditional trace through the imported alias ──────────────────
const condLine = mainText.split("\n").findIndex((l) => l.includes("Unwrap<Promise<Date>>")) + 1;
const condCol = mainText.split("\n")[condLine - 1].indexOf("Unwrap") + 2;
const cond = project.inspect(mainPath, { line: condLine, column: condCol })?.conditional;
console.log(`   trace: ${cond?.referenceText} = ${cond?.result}`);
cond?.steps.forEach((s, i) =>
  console.log(`   step ${i}: (${s.checkResolved} extends ${s.extendsResolved}) -> ${s.verdict}`)
);
check("conditional trace resolves to Date", cond?.result === "Date", cond?.result);
check("first step verdict is true", cond?.steps[0]?.verdict === "true", cond?.steps);

// ── explain: one-shot combines both ────────────────────────────────────────
const ex = project.explain({ file: mainPath });
check("explain returns the diagnostics", ex.diagnostics.length === 2);
check("explain auto-inspects at the first error", ex.inspect != null);

// ── render: markdown contains frame + because bullet + related path ────────
const md = renderDiagnostic(diag, { sourceText: mainText, filePath: "src/main.ts" });
console.log("\n" + md + "\n");
check("markdown has the header", md.includes("## error TS2322 — src/main.ts:"));
check("markdown has a code frame marker", md.includes("> ") && md.includes("^"));
check("markdown has a Related entry with shapes.ts", /Related:[\s\S]*shapes\.ts:\d+:\d+/.test(md));

// ── loader: cache hit when untouched, rebuild after a touch ────────────────
const loader = createProjectLoader({ rootDir: fixture });
const p1 = loader.load();
check("loader.load() twice returns the same Project when nothing changed", loader.load() === p1);
const stat = fs.statSync(mainPath);
try {
  fs.utimesSync(mainPath, stat.atime, new Date(stat.mtimeMs + 1500));
  const p2 = loader.load();
  check("loader rebuilds after main.ts mtime changes", p2 !== p1);
  check("rebuilt project still sees both errors", p2.analyze().length === 2);
  check("loader caches the rebuilt project", loader.load() === p2);
} finally {
  fs.utimesSync(mainPath, stat.atime, stat.mtime);
}

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all project-mode checks pass");
process.exit(failures ? 1 : 0);
