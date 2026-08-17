/**
 * Spike harness for src/typeDiff.ts — tokenizer, LCS diff, similarity, caps.
 * Run: npx tsx spike/test-diff.ts
 */
import { diffTypes, parseMismatch, tokenizeType } from "../src/typeDiff";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`── ${name}: ${ok ? "ok" : "FAIL"}`);
  if (!ok) {
    if (detail !== undefined) console.log("   got:", JSON.stringify(detail));
    failures++;
  }
}

// Tokenizer
const toks = tokenizeType(`{ cert: string; key: "a.pem" } => T[]`).map((t) => t.text);
check(
  "tokenizer splits punctuation, keeps string literals and =>",
  JSON.stringify(toks) ===
    JSON.stringify(["{", "cert", ":", "string", ";", "key", ":", '"a.pem"', "}", "=>", "T", "[", "]"]),
  toks
);

const esc = tokenizeType(`"a \\"quoted\\" one"`).map((t) => t.text);
check("tokenizer handles escaped quotes", esc.length === 1 && esc[0] === `"a \\"quoted\\" one"`, esc);

// Round-trip: joining text+ws reproduces the input (modulo trailing space)
const src = `{ server: { port: number; tls: { cert: string; key: number; }; }; retries: number; }`;
const joined = tokenizeType(src)
  .map((t) => t.text + t.ws)
  .join("");
check("tokens round-trip to the source string", joined.trimEnd() === src.trimEnd(), joined);

// Diff: the classic Config pair — only the differing value tokens change
const d = diffTypes(
  "{ cert: string; key: number; }",
  "{ cert: string; key: string; }"
);
const changedA = d?.a.filter((t) => t.changed).map((t) => t.text);
const changedB = d?.b.filter((t) => t.changed).map((t) => t.text);
check(
  "diff isolates number vs string",
  JSON.stringify(changedA) === '["number"]' && JSON.stringify(changedB) === '["string"]',
  { changedA, changedB }
);
check("similarity is high for near-identical types", (d?.similarity ?? 0) > 0.8, d?.similarity);

// Dissimilar bare aliases → low similarity (caller should skip the diff view)
const bare = diffTypes("Config", "looseConfig");
check("bare alias names score low", (bare?.similarity ?? 1) < 0.5, bare?.similarity);

// Size cap
const big = "A | ".repeat(300) + "Z";
check("oversized inputs bail to null", diffTypes(big, big + " | Y") === null);

// parseMismatch
const pm = parseMismatch(
  "Type '{ key: number; }' is not assignable to type '{ key: string; }'."
);
check(
  "parseMismatch extracts actual/expected",
  pm?.actual === "{ key: number; }" && pm?.expected === "{ key: string; }",
  pm
);
check("parseMismatch rejects non-mismatch text", parseMismatch("Property 'x' is missing.") === null);

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all diff checks pass");
process.exit(failures ? 1 : 0);
