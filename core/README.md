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

## MCP (agents)

Give your agent the compiler's own explanation instead of letting it guess.
In the project being debugged (it needs a local `typescript` install):

```sh
npm i -D whytype
claude mcp add whytype -- npx whytype mcp
```

Tools: `whytype_diagnostics` (compact error list), `whytype_explain`
(because-chain + inference bindings + conditional trace at `file:line:col`),
`whytype_snippet` (explain pasted code, no project needed).

## CLI

```sh
npx whytype src/app.ts:42:7   # explain one location
npx whytype check             # every project error as a because-tree
npx whytype check --json      # stable wire types for scripts
```

tsconfig.json is discovered upward from cwd (`--project` overrides). Exit
codes: 0 clean, 1 errors found, 2 usage/environment problem.

## Library — project mode (Node)

```ts
import { createProject } from "whytype/node";

const project = createProject({ rootDir: process.cwd() });
project.analyze();                                    // DiagnosticInfo[] with file paths
project.inspect("src/app.ts", { line: 42, column: 7 });
console.log(project.explainMarkdown({ file: "src/app.ts" }));
```

## Library — snippet mode

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
