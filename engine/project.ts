/**
 * Real-project mode: the same extraction core over an actual ts.Program built
 * from the consumer's tsconfig. Node-only (uses ts.sys) — exported via the
 * `whytype/node` subpath, never imported by index.ts or the worker.
 */
import ts from "typescript-strada";
import {
  analyzeSourceFile,
  inspectSourceFile,
  type ProbeCompiler,
} from "./analyze";
import { renderExplain } from "./render";
import type { DiagnosticInfo, ExplainResult, InspectResult } from "./types";

export type Position = number | { line: number; column: number };

export interface ProjectOptions {
  /** Explicit tsconfig path; wins over rootDir discovery. */
  tsconfigPath?: string;
  /** Directory to search upward from for tsconfig.json (default: cwd). */
  rootDir?: string;
}

export interface ExplainQuery {
  file: string;
  position?: Position;
}

export interface Project {
  tsVersion: string;
  configPath: string;
  /** The project's own root files (not libs, not node_modules). */
  fileNames: string[];
  /** Diagnostics for one file, or for every project file plus config/options ones. */
  analyze(file?: string): DiagnosticInfo[];
  inspect(file: string, position: Position): InspectResult | null;
  /** One-shot: diagnostics + inspection (auto-anchored to the first error). */
  explain(q: ExplainQuery): ExplainResult;
  /** `explain` rendered as markdown with code frames. */
  explainMarkdown(q: ExplainQuery): string;
}

export interface ProjectLoader {
  /** Cached Project when nothing changed on disk; otherwise rebuilds, reusing the old ts.Program. */
  load(): Project;
}

function findConfigPath(opts: ProjectOptions): string {
  const cwd = opts.rootDir ?? ts.sys.getCurrentDirectory();
  const configPath =
    opts.tsconfigPath ?? ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath || !ts.sys.fileExists(configPath)) {
    throw new Error(
      opts.tsconfigPath
        ? `tsconfig not found: ${opts.tsconfigPath}`
        : `no tsconfig.json found upward from ${cwd}`
    );
  }
  return configPath;
}

function parseConfig(configPath: string): ts.ParsedCommandLine {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, { noEmit: true }, host);
  if (!parsed) throw new Error(`failed to parse ${configPath}`);
  return parsed;
}

export function createProject(opts: ProjectOptions = {}): Project {
  const configPath = findConfigPath(opts);
  return buildProject(configPath, parseConfig(configPath), opts).project;
}

/**
 * A Project cache for long-lived hosts (the MCP server): each load() re-parses
 * the config (re-running include globs, so added/removed files are seen) and
 * compares options + file list + mtimes; only a real change rebuilds, and the
 * rebuild hands TS the previous program for structural reuse.
 */
export function createProjectLoader(opts: ProjectOptions = {}): ProjectLoader {
  let snap:
    | {
        configPath: string;
        optionsKey: string;
        filesKey: string;
        mtimes: Map<string, number>;
        program: ts.Program;
        project: Project;
      }
    | undefined;
  const mtime = (f: string) => ts.sys.getModifiedTime?.(f)?.getTime() ?? -1;

  return {
    load() {
      const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env;
      const noCache = env?.WHYTYPE_MCP_NO_CACHE === "1";
      const configPath =
        snap && ts.sys.fileExists(snap.configPath) ? snap.configPath : findConfigPath(opts);
      const parsed = parseConfig(configPath);
      const optionsKey = JSON.stringify(parsed.options);
      const filesKey = parsed.fileNames.join("\n");
      const mtimes = new Map([configPath, ...parsed.fileNames].map((f) => [f, mtime(f)]));
      if (
        !noCache &&
        snap &&
        snap.configPath === configPath &&
        snap.optionsKey === optionsKey &&
        snap.filesKey === filesKey &&
        [...mtimes].every(([f, t]) => snap!.mtimes.get(f) === t)
      ) {
        return snap.project;
      }
      const built = buildProject(configPath, parsed, opts, noCache ? undefined : snap?.program);
      snap = { configPath, optionsKey, filesKey, mtimes, ...built };
      return built.project;
    },
  };
}

function buildProject(
  configPath: string,
  parsed: ts.ParsedCommandLine,
  opts: ProjectOptions,
  oldProgram?: ts.Program
): { project: Project; program: ts.Program } {
  const cwd = opts.rootDir ?? ts.sys.getCurrentDirectory();
  // setParentNodes MUST be true: the inspectors walk .parent chains.
  const compilerHost = ts.createCompilerHost(parsed.options, true);
  const program = ts.createProgram(parsed.fileNames, parsed.options, compilerHost, oldProgram);
  const caseSensitive = compilerHost.useCaseSensitiveFileNames();

  const canonical = (p: string) => {
    const slashed = p.replace(/\\/g, "/");
    return caseSensitive ? slashed : slashed.toLowerCase();
  };
  // path.resolve without node:path — this module must stay import-free of Node.
  const resolvePath = (p: string, base: string) => {
    const slashed = p.replace(/\\/g, "/");
    const isAbs = /^([a-zA-Z]:)?\//.test(slashed);
    const joined = isAbs ? slashed : base.replace(/\\/g, "/") + "/" + slashed;
    const parts: string[] = [];
    for (const seg of joined.split("/")) {
      if (seg === "." || (seg === "" && parts.length)) continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/") || "/";
  };
  // Relative inputs may be given from the caller's cwd or the project root.
  const resolveBases = [ts.sys.getCurrentDirectory(), cwd];

  function sourceFor(file: string): ts.SourceFile {
    const wanted = resolveBases.map((base) => canonical(resolvePath(file, base)));
    for (const sf of program.getSourceFiles()) {
      if (wanted.includes(canonical(sf.fileName))) return sf;
    }
    const base = file.replace(/\\/g, "/").split("/").pop() ?? file;
    const near = program
      .getSourceFiles()
      .filter((sf) => sf.fileName.endsWith("/" + base))
      .map((sf) => sf.fileName)
      .slice(0, 5);
    throw new Error(
      `file is not part of the project: ${file}` +
        (near.length ? ` — did you mean: ${near.join(", ")}?` : "")
    );
  }

  function toOffset(source: ts.SourceFile, position: Position): number {
    if (typeof position === "number") return position;
    const { line, column } = position;
    const lineCount = source.getLineStarts().length;
    if (line < 1 || line > lineCount) {
      throw new Error(`line ${line} out of range (1-${lineCount}) in ${source.fileName}`);
    }
    return source.getPositionOfLineAndCharacter(line - 1, Math.max(0, column - 1));
  }

  /** Config/options/global diagnostics, surfaced as file-less entries. */
  function projectLevelDiagnostics(): DiagnosticInfo[] {
    const raw = [
      ...parsed!.errors,
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
    ];
    return raw.map((d) => ({
      code: d.code,
      category: (["warning", "error", "suggestion", "message"] as const)[d.category],
      start: d.start ?? 0,
      length: d.length ?? 1,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
      chain: {
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        children: [],
      },
      related: [],
    }));
  }

  function ownSourceFiles(): ts.SourceFile[] {
    return program
      .getSourceFiles()
      .filter((sf) => !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf));
  }

  /** Probe program shadows just the inspected file; oldProgram keeps it cheap. */
  function probeCompilerFor(source: ts.SourceFile): ProbeCompiler {
    return (fullText) => {
      const probeHost = ts.createCompilerHost(parsed!.options, true);
      const origGet = probeHost.getSourceFile.bind(probeHost);
      const origRead = probeHost.readFile.bind(probeHost);
      probeHost.getSourceFile = (name, languageVersion, ...rest) =>
        canonical(name) === canonical(source.fileName)
          ? ts.createSourceFile(name, fullText, languageVersion, true)
          : origGet(name, languageVersion, ...rest);
      probeHost.readFile = (name) =>
        canonical(name) === canonical(source.fileName) ? fullText : origRead(name);
      const probed = ts.createProgram(parsed!.fileNames, parsed!.options, probeHost, program);
      const probedSource = probed.getSourceFile(source.fileName);
      if (!probedSource) throw new Error(`probe rebuild lost ${source.fileName}`);
      return { source: probedSource, checker: probed.getTypeChecker() };
    };
  }

  const project: Project = {
    tsVersion: ts.version,
    configPath,
    fileNames: parsed.fileNames.slice(),

    analyze(file) {
      if (file) {
        const sf = sourceFor(file);
        return analyzeSourceFile(program, sf, { filePath: sf.fileName });
      }
      return [
        ...projectLevelDiagnostics(),
        ...ownSourceFiles().flatMap((sf) =>
          analyzeSourceFile(program, sf, { filePath: sf.fileName })
        ),
      ];
    },

    inspect(file, position) {
      const sf = sourceFor(file);
      const result = inspectSourceFile(
        sf,
        program.getTypeChecker(),
        toOffset(sf, position),
        probeCompilerFor(sf)
      );
      if (result) result.file = sf.fileName;
      return result;
    },

    explain(q) {
      const sf = sourceFor(q.file);
      const diagnostics = analyzeSourceFile(program, sf, { filePath: sf.fileName });
      let inspect: InspectResult | null = null;
      if (q.position != null) {
        inspect = project.inspect(q.file, q.position);
      } else if (diagnostics.length) {
        inspect = project.inspect(q.file, diagnostics[0].start);
      }
      return { file: sf.fileName, tsVersion: ts.version, diagnostics, inspect };
    },

    explainMarkdown(q) {
      const res = project.explain(q);
      const sources = new Map<string, string>();
      const main = program.getSourceFile(res.file);
      if (main) sources.set(res.file, main.text);
      return renderExplain(res, sources);
    },
  };
  return { project, program };
}
