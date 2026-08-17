/**
 * Wire types shared between the UI and the engine worker.
 * This module must stay dependency-free — it is imported on both sides.
 */

/** One node of the compiler's elaboration ("because") chain. */
export interface ExplainNode {
  code: number;
  message: string;
  children: ExplainNode[];
}

export interface RelatedInfo {
  code: number;
  message: string;
  /** Offsets into the analyzed file, when the related site is in it. */
  start?: number;
  length?: number;
  /** Path of the related site's file (project mode; absent in the playground). */
  file?: string;
  /** 1-based position in `file` (project mode). */
  line?: number;
  column?: number;
}

export interface DiagnosticInfo {
  code: number;
  category: "error" | "warning" | "suggestion" | "message";
  start: number;
  length: number;
  /** 1-based, for Monaco markers. */
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  chain: ExplainNode;
  related: RelatedInfo[];
  /** Path of the diagnosed file (project mode; absent in the playground). */
  file?: string;
}

/** Inferred binding for one type parameter at a call site. */
export interface TypeParamBinding {
  name: string;
  type: string | null;
}

export interface CallInfo {
  callText: string;
  signature: string;
  returnType: string;
  bindings: TypeParamBinding[];
}

/** One `T extends U ? X : Y` decision, resolved against the actual type args. */
export interface ConditionalStep {
  /** Declared source text, e.g. "T extends string". */
  checkText: string;
  /** The check operand after substitution, e.g. "42" — null if unresolvable. */
  checkResolved: string | null;
  /** The extends target after substitution, e.g. "string" — null if unresolvable. */
  extendsResolved: string | null;
  verdict: "true" | "false" | "both" | "distributes" | "never" | "unknown";
  /** Per-member verdicts when a union distributes. `result` is what the whole
   *  alias resolves to for that member alone (top-level distribution only). */
  members?: { text: string; verdict: "true" | "false"; result?: string }[];
  /** Declared text of the branch the verdict selects (absent for both/distributes/unknown). */
  branchTakenText?: string;
}

export interface ConditionalTrace {
  /** The instantiation being traced, e.g. `IsString<42>`. */
  referenceText: string;
  steps: ConditionalStep[];
  /** Ground truth: what the checker says the whole thing resolves to. */
  result: string;
}

export interface InspectResult {
  exprText: string;
  typeString: string;
  call?: CallInfo;
  conditional?: ConditionalTrace;
  /** Path of the inspected file (project mode; absent in the playground). */
  file?: string;
}

/** One-shot answer for "explain this location": diagnostics plus inspection. */
export interface ExplainResult {
  file: string;
  tsVersion: string;
  diagnostics: DiagnosticInfo[];
  inspect: InspectResult | null;
}

export type EngineRequest =
  | { id: number; kind: "analyze"; code: string }
  | { id: number; kind: "inspect"; code: string; position: number };

export type EngineResponse =
  | { id: 0; kind: "ready"; tsVersion: string }
  | { id: number; kind: "analyze"; diagnostics: DiagnosticInfo[] }
  | { id: number; kind: "inspect"; result: InspectResult | null }
  | { id: number; kind: "error"; message: string };
