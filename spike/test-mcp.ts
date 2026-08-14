/**
 * Harness for the MCP server: a real SDK client over stdio against the
 * built CLI (`whytype mcp`) in the demo fixture. Run: npx tsx spike/test-mcp.ts
 */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.join(import.meta.dirname, "..");
const fixture = path.join(import.meta.dirname, "fixtures", "demo-project");
const cli = path.join(root, "core", "dist", "cli.js");

let failures = 0;
function check(what: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✓" : "✗ FAIL:"} ${what}${ok ? "" : " — " + JSON.stringify(extra)?.slice(0, 300)}`);
  if (!ok) failures++;
}

const asText = (result: unknown): string =>
  ((result as { content?: { type: string; text?: string }[] }).content ?? [])
    .map((c) => c.text ?? "")
    .join("\n");

const client = new Client({ name: "whytype-test", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, "mcp"],
  cwd: fixture,
});
await client.connect(transport);

// ── tool listing ───────────────────────────────────────────────────────────
const tools = (await client.listTools()).tools;
const names = tools.map((t) => t.name).sort();
check(
  "three tools registered",
  JSON.stringify(names) === JSON.stringify(["whytype_diagnostics", "whytype_explain", "whytype_snippet"]),
  names
);
check("descriptions are written for the model", tools.every((t) => (t.description ?? "").length > 60));

// ── whytype_diagnostics ────────────────────────────────────────────────────
const diag = await client.callTool({ name: "whytype_diagnostics", arguments: {} });
check("diagnostics lists TS2322 compactly", asText(diag).includes("TS2322"), asText(diag));
check("diagnostics paths are relative", asText(diag).includes("src/main.ts:"), asText(diag));

// ── whytype_explain at the error line ──────────────────────────────────────
const exp = await client.callTool({
  name: "whytype_explain",
  arguments: { file: "src/main.ts", line: 4, column: 30 },
});
check("explain returns the because-chain markdown", asText(exp).includes("## error TS2322"), asText(exp));
check("explain includes related declaration site", asText(exp).includes("shapes.ts"), asText(exp));

// ── whytype_snippet without the project ────────────────────────────────────
const snip = await client.callTool({
  name: "whytype_snippet",
  arguments: {
    code: 'type IsString<T> = T extends string ? "yes" : "no";\ntype R = IsString<42>;\n',
    line: 2,
    column: 11,
  },
});
check("snippet traces the conditional", asText(snip).includes("Conditional trace:"), asText(snip));
check("snippet shows the false verdict", asText(snip).includes("**false**"), asText(snip));

// ── errors come back as tool results, not protocol crashes ─────────────────
const bad = await client.callTool({
  name: "whytype_explain",
  arguments: { file: "src/nope.ts", line: 1, column: 1 },
});
check("unknown file is a clean isError result", (bad as { isError?: boolean }).isError === true, bad);

await client.close();
console.log(failures ? `\n✗ ${failures} failure(s)` : "\n✓ all MCP checks pass");
process.exit(failures ? 1 : 0);
