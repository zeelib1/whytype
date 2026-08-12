/** Run: npx tsx src/parseChain.test.ts (from extension/) */
import { parseChain } from "./parseChain";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failures++;
};

// The exact shape tsserver produces for a nested structural mismatch.
const nested = [
  "Type '{ server: { port: number; tls: { cert: string; key: number; }; }; retries: number; }' is not assignable to type 'Config'.",
  "  The types of 'server.tls.key' are incompatible between these types.",
  "    Type 'number' is not assignable to type 'string'.",
].join("\n");

const tree = parseChain(nested);
check("root message kept", tree.message.startsWith("Type '{ server"));
check("one child at depth 1", tree.children.length === 1);
check("depth-1 is the property path", tree.children[0].message.includes("server.tls.key"));
check("depth-2 is the leaf mismatch", tree.children[0].children[0]?.message === "Type 'number' is not assignable to type 'string'.");

// Sibling elaborations at the same depth stay siblings.
const siblings = ["Top.", "  First branch.", "    Deep.", "  Second branch."].join("\n");
const s = parseChain(siblings);
check("two siblings under root", s.children.length === 2);
check("first sibling keeps its child", s.children[0].children.length === 1);
check("second sibling is empty", s.children[1].children.length === 0);

// Single-line messages parse to a bare root.
const single = parseChain("Cannot find name 'foo'.");
check("single line, no children", single.children.length === 0);

console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ parseChain ok");
process.exit(failures ? 1 : 0);
