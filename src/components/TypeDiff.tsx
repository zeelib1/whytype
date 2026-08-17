/**
 * "Dim the agreement, light the disagreement": renders a token stream where
 * tokens shared with the other side fade back and differing tokens keep full
 * semantic color. No red/green blocks — the warm/cool pair stays the language.
 */
import type { DiffToken, TypeDiff } from "../typeDiff";

export function DiffCode({ tokens, cls }: { tokens: DiffToken[]; cls: string }) {
  return (
    <code className={`${cls} td`}>
      {tokens.map((t, i) => (
        <span key={i}>
          <span className={t.changed ? "td-hot" : "td-dim"}>{t.text}</span>
          {t.ws}
        </span>
      ))}
    </code>
  );
}

/** The expanded compare block inside a mismatch card: actual above, expected below. */
export function TypeDiffBlock({ diff }: { diff: TypeDiff }) {
  return (
    <div className="type-diff">
      <p className="type-diff-row">
        <span className="type-diff-label">you gave</span>
        <DiffCode tokens={diff.a} cls="t-actual" />
      </p>
      <p className="type-diff-row">
        <span className="type-diff-label">it expects</span>
        <DiffCode tokens={diff.b} cls="t-expected" />
      </p>
    </div>
  );
}
