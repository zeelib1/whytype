/**
 * Static HTML for the "Why?" panel — the playground's because-chain visual
 * language, adapted to live inside a VS Code webview. No scripts, CSP locked
 * down; VS Code theme variables carry the chrome, TypeLens's semantic pair
 * (expected = cool sky, actual = warm apricot) stays fixed because it IS the
 * product.
 */
import type { ChainNode } from "./parseChain";

export interface RelatedItem {
  message: string;
  location: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Color quoted type names: in mismatch-shaped messages the first quote is the
 * ACTUAL type, the second the EXPECTED; elsewhere they are property paths. */
function markup(text: string): string {
  const isMismatch = /not assignable|not comparable|does not satisfy/.test(text);
  let quoteIndex = 0;
  return text
    .split(/('[^']*')/g)
    .map((part) => {
      if (!part.startsWith("'")) return esc(part);
      const cls = isMismatch ? (quoteIndex++ === 0 ? "t-actual" : "t-expected") : "t-path";
      return `<code class="${cls}">${esc(part.slice(1, -1))}</code>`;
    })
    .join("");
}

function chainHtml(node: ChainNode, depth: number): string {
  const because = depth > 0 ? `<div class="because">because</div>` : "";
  const children = node.children.map((c) => chainHtml(c, depth + 1)).join("");
  return `${because}<div class="card"><p>${markup(node.message)}</p></div>${children}`;
}

export function renderWhyHtml(opts: {
  code: string | number | undefined;
  chain: ChainNode;
  related: RelatedItem[];
  file: string;
  line: number;
}): string {
  const related = opts.related.length
    ? `<div class="related">${opts.related
        .map((r) => `<p>${markup(r.message)} <span class="loc">${esc(r.location)}</span></p>`)
        .join("")}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  :root {
    --expected: #5cc8ff;
    --actual: #ffa366;
    --muted: var(--vscode-descriptionForeground, #77828f);
    --line: var(--vscode-widget-border, #232b3660);
  }
  body {
    font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
    font-size: 13px;
    line-height: 1.6;
    color: var(--vscode-foreground, #dee7f0);
    background: var(--vscode-editor-background, #0e1116);
    padding: 16px 20px 28px;
    margin: 0;
  }
  .ask {
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-weight: 400;
    font-size: 22px;
    margin: 0 0 6px;
  }
  .where { color: var(--muted); font-size: 11.5px; margin: 0 0 18px; }
  .card {
    background: color-mix(in srgb, var(--vscode-foreground, #dee7f0) 5%, transparent);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .card p { margin: 0; overflow-wrap: break-word; }
  .because {
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-size: 14px;
    color: var(--muted);
    padding: 8px 0 8px 22px;
    position: relative;
  }
  .because::before {
    content: "";
    position: absolute;
    left: 9px; top: 0; bottom: 0;
    border-left: 1px solid var(--line);
  }
  code {
    font-family: inherit;
    padding: 1px 5px;
    border-radius: 5px;
    overflow-wrap: anywhere;
  }
  .t-actual { color: var(--actual); background: color-mix(in srgb, var(--actual) 12%, transparent); }
  .t-expected { color: var(--expected); background: color-mix(in srgb, var(--expected) 12%, transparent); }
  .t-path { background: color-mix(in srgb, var(--vscode-foreground, #dee7f0) 10%, transparent); }
  .related { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); }
  .related p { color: var(--muted); font-size: 12px; margin: 4px 0; }
  .loc { opacity: 0.7; }
  .legend { display: flex; gap: 16px; margin-top: 22px; font-size: 11.5px; color: var(--muted); }
  .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
</style>
</head>
<body>
  <h1 class="ask">Why does this fail?</h1>
  <p class="where">${esc(opts.file)}:${opts.line}${opts.code ? ` · TS${esc(String(opts.code))}` : ""}</p>
  ${chainHtml(opts.chain, 0)}
  ${related}
  <div class="legend">
    <span><i class="swatch" style="background:var(--actual)"></i>what you gave it</span>
    <span><i class="swatch" style="background:var(--expected)"></i>what it expects</span>
  </div>
</body>
</html>`;
}
