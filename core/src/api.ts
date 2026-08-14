/**
 * Thin adapter between the CLI/MCP entries and the engine — the one module
 * that knows engine names and how to feed snippet mode its lib files.
 */
import fs from "node:fs";
import path from "node:path";
import { typescriptEntryPath } from "./ts-shim";
import {
  analyze as analyzeSnippet,
  initEngine,
  inspect as inspectSnippet,
} from "../../engine/analyze";

export { createProject } from "../../engine/project";
export type { ExplainQuery, Position, Project } from "../../engine/project";
export { renderDiagnostic, renderExplain, renderInspect } from "../../engine/render";
export type { DiagnosticInfo, ExplainResult, InspectResult } from "../../engine/types";
export { tsVersion } from "../../engine/analyze";

/** A user-facing failure with a chosen exit code (2 = usage/environment). */
export class CliError extends Error {
  constructor(
    message: string,
    public exitCode: number = 2
  ) {
    super(message);
  }
}

let snippetReady = false;

/** Loads default libs from the resolved typescript install, once. */
function ensureSnippetEngine(): void {
  if (snippetReady) return;
  const libDir = path.dirname(typescriptEntryPath);
  const libs = new Map<string, string>();
  for (const f of fs.readdirSync(libDir)) {
    if (f.startsWith("lib") && f.endsWith(".d.ts")) {
      libs.set("/lib/" + f, fs.readFileSync(path.join(libDir, f), "utf8"));
    }
  }
  if (!libs.size) throw new CliError(`no lib.*.d.ts found next to ${typescriptEntryPath}`);
  initEngine(libs);
  snippetReady = true;
}

export function snippetAnalyze(code: string) {
  ensureSnippetEngine();
  return analyzeSnippet(code);
}

export function snippetInspect(code: string, position: number) {
  ensureSnippetEngine();
  return inspectSnippet(code, position);
}
