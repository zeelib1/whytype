import { useState } from "react";
import type {
  ConditionalStep,
  ConditionalTrace,
  DiagnosticInfo,
  ExplainNode,
  InspectResult,
} from "../../engine/types";
import { diffTypes, parseMismatch } from "../typeDiff";
import { DiffCode, TypeDiffBlock } from "./TypeDiff";
import { DistributionDiagram } from "./DistributionDiagram";

const VERDICT_LABEL: Record<ConditionalStep["verdict"], string> = {
  true: "true branch",
  false: "false branch",
  both: "both branches — any",
  distributes: "distributes over the union",
  never: "never — empty union, nothing to check",
  unknown: "can't trace this one",
};

/** Diffs below this token overlap are noise (bare alias names, etc.). */
const DIFF_GATE = 0.3;

function StepResolved({ step }: { step: ConditionalStep }) {
  const diff =
    step.checkResolved && step.extendsResolved
      ? diffTypes(step.checkResolved, step.extendsResolved)
      : null;
  if (!step.checkResolved || !step.extendsResolved) return null;
  return (
    <p className="step-resolved">
      {diff && diff.similarity >= DIFF_GATE ? (
        <DiffCode tokens={diff.a} cls="t-actual" />
      ) : (
        <code className="t-actual">{step.checkResolved}</code>
      )}
      <span className="step-kw"> extends </span>
      {diff && diff.similarity >= DIFF_GATE ? (
        <DiffCode tokens={diff.b} cls="t-expected" />
      ) : (
        <code className="t-expected">{step.extendsResolved}</code>
      )}
      <span className="step-kw"> ?</span>
    </p>
  );
}

function ConditionalSection({ trace }: { trace: ConditionalTrace }) {
  return (
    <article className="explain-body" key={trace.referenceText}>
      <h2 className="ask">Which branch fired?</h2>
      <div className="chain-node">
        <div className="chain-card">
          <p className="inspect-type">
            <code className="t-path">{trace.referenceText}</code>
            <span className="binding-walrus"> = </span>
            <code className="t-expected">{trace.result}</code>
          </p>
        </div>
      </div>
      {trace.steps.map((step, i) => (
        <div className="chain-node" key={i} style={{ animationDelay: `${(i + 1) * 120}ms` }}>
          <div className="because">{i === 0 ? "because the compiler asked" : "so it asked next"}</div>
          <div className="chain-card">
            <p className="step-declared">{step.checkText} ?</p>
            <StepResolved step={step} />
            <p className={`verdict verdict-${step.verdict}`}>
              → {VERDICT_LABEL[step.verdict]}
              {step.branchTakenText && !step.members ? (
                <>
                  {": "}
                  <code className="t-path">{step.branchTakenText}</code>
                </>
              ) : null}
            </p>
            {step.members && (
              <DistributionDiagram members={step.members} result={trace.result} />
            )}
          </div>
        </div>
      ))}
    </article>
  );
}

/**
 * Renders one chain message with semantic color: in "X is not assignable to Y"
 * shaped messages the first quoted type is the ACTUAL (warm), the second the
 * EXPECTED (cool). Property-path messages get a neutral emphasis instead.
 */
function Message({ text }: { text: string }) {
  const parts = text.split(/('[^']*')/g);
  const isMismatch = /not assignable|not comparable|does not satisfy/.test(text);
  let quoteIndex = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (!part.startsWith("'")) return <span key={i}>{part}</span>;
        const cls = isMismatch
          ? quoteIndex++ === 0
            ? "t-actual"
            : "t-expected"
          : "t-path";
        return (
          <code key={i} className={cls}>
            {part.slice(1, -1)}
          </code>
        );
      })}
    </>
  );
}

function ChainCard({ node }: { node: ExplainNode }) {
  const [open, setOpen] = useState(false);
  const pair = parseMismatch(node.message);
  const diff = pair ? diffTypes(pair.actual, pair.expected) : null;
  const comparable = diff !== null && diff.similarity >= DIFF_GATE;
  return (
    <div className="chain-card">
      <span className="chain-code">TS{node.code}</span>
      <p className="chain-message">
        <Message text={node.message} />
      </p>
      {comparable && (
        <button className="compare-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "hide" : "compare"}
        </button>
      )}
      {comparable && open && <TypeDiffBlock diff={diff} />}
    </div>
  );
}

function Chain({
  node,
  depth,
  siblingIndex = 0,
  siblingCount = 1,
}: {
  node: ExplainNode;
  depth: number;
  siblingIndex?: number;
  siblingCount?: number;
}) {
  return (
    <div className="chain-node" style={{ animationDelay: `${depth * 120}ms` }}>
      {depth > 0 && (
        <div className="because">
          because{siblingCount > 1 ? ` (${siblingIndex + 1} of ${siblingCount})` : ""}
        </div>
      )}
      <ChainCard node={node} />
      {node.children.map((child, i) => (
        <Chain
          key={i}
          node={child}
          depth={depth + 1}
          siblingIndex={i}
          siblingCount={node.children.length}
        />
      ))}
    </div>
  );
}

function chainDepth(node: ExplainNode): number {
  return 1 + node.children.reduce((max, c) => Math.max(max, chainDepth(c)), 0);
}

function AgentView({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <article className="explain-body">
      <div className="agent-bar">
        <span className="agent-note">what an agent receives from whytype_explain</span>
        <button
          className="compare-btn agent-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(markdown);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* clipboard denied — leave the label alone */
            }
          }}
        >
          {copied ? "copied" : "copy as markdown"}
        </button>
      </div>
      <pre className="agent-md">{markdown}</pre>
      <p className="agent-foot">
        The same reasoning ships as an MCP server: <code>npx whytype mcp</code> ·{" "}
        <a href="/docs/#agents">docs</a>
      </p>
    </article>
  );
}

export function ExplainPanel({
  diagnostics,
  selected,
  inspection,
  onSelect,
  onRevealRange,
  onHoverDiagnostic,
  agentMarkdown,
}: {
  diagnostics: DiagnosticInfo[];
  selected: DiagnosticInfo | null;
  inspection: InspectResult | null;
  onSelect: (d: DiagnosticInfo) => void;
  onRevealRange: (start: number, length: number) => void;
  onHoverDiagnostic: (d: DiagnosticInfo | null) => void;
  agentMarkdown: string | null;
}) {
  const [view, setView] = useState<"human" | "agent">("human");
  return (
    <div className="explain">
      {(diagnostics.length > 0 || agentMarkdown) && (
        <nav className="diag-list" aria-label="Errors">
          {diagnostics.map((d) => {
            const depth = chainDepth(d.chain);
            return (
              <button
                key={`${d.code}-${d.start}`}
                className={`diag-tab ${d === selected ? "is-active" : ""}`}
                onClick={() => onSelect(d)}
              >
                <i className={`diag-dot cat-${d.category}`} />
                <span className="diag-tab-code">TS{d.code}</span> line {d.startLine}
                {depth >= 3 && <span className="diag-depth"> ×{depth}</span>}
              </button>
            );
          })}
          {agentMarkdown && (
            <button
              className={`diag-tab view-toggle ${view === "agent" ? "is-agent" : ""}`}
              title="the markdown whytype_explain returns for this"
              onClick={() => setView((v) => (v === "agent" ? "human" : "agent"))}
            >
              {view === "agent" ? "reasoning" : "agent view"}
            </button>
          )}
        </nav>
      )}

      {view === "agent" && agentMarkdown ? (
        <AgentView markdown={agentMarkdown} />
      ) : selected ? (
        <article
          className="explain-body"
          key={`${selected.code}-${selected.start}`}
          onMouseEnter={() => onHoverDiagnostic(selected)}
          onMouseLeave={() => onHoverDiagnostic(null)}
        >
          <h2 className="ask">Why does this fail?</h2>
          <Chain node={selected.chain} depth={0} />
          {selected.related.length > 0 && (
            <div className="related">
              {selected.related.map((r, i) =>
                r.start != null ? (
                  <button
                    key={i}
                    className="related-chip"
                    onClick={() => onRevealRange(r.start!, r.length ?? 1)}
                  >
                    <Message text={r.message} />
                    <span className="related-jump"> ↗</span>
                  </button>
                ) : (
                  <p key={i} className="related-item">
                    <Message text={r.message} />
                  </p>
                )
              )}
            </div>
          )}
          <div className="legend">
            <span>
              <i className="swatch swatch-actual" /> what you gave it
            </span>
            <span>
              <i className="swatch swatch-expected" /> what it expects
            </span>
          </div>
        </article>
      ) : inspection?.conditional ? (
        <ConditionalSection trace={inspection.conditional} />
      ) : inspection ? (
        <article className="explain-body" key={inspection.exprText}>
          <h2 className="ask">What is this?</h2>
          <div className="chain-card">
            <p className="inspect-expr">
              <code className="t-path">{inspection.exprText}</code>
            </p>
            <p className="inspect-type">
              : <code className="t-expected">{inspection.typeString}</code>
            </p>
          </div>
          {inspection.call && inspection.call.bindings.length > 0 && (
            <>
              <div className="because">where the compiler inferred</div>
              <div className="chain-card">
                <p className="call-head">
                  <code className="t-path">{inspection.call.callText}</code>
                </p>
                {inspection.call.bindings.map((b, i) => (
                  <p
                    className="binding"
                    key={b.name}
                    style={{ animationDelay: `${i * 120}ms` }}
                  >
                    <code className="t-param">{b.name}</code>
                    <span className="binding-walrus"> := </span>
                    <code className="t-expected">{b.type ?? "unresolved"}</code>
                  </p>
                ))}
                <p className="binding binding-return">
                  <span className="binding-walrus">→ returns </span>
                  <code className="t-expected">{inspection.call.returnType}</code>
                </p>
                <p className="binding-signature">{inspection.call.signature}</p>
              </div>
            </>
          )}
        </article>
      ) : (
        <article className="explain-body explain-empty">
          <h2 className="ask">Why is this type what it is?</h2>
          <p>
            Click an error in the editor to see the compiler's reasoning, or place the
            cursor in any expression to inspect its type.
          </p>
          <p className="empty-agents">
            Agents read this too — the same reasoning ships as an MCP server.{" "}
            <code>npx whytype mcp</code> · <a href="/docs/#agents">docs</a>
          </p>
        </article>
      )}
    </div>
  );
}
