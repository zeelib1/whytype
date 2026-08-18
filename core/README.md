# whytype

Agents guess at flattened TS errors and patch symptoms; `whytype_explain`
hands them the compiler's reasoning chain and the declaration site it points
to, so they fix the cause in one loop.

## Agents (Claude Code, Cursor): two commands

```sh
npm i -D whytype
npx whytype init
```

`init` registers the MCP server in `.mcp.json` (and `.cursor/mcp.json` when
the repo uses Cursor), adds a short instruction block to an existing
CLAUDE.md/AGENTS.md, and never overwrites config it didn't write. Prefer the
manual route? `claude mcp add whytype -- npx whytype mcp`. The project being
debugged needs a local `typescript` install (5.x–6.x).

Tools:

- `whytype_diagnostics` — compact error list with a
  `N error(s) — typescript X — tsconfig.json` header; `errorsOnly: false`
  includes warnings, `offset`/`limit` paginate, `project` targets a package
  inside a monorepo.
- `whytype_explain` — because-chain + inference bindings + conditional trace
  at `file:line:col` (also takes `project`).
- `whytype_snippet` — explain pasted code, no project needed.

### Hooks: zero tool calls

`npx whytype init --hooks` wires a Claude Code `PostToolUse` hook: after every
`Edit`/`Write`, `whytype hook` re-checks the edited file and feeds new errors
back as because-chains automatically. Each hook run is a cold compile
(seconds on big projects) — the hook surfaces regressions; the MCP tools are
the fast investigation loop.

```json
{ "hooks": { "PostToolUse": [ { "matcher": "Edit|Write|MultiEdit",
    "hooks": [ { "type": "command", "command": "npx whytype hook" } ] } ] } }
```

What `whytype_explain` returns (verbatim, code frame omitted):

```markdown
## error TS2322 — src/main.ts:14:14

Type '{ port: string; host: string; }' is not assignable to type 'Config'.

Because:
- TS2326 Types of property 'port' are incompatible.
  - TS2322 Type 'string' is not assignable to type 'number'.

_typescript 6.0.3_
```

## CLI

```sh
npx whytype src/app.ts:42:7   # explain one location
npx whytype check             # every project error as a because-tree
npx whytype check --json      # stable wire types for scripts
npx whytype init              # register the MCP server for this repo (--hooks, --dry-run)
```

tsconfig.json is discovered upward from cwd (`--project` overrides). Exit
codes: 0 clean, 1 errors found, 2 usage/environment problem.

## What the engine extracts

- **Explain-trees**: every diagnostic's elaboration chain as a tree
  (`DiagnosticInfo.chain`), ready to render as "because → because".
- **Generic inference bindings**: for any call site, each type parameter and
  the type it was inferred as.
- **Conditional-type traces**: which branch of `T extends U ? X : Y` fired —
  including per-member verdicts when a union distributes, `any` taking both
  branches, and `never`. Verdicts come from probe types the checker itself
  evaluates, never from reimplemented assignability.

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
