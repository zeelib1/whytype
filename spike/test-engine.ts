/**
 * Node test harness for the engine (the same code the worker runs).
 * Seed of the Phase 3 dogfood-corpus runner. Run: npx tsx spike/test-engine.ts
 */
import fs from "node:fs";
import path from "node:path";
import { analyze, initEngine, inspect, tsVersion } from "../engine/analyze";

const libDir = path.join(import.meta.dirname, "..", "engine", "libs");
const libs = new Map<string, string>();
for (const f of fs.readdirSync(libDir)) {
  if (f.startsWith("lib") && f.endsWith(".d.ts")) {
    libs.set("/lib/" + f, fs.readFileSync(path.join(libDir, f), "utf8"));
  }
}
initEngine(libs);
console.log(`engine typescript@${tsVersion}, ${libs.size} libs\n`);

const code = `
type IsString<T> = T extends string ? "yes" : "no";
type Simple = IsString<42>;
type Distributed = IsString<"a" | 1>;
type Sneaky = IsString<any>;
type Empty = IsString<never>;

type Unwrap<T> = T extends Promise<infer U> ? U : T extends string ? number : boolean;
type Chained = IsString<Date> extends "no" ? Unwrap<"x"> : never;
type TwoStep = Unwrap<"hello">;

interface Config { port: number }
const bad: Config = { port: "80" };
`;

let failures = 0;
function expectTrace(aliasName: string, wants: Partial<Record<string, unknown>>) {
  const pos = code.indexOf(aliasName) + 1;
  const result = inspect(code, pos);
  const trace = result?.conditional;
  console.log(`── ${aliasName}`);
  if (!trace) {
    console.log("   NO TRACE");
    failures++;
    return;
  }
  console.log(`   ${trace.referenceText} = ${trace.result}`);
  trace.steps.forEach((s, i) => {
    const dist = s.members
      ? " [" + s.members.map((m) => `${m.text}→${m.verdict}`).join(", ") + "]"
      : "";
    console.log(
      `   step ${i}: (${s.checkResolved ?? "?"} extends ${s.extendsResolved ?? "?"}) -> ${s.verdict}${dist}`
    );
  });
  for (const [key, want] of Object.entries(wants)) {
    const got =
      key === "result"
        ? trace.result
        : key === "steps"
          ? trace.steps.length
          : key.startsWith("verdict")
            ? trace.steps[Number(key.slice(7))]?.verdict
            : undefined;
    if (got !== want) {
      console.log(`   FAIL: ${key} = ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
      failures++;
    }
  }
  console.log();
}

expectTrace("Simple", { result: '"no"', verdict0: "false", steps: 1 });
expectTrace("Distributed", { result: '"no" | "yes"', verdict0: "distributes" });
expectTrace("Sneaky", { result: '"no" | "yes"', verdict0: "both" });
expectTrace("Empty", { result: "never", verdict0: "never" });
expectTrace("TwoStep", { result: "number", verdict0: "false", verdict1: "true", steps: 2 });

// Diagnostics still work after the libs-injection refactor.
const diags = analyze(code);
console.log(`── diagnostics: ${diags.length} (expect 1: port mismatch)`);
if (diags.length !== 1 || diags[0].code !== 2322) {
  console.log("   FAIL: expected exactly one TS2322");
  failures++;
}

// Cases from the playground SAMPLE — the demo must never show a wrong verdict.
const sample = `
type Unwrap<T> = T extends Promise<infer U> ? U
  : T extends string ? number
  : boolean;
type FromPromise = Unwrap<Promise<Date>>;
type Mixed = Unwrap<"a" | Promise<string>>;
`;
function quick(
  alias: string,
  wants: { result: string; verdict0: string; member?: string; memberResults?: string }
) {
  const pos = sample.indexOf(alias) + 1;
  const t = inspect(sample, pos)?.conditional;
  console.log(`── ${alias}: ${t?.referenceText} = ${t?.result}`);
  t?.steps.forEach((s, i) =>
    console.log(
      `   step ${i}: (${s.checkResolved} extends ${s.extendsResolved}) -> ${s.verdict}` +
        (s.members
          ? " [" + s.members.map((m) => `${m.text}→${m.verdict}=${m.result}`).join(", ") + "]"
          : "")
    )
  );
  const memberStr = t?.steps[0]?.members?.map((m) => `${m.text}→${m.verdict}`).join(", ");
  const memberResultStr = t?.steps[0]?.members?.map((m) => m.result).join(", ");
  if (t?.result !== wants.result || t?.steps[0]?.verdict !== wants.verdict0 ||
      (wants.member && memberStr !== wants.member) ||
      (wants.memberResults && memberResultStr !== wants.memberResults)) {
    console.log(`   FAIL: wanted ${JSON.stringify(wants)}`);
    failures++;
  }
}
quick("FromPromise", { result: "Date", verdict0: "true" });
quick("Mixed", {
  result: "string | number",
  verdict0: "distributes",
  member: '"a"→false, Promise<string>→true',
  memberResults: "number, string",
});

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all engine checks pass");
process.exit(failures ? 1 : 0);
