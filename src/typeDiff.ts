/**
 * Token-level diff between two type strings, powering the "dim the agreement,
 * light the disagreement" rendering. Dependency-free and DOM-free so the spike
 * harness can test it under tsx.
 */

export interface DiffToken {
  /** Token text exactly as it appeared in the source string. */
  text: string;
  /** Whitespace that followed the token in the source string. */
  ws: string;
  /** True when the token has no counterpart on the other side. */
  changed: boolean;
}

export interface TypeDiff {
  a: DiffToken[];
  b: DiffToken[];
  /** 2·common / (lenA + lenB) — 1 means identical token streams. */
  similarity: number;
}

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[$A-Za-z_][\w$]*|\d+(?:\.\d+)?|=>|\.\.\.|[^\s])(\s*)/g;

export function tokenizeType(s: string): { text: string; ws: string }[] {
  const out: { text: string; ws: string }[] = [];
  TOKEN_RE.lastIndex = 0;
  // Leading whitespace would desync the regex; type strings never have it,
  // but trim defensively.
  const trimmed = s.trimStart();
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(trimmed))) out.push({ text: m[1], ws: m[2] });
  return out;
}

/** Guard against quadratic blowup on enormous NoTruncation types. */
const MAX_CELLS = 40_000;

/**
 * Classic LCS over token texts. Returns null when the inputs are too large —
 * callers fall back to plain (undiffed) rendering.
 */
export function diffTypes(aStr: string, bStr: string): TypeDiff | null {
  const a = tokenizeType(aStr);
  const b = tokenizeType(bStr);
  if (a.length === 0 || b.length === 0) return null;
  if (a.length * b.length > MAX_CELLS) return null;

  // lcs[i][j] = LCS length of a[i..] vs b[j..]
  const w = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i].text === b[j].text
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const aOut: DiffToken[] = a.map((t) => ({ ...t, changed: true }));
  const bOut: DiffToken[] = b.map((t) => ({ ...t, changed: true }));
  let i = 0;
  let j = 0;
  let common = 0;
  while (i < a.length && j < b.length) {
    if (a[i].text === b[j].text) {
      aOut[i].changed = false;
      bOut[j].changed = false;
      common++;
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return { a: aOut, b: bOut, similarity: (2 * common) / (a.length + b.length) };
}

/**
 * Pulls the actual/expected pair out of a mismatch-shaped diagnostic message.
 * Mirrors the coloring heuristic: first quoted type = actual, second = expected.
 */
export function parseMismatch(text: string): { actual: string; expected: string } | null {
  if (!/not assignable|not comparable|does not satisfy/.test(text)) return null;
  const quotes = text.match(/'([^']*)'/g);
  if (!quotes || quotes.length < 2) return null;
  return { actual: quotes[0].slice(1, -1), expected: quotes[1].slice(1, -1) };
}
