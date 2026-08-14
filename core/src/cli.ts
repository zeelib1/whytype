/**
 * `whytype` CLI: the compiler's reasoning in the terminal, and the door
 * agents use (`whytype mcp`). Zero-dependency argument handling (parseArgs).
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json";
import {
  CliError,
  createProject,
  renderExplain,
  renderDiagnostic,
  type DiagnosticInfo,
  type Project,
} from "./api";

const USAGE = `whytype — the TypeScript compiler, explaining itself

Usage:
  whytype <file>[:line[:col]]     explain a file (or one location) in this project
  whytype explain <file>[:line[:col]] [--line N --col N]
  whytype check [path]            all project diagnostics as because-trees
  whytype mcp                     start the MCP server on stdio (for agents)

Options:
  --project <tsconfig>   explicit tsconfig.json (default: found upward from cwd)
  --json                 raw wire types instead of markdown
  --line N, --col N      1-based position (alternative to the :line:col suffix)
  -h, --help             this help
  -v, --version          print version

Exit codes: 0 no errors, 1 errors found, 2 usage/environment problem.`;

interface Values {
  json?: boolean;
  project?: string;
  line?: string;
  col?: string;
  help?: boolean;
  version?: boolean;
}

function openProject(values: Values): Project {
  return usable(() => createProject({ tsconfigPath: values.project, rootDir: process.cwd() }));
}

/** Engine failures (bad path, broken tsconfig) become clean exit-2 messages. */
function usable<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw e instanceof CliError ? e : new CliError((e as Error).message);
  }
}

/** `src/a.ts:12:5` → file + 1-based position; guarded against exotic filenames. */
function parseTarget(target: string): { file: string; line?: number; column?: number } {
  const m = target.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (m && !fs.existsSync(target)) {
    return { file: m[1], line: Number(m[2]), column: m[3] ? Number(m[3]) : 1 };
  }
  return { file: target };
}

const cwdSlash = process.cwd().replace(/\\/g, "/") + "/";
const relativize = (text: string) => text.replaceAll(cwdSlash, "");

function sourcesFor(diags: DiagnosticInfo[], extra?: string): Map<string, string> {
  const sources = new Map<string, string>();
  for (const file of [...diags.map((d) => d.file), extra]) {
    if (file && !sources.has(file) && fs.existsSync(file)) {
      sources.set(file, fs.readFileSync(file, "utf8"));
    }
  }
  return sources;
}

const hasErrors = (diags: DiagnosticInfo[]) => diags.some((d) => d.category === "error");

function cmdExplain(target: string, values: Values): number {
  const parsed = parseTarget(target);
  const line = values.line != null ? Number(values.line) : parsed.line;
  const column = values.col != null ? Number(values.col) : parsed.column;
  const project = openProject(values);
  const res = usable(() =>
    project.explain({
      file: parsed.file,
      position: line != null ? { line, column: column ?? 1 } : undefined,
    })
  );
  if (values.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(relativize(renderExplain(res, sourcesFor(res.diagnostics, res.file))));
  }
  return hasErrors(res.diagnostics) ? 1 : 0;
}

function cmdCheck(target: string | undefined, values: Values): number {
  const project = openProject(values);
  let diags = usable(() => project.analyze());
  if (target) {
    const prefix = path.resolve(target).replace(/\\/g, "/");
    diags = diags.filter((d) => !d.file || d.file.startsWith(prefix));
  }
  if (values.json) {
    console.log(JSON.stringify(diags, null, 2));
  } else {
    const sources = sourcesFor(diags);
    for (const d of diags) {
      console.log(relativize(renderDiagnostic(d, { sourceText: d.file ? sources.get(d.file) : undefined })));
      console.log();
    }
    const files = new Set(diags.filter((d) => d.category === "error").map((d) => d.file ?? "(project)"));
    const errors = diags.filter((d) => d.category === "error").length;
    console.log(errors ? `${errors} error(s) in ${files.size} file(s)` : "no errors");
  }
  return hasErrors(diags) ? 1 : 0;
}

async function main(): Promise<number> {
  let parsed: { values: Values; positionals: string[] };
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        project: { type: "string" },
        line: { type: "string" },
        col: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    }) as { values: Values; positionals: string[] };
  } catch (e) {
    throw new CliError(`${(e as Error).message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.version) {
    console.log(pkg.version);
    return 0;
  }
  if (values.help || !positionals.length) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const [cmd, ...rest] = positionals;
  if (cmd === "mcp") {
    // Kept external in the bundle so `check`/`explain` never load the MCP SDK.
    const { runMcpServer } = await import("./mcp.js");
    await runMcpServer({ tsconfigPath: values.project, version: pkg.version });
    return 0;
  }
  if (cmd === "check") return cmdCheck(rest[0], values);
  if (cmd === "explain") {
    if (!rest[0]) throw new CliError(`explain needs a file argument\n\n${USAGE}`);
    return cmdExplain(rest[0], values);
  }
  return cmdExplain(cmd, values);
}

main().then(
  (code) => {
    if (code) process.exitCode = code;
  },
  (err) => {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exitCode = err.exitCode;
    } else {
      console.error(err?.stack ?? String(err));
      process.exitCode = 2;
    }
  }
);
