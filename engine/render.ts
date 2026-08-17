/**
 * Markdown serialization of the wire types — the single text rendering the
 * CLI, the MCP server, and (eventually) the extension share. Pure string
 * formatting: no compiler import, no Node APIs, safe in the neutral bundle.
 * Output is tuned for LLM consumption: line-addressed, no ANSI.
 */
import type {
  ConditionalStep,
  DiagnosticInfo,
  ExplainNode,
  ExplainResult,
  InspectResult,
} from "./types";

export interface RenderOptions {
  /** Full text of the diagnosed file — enables the code frame. */
  sourceText?: string;
  /** Display path (e.g. relativized by the CLI); falls back to the wire `file`. */
  filePath?: string;
  /** Lines of context around the marked line in the code frame. */
  contextLines?: number;
}

function codeFrame(
  text: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  context: number
): string {
  const lines = text.split("\n");
  const first = Math.max(1, startLine - context);
  const last = Math.min(lines.length, endLine + context);
  const width = String(last).length;
  const out: string[] = [];
  for (let n = first; n <= last; n++) {
    const marked = n >= startLine && n <= endLine;
    out.push(`${marked ? ">" : " "} ${String(n).padStart(width)} | ${lines[n - 1] ?? ""}`);
    if (n === startLine) {
      const from = startColumn - 1;
      const to = n === endLine ? Math.max(endColumn - 1, from + 1) : (lines[n - 1] ?? "").length;
      out.push(`  ${" ".repeat(width)} | ${" ".repeat(from)}${"^".repeat(Math.max(1, to - from))}`);
    }
  }
  return "```\n" + out.join("\n") + "\n```";
}

function chainBullets(node: ExplainNode, depth: number): string[] {
  const line = `${"  ".repeat(depth)}- TS${node.code} ${node.message}`;
  return [line, ...node.children.flatMap((c) => chainBullets(c, depth + 1))];
}

export function renderDiagnostic(d: DiagnosticInfo, opts: RenderOptions = {}): string {
  const path = opts.filePath ?? d.file;
  const where = path ? ` — ${path}:${d.startLine}:${d.startColumn}` : ` — ${d.startLine}:${d.startColumn}`;
  const parts: string[] = [`## ${d.category} TS${d.code}${where}`, d.chain.message];
  if (opts.sourceText) {
    parts.push(
      codeFrame(opts.sourceText, d.startLine, d.startColumn, d.endLine, d.endColumn, opts.contextLines ?? 2)
    );
  }
  if (d.chain.children.length) {
    parts.push("Because:\n" + d.chain.children.flatMap((c) => chainBullets(c, 0)).join("\n"));
  }
  if (d.related.length) {
    const rel = d.related.map((r) => {
      const at = r.file ? `${r.file}:${r.line}:${r.column} — ` : "";
      return `- ${at}${r.message} (TS${r.code})`;
    });
    parts.push("Related:\n" + rel.join("\n"));
  }
  return parts.join("\n\n");
}

const VERDICT: Record<ConditionalStep["verdict"], string> = {
  true: "**true**",
  false: "**false**",
  both: "**both** (`any` takes both branches; result is their union)",
  never: "**never** (distributing over the empty union)",
  distributes: "**distributes** over the union:",
  unknown: "**unknown**",
};

export function renderInspect(r: InspectResult, opts: RenderOptions = {}): string {
  const parts: string[] = [`**\`${r.exprText}\`** : \`${r.typeString}\``];
  if (r.call) {
    const lines = [
      `Call: \`${r.call.callText}\``,
      `- signature: \`${r.call.signature}\``,
      `- returns: \`${r.call.returnType}\``,
    ];
    if (r.call.bindings.length) {
      const bound = r.call.bindings
        .map((b) => `\`${b.name} = ${b.type ?? "(not inferred)"}\``)
        .join(", ");
      lines.push(`- inferred type arguments: ${bound}`);
    }
    parts.push(lines.join("\n"));
  }
  if (r.conditional) {
    const lines = [`Conditional trace: \`${r.conditional.referenceText}\``];
    r.conditional.steps.forEach((s, i) => {
      const resolved =
        s.checkResolved != null && s.extendsResolved != null
          ? ` — with \`${s.checkResolved} extends ${s.extendsResolved}\``
          : "";
      const branch = s.branchTakenText ? ` → takes \`${s.branchTakenText}\`` : "";
      lines.push(`${i + 1}. \`${s.checkText}\`${resolved} → ${VERDICT[s.verdict]}${branch}`);
      for (const m of s.members ?? []) {
        const contributes = m.result ? ` → \`${m.result}\`` : "";
        lines.push(`   - \`${m.text}\` → ${m.verdict}${contributes}`);
      }
    });
    lines.push(`Result: \`${r.conditional.result}\``);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

/** Composes diagnostics + inspection for the one-shot explain op. */
export function renderExplain(res: ExplainResult, sources?: Map<string, string>): string {
  const parts: string[] = [];
  if (!res.diagnostics.length) parts.push(`No errors in ${res.file}.`);
  for (const d of res.diagnostics) {
    parts.push(renderDiagnostic(d, { sourceText: sources?.get(d.file ?? res.file) }));
  }
  if (res.inspect) parts.push(renderInspect(res.inspect, {}));
  parts.push(`_typescript ${res.tsVersion}_`);
  return parts.join("\n\n");
}
