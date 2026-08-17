/**
 * The fan-out: when a conditional distributes, each union member walks the
 * branches alone and the results union back together. Members left, verdict +
 * contribution right, checker ground truth at the bottom.
 */
import type { ConditionalStep } from "../../engine/types";

type Members = NonNullable<ConditionalStep["members"]>;

export function DistributionDiagram({ members, result }: { members: Members; result: string }) {
  return (
    <div className="dist">
      {members.map((m, i) => (
        <p className="dist-row" key={i} style={{ animationDelay: `${i * 100}ms` }}>
          <code className="t-actual">{m.text}</code>
          <span className="dist-rail" aria-hidden="true" />
          <span className="dist-branch">
            <span className={`verdict-${m.verdict}`}>{m.verdict} branch</span>
            {m.result && (
              <>
                <span className="dist-arrow"> → </span>
                <code className="t-expected">{m.result}</code>
              </>
            )}
          </span>
        </p>
      ))}
      <p className="dist-result" style={{ animationDelay: `${members.length * 100}ms` }}>
        <span className="dist-eq">unioned back = </span>
        <code className="t-expected">{result}</code>
      </p>
    </div>
  );
}
