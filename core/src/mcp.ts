/**
 * MCP server (`whytype mcp`): the because-chain engine over stdio, for
 * agents. Loaded lazily by cli.ts so plain CLI runs never touch the SDK.
 * Stdout is the protocol — nothing may print to it.
 */
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createProjectLoader,
  renderDiagnostic,
  renderExplain,
  renderInspect,
  snippetAnalyze,
  snippetInspect,
  type DiagnosticInfo,
  type ProjectLoader,
} from "./api";

interface McpOptions {
  tsconfigPath?: string;
  version: string;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (e: unknown) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: (e as Error).message ?? String(e) }],
});

const cwdSlash = process.cwd().replace(/\\/g, "/") + "/";
const rel = (p: string | undefined) => (p ?? "(project)").replace(cwdSlash, "");

function compactLine(d: DiagnosticInfo): string {
  const msg = d.chain.message.split("\n")[0];
  return `${rel(d.file)}:${d.startLine}:${d.startColumn} TS${d.code} ${msg}`;
}

export async function runMcpServer(opts: McpOptions): Promise<void> {
  // Belt and braces: anything that thinks it is logging goes to stderr.
  console.log = console.error;

  // One loader per tsconfig: each call re-checks the disk (config re-parse +
  // mtime sweep) and rebuilds only on a real change, reusing the old program.
  const loaders = new Map<string, ProjectLoader>();
  const openProject = (project?: string) => {
    let key = "(default)";
    let tsconfigPath = opts.tsconfigPath;
    let rootDir = process.cwd();
    if (project) {
      const resolved = path.resolve(project);
      key = resolved;
      // A directory means "find the tsconfig there"; a file is the tsconfig.
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        tsconfigPath = undefined;
        rootDir = resolved;
      } else {
        tsconfigPath = resolved;
      }
    }
    let loader = loaders.get(key);
    if (!loader) {
      loader = createProjectLoader({ tsconfigPath, rootDir });
      loaders.set(key, loader);
    }
    return loader.load();
  };

  const projectParam = z
    .string()
    .optional()
    .describe(
      "tsconfig.json path (or a package directory) — use for a package inside a monorepo; default: the project the server was started in"
    );

  const server = new McpServer({ name: "whytype", version: opts.version });

  server.registerTool(
    "whytype_diagnostics",
    {
      title: "List TypeScript errors",
      description:
        "List current TypeScript errors in this project (or one file). Fast overview; " +
        "each entry gives file, line, column, and error code. Call whytype_explain on a " +
        "specific location to get the compiler's full reasoning chain.",
      inputSchema: {
        file: z.string().optional().describe("Limit to one file (absolute or relative path)"),
        project: projectParam,
        errorsOnly: z
          .boolean()
          .optional()
          .describe("default true; false also includes warnings/suggestions/messages"),
        offset: z.number().int().min(0).optional().describe("pagination offset into the list"),
        limit: z.number().int().min(1).max(500).optional().describe("max entries (default 100)"),
      },
    },
    async ({ file, project, errorsOnly, offset, limit }) => {
      try {
        const proj = openProject(project);
        const all = proj.analyze(file);
        const errors = all.filter((d) => d.category === "error");
        const diags = errorsOnly === false ? all : errors;
        const header = `${errors.length} error(s), ${all.length - errors.length} other — typescript ${proj.tsVersion} — ${rel(proj.configPath)}`;
        if (!diags.length) return text(`${header}\n${errorsOnly === false ? "Nothing to list." : "No TypeScript errors."}`);
        const from = offset ?? 0;
        const cap = limit ?? 100;
        const page = diags.slice(from, from + cap);
        const lines = [header, ...page.map(compactLine)];
        if (from > 0 || from + page.length < diags.length) {
          lines.push(
            `showing ${from + 1}–${from + page.length} of ${diags.length}` +
              (from + page.length < diags.length
                ? ` — call again with offset=${from + page.length}`
                : "")
          );
        }
        return text(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "whytype_explain",
    {
      title: "Explain the compiler's reasoning",
      description:
        "Explain WHY the TypeScript compiler reports an error or infers a type at a " +
        "location. Returns the compiler's own reasoning as a 'because' chain — nested " +
        "assignability failures, generic type-parameter inference bindings, and which " +
        "branch of a conditional type fired and why. Use this instead of guessing at " +
        "cryptic TS errors; line and column are 1-based, as printed by tsc and " +
        "whytype_diagnostics.",
      inputSchema: {
        file: z.string().describe("File path (absolute or relative)"),
        line: z.number().int().min(1).describe("1-based line"),
        column: z.number().int().min(1).describe("1-based column"),
        project: projectParam,
      },
    },
    async ({ file, line, column, project }) => {
      try {
        const res = openProject(project).explain({ file, position: { line, column } });
        // Focus on the queried line when it has diagnostics; else keep them all.
        const onLine = res.diagnostics.filter((d) => d.startLine === line);
        if (onLine.length) res.diagnostics = onLine;
        const sources = new Map<string, string>();
        for (const f of [res.file, ...res.diagnostics.map((d) => d.file)]) {
          if (f && !sources.has(f) && fs.existsSync(f)) sources.set(f, fs.readFileSync(f, "utf8"));
        }
        return text(renderExplain(res, sources).replaceAll(cwdSlash, ""));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "whytype_snippet",
    {
      title: "Explain a standalone snippet",
      description:
        "Explain TypeScript behavior for a standalone code snippet without touching the " +
        "project — paste code, get every error's reasoning chain (and, with line/column, " +
        "the inference or conditional-type trace at that position). Good for testing " +
        "hypotheses about type behavior. Compiled with strict: true.",
      inputSchema: {
        code: z.string().describe("TypeScript source to analyze"),
        line: z.number().int().min(1).optional().describe("1-based line to inspect"),
        column: z.number().int().min(1).optional().describe("1-based column to inspect"),
      },
    },
    async ({ code, line, column }) => {
      try {
        const parts: string[] = [];
        for (const d of snippetAnalyze(code)) {
          parts.push(renderDiagnostic(d, { sourceText: code, filePath: "snippet.ts" }));
        }
        if (line != null) {
          const lines = code.split("\n");
          if (line > lines.length) throw new Error(`line ${line} out of range (snippet has ${lines.length})`);
          const offset =
            lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + (column ?? 1) - 1;
          const ins = snippetInspect(code, offset);
          if (ins) parts.push(renderInspect(ins));
        }
        return text(parts.length ? parts.join("\n\n") : "No errors in the snippet.");
      } catch (e) {
        return fail(e);
      }
    }
  );

  await server.connect(new StdioServerTransport());
  // The open stdin stream keeps the process alive until the client hangs up.
}
