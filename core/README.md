# whytype

The engine behind [WhyType](https://github.com/zeelib1/whytype) — extract the
TypeScript compiler's *reasoning*, not just its verdicts:

- **Explain-trees**: every diagnostic's elaboration chain as a tree
  (`DiagnosticInfo.chain`), ready to render as "because → because".
- **Generic inference bindings**: for any call site, each type parameter and
  the type it was inferred as.
- **Conditional-type traces**: which branch of `T extends U ? X : Y` fired —
  including per-member verdicts when a union distributes, `any` taking both
  branches, and `never`. Verdicts come from probe types the checker itself
  evaluates, never from reimplemented assignability.

## Usage

The engine is host-agnostic: you inject the default-lib `.d.ts` files once,
then analyze single-file snippets.

```ts
import { analyze, initEngine, inspect } from "whytype";
import fs from "node:fs";
import path from "node:path";

// Load TS default libs from your own typescript install (once).
const libDir = path.join(path.dirname(require.resolve("typescript")), "..");
const libs = new Map<string, string>();
for (const f of fs.readdirSync(libDir)) {
  if (f.startsWith("lib") && f.endsWith(".d.ts")) {
    libs.set("/lib/" + f, fs.readFileSync(path.join(libDir, f), "utf8"));
  }
}
initEngine(libs);

const diagnostics = analyze(`const n: string = 42;`);
console.log(diagnostics[0].chain); // { code, message, children: [...] }

const info = inspect(`type R = 42 extends string ? "yes" : "no";`, 6);
console.log(info?.conditional);    // steps with real checker verdicts
```

Requires a `typescript` peer in the 5.x–6.x range (the JS-based compiler).
A tsgo-backed build lands when the TypeScript 7.1 stable API ships.
