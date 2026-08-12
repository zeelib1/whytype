import type {
  ConditionalStep,
  ConditionalTrace,
  DiagnosticInfo,
  ExplainNode,
  InspectResult,
} from "../../engine/types";

const VERDICT_LABEL: Record<ConditionalStep["verdict"], string> = {
  true: "true branch",
  false: "false branch",
  both: "both branches — any",
  distributes: "distributes over the union",
  never: "never — empty union, nothing to check",
  unknown: "can't trace this one",
};

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
            {step.checkResolved && step.extendsResolved && (
              <p className="step-resolved">
                <code className="t-actual">{step.checkResolved}</code>
                <span className="step-kw"> extends </span>
                <code className="t-expected">{step.extendsResolved}</code>
                <span className="step-kw"> ?</span>
              </p>
            )}
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
              <div className="members">
                {step.members.map((m, j) => (
                  <p className="member" key={j} style={{ animationDelay: `${j * 100}ms` }}>
                    <code className="t-actual">{m.text}</code>
                    <span className={`member-verdict verdict-${m.verdict}`}>
                      → {m.verdict} branch
                    </span>
                  </p>
                ))}
              </div>
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

function Chain({ node, depth }: { node: ExplainNode; depth: number }) {
  return (
    <div className="chain-node" style={{ animationDelay: `${depth * 120}ms` }}>
      {depth > 0 && <div className="because">because</div>}
      <div className="chain-card">
        <span className="chain-code">TS{node.code}</span>
        <p className="chain-message">
          <Message text={node.message} />
        </p>
      </div>
      {node.children.map((child, i) => (
        <Chain key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ExplainPanel({
  diagnostics,
  selected,
  inspection,
  onSelect,
}: {
  diagnostics: DiagnosticInfo[];
  selected: DiagnosticInfo | null;
  inspection: InspectResult | null;
  onSelect: (d: DiagnosticInfo) => void;
}) {
  return (
    <div className="explain">
      {diagnostics.length > 0 && (
        <nav className="diag-list" aria-label="Errors">
          {diagnostics.map((d, i) => (
            <button
              key={`${d.code}-${d.start}`}
              className={`diag-tab ${d === selected ? "is-active" : ""}`}
              onClick={() => onSelect(d)}
            >
              <span className="diag-tab-code">TS{d.code}</span> line {d.startLine}
            </button>
          ))}
        </nav>
      )}

      {selected ? (
        <article className="explain-body" key={`${selected.code}-${selected.start}`}>
          <h2 className="ask">Why does this fail?</h2>
          <Chain node={selected.chain} depth={0} />
          {selected.related.length > 0 && (
            <div className="related">
              {selected.related.map((r, i) => (
                <p key={i} className="related-item">
                  <Message text={r.message} />
                </p>
              ))}
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
        </article>
      )}
    </div>
  );
}
