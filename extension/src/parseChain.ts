/**
 * tsserver flattens a DiagnosticMessageChain into one multi-line string,
 * indenting each level of elaboration by two more spaces. This parses that
 * indentation back into the tree the because-chain renders — so the extension
 * shows exactly what the project's own TypeScript decided, without running a
 * second compiler.
 */
export interface ChainNode {
  message: string;
  children: ChainNode[];
}

export function parseChain(message: string): ChainNode {
  const lines = message.split("\n").filter((l) => l.trim().length > 0);
  const root: ChainNode = { message: (lines[0] ?? message).trim(), children: [] };
  const stack: { depth: number; node: ChainNode }[] = [{ depth: 0, node: root }];

  for (const line of lines.slice(1)) {
    const spaces = line.length - line.trimStart().length;
    // Continuation lines of the root message have no indent; nest them one deep
    // so nothing is ever silently dropped.
    const depth = Math.max(1, Math.floor(spaces / 2));
    const node: ChainNode = { message: line.trim(), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  }
  return root;
}
