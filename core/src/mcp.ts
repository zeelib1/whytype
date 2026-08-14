/**
 * MCP server (`whytype mcp`): the because-chain engine over stdio, for
 * agents. Loaded lazily by cli.ts so plain CLI runs never touch the SDK.
 * Stdout is the protocol — nothing may print to it.
 */
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createProject,
  renderDiagnostic,
  renderExplain,
  renderInspect,
  snippetAnalyze,
  snippetInspect,
  type DiagnosticInfo,
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

  // A fresh program per call — agents edit files between calls, and the
  // program is immutable once built.
  const openProject = () =>
    createProject({ tsconfigPath: opts.tsconfigPath, rootDir: process.cwd() });

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
      },
    },
    async ({ file }) => {
      try {
        const diags = openProject().analyze(file);
        if (!diags.length) return text("No TypeScript errors.");
        const cap = 100;
        const lines = diags.slice(0, cap).map(compactLine);
        if (diags.length > cap) lines.push(`… ${diags.length - cap} more (truncated)`);
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
      },
    },
    async ({ file, line, column }) => {
      try {
        const project = openProject();
        const res = project.explain({ file, position: { line, column } });
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
