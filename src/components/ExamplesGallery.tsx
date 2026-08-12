import { EXAMPLES, type Example } from "../examples";

export function ExamplesGallery({ onPick }: { onPick: (example: Example) => void }) {
  return (
    <div className="explain">
      <article className="explain-body">
        <h2 className="ask">Famous confusions, explained</h2>
        <div className="gallery">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.slug}
              className="example-card"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => onPick(ex)}
            >
              <span className="example-title">{ex.title}</span>
              <span className="example-note">{ex.note}</span>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}
