/**
 * `whytype init`: one-command onboarding for agent setups. Writes/merges the
 * MCP registration into .mcp.json (Claude Code) and .cursor/mcp.json (when the
 * repo uses Cursor), drops a marker-delimited instruction block into an
 * existing CLAUDE.md/AGENTS.md, and with --hooks wires a PostToolUse check
 * into .claude/settings.json. Idempotent; never clobbers foreign config.
 * Node builtins only — must not pull the engine (works before typescript is
 * installed).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "./ts-shim";

export interface InitOptions {
  hooks?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

const MCP_ENTRY = { command: "npx", args: ["whytype", "mcp"] };
const MCP_ENTRY_JSON = `{ "mcpServers": { "whytype": { "command": "npx", "args": ["whytype", "mcp"] } } }`;

const HOOK_ENTRY = {
  matcher: "Edit|Write|MultiEdit",
  hooks: [{ type: "command", command: "npx whytype hook" }],
};

const BLOCK_BEGIN = "<!-- BEGIN whytype (managed by `npx whytype init`) -->";
const BLOCK_END = "<!-- END whytype -->";
const BLOCK_BODY = [
  BLOCK_BEGIN,
  "When you hit a TypeScript error, call the `whytype_explain` MCP tool",
  "(file, line, column from the error) before editing — it returns the",
  "compiler's own reasoning chain and the declaration site of the cause.",
  "Use `whytype_diagnostics` for a project-wide error list.",
  BLOCK_END,
].join("\n");

export function runInit(opts: InitOptions = {}): number {
  const cwd = opts.cwd ?? process.cwd();
  const say = (line: string) => console.log(opts.dryRun ? `would: ${line}` : line);
  let done = 0;
  let failed = 0;

  const write = (file: string, content: string) => {
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  };

  /** Merge the whytype server entry into one mcp.json-shaped file. */
  const mergeMcpJson = (relFile: string) => {
    const file = path.join(cwd, relFile);
    try {
      if (!fs.existsSync(file)) {
        write(file, JSON.stringify({ mcpServers: { whytype: MCP_ENTRY } }, null, 2) + "\n");
        say(`+ ${relFile} — registered the whytype MCP server`);
        done++;
        return;
      }
      let obj: { mcpServers?: Record<string, { command?: string; args?: unknown }> };
      try {
        obj = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        say(`! ${relFile} — could not parse; add manually: ${MCP_ENTRY_JSON}`);
        failed++;
        return;
      }
      const servers = (obj.mcpServers ??= {});
      const existing = servers.whytype;
      if (existing) {
        const same =
          existing.command === MCP_ENTRY.command &&
          JSON.stringify(existing.args) === JSON.stringify(MCP_ENTRY.args);
        if (same) {
          say(`= ${relFile} — whytype already configured`);
        } else {
          say(
            `! ${relFile} — a different "whytype" server entry exists (${JSON.stringify(existing)}); leaving it alone`
          );
        }
        return;
      }
      servers.whytype = MCP_ENTRY;
      write(file, JSON.stringify(obj, null, 2) + "\n");
      say(`+ ${relFile} — registered the whytype MCP server`);
      done++;
    } catch (e) {
      say(`! ${relFile} — ${(e as Error).message}`);
      failed++;
    }
  };

  mergeMcpJson(".mcp.json");
  if (fs.existsSync(path.join(cwd, ".cursor"))) {
    mergeMcpJson(path.join(".cursor", "mcp.json"));
  }

  // Instruction block: only into a file the user already maintains.
  const docFile = ["CLAUDE.md", "AGENTS.md"].find((f) => fs.existsSync(path.join(cwd, f)));
  if (docFile) {
    try {
      const file = path.join(cwd, docFile);
      const text = fs.readFileSync(file, "utf8");
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const block = BLOCK_BODY.replaceAll("\n", eol);
      const begin = text.indexOf(BLOCK_BEGIN);
      if (begin >= 0) {
        const endMark = text.indexOf(BLOCK_END, begin);
        if (endMark >= 0) {
          const next = text.slice(0, begin) + block + text.slice(endMark + BLOCK_END.length);
          if (next === text) {
            say(`= ${docFile} — whytype instruction block already present`);
          } else {
            write(file, next);
            say(`+ ${docFile} — refreshed the whytype instruction block`);
            done++;
          }
        } else {
          say(`! ${docFile} — found the BEGIN marker but no END marker; fix it by hand`);
          failed++;
        }
      } else {
        const sep = text.endsWith(eol) ? eol : eol + eol;
        write(file, text + sep + block + eol);
        say(`+ ${docFile} — added the whytype instruction block`);
        done++;
      }
    } catch (e) {
      say(`! ${docFile} — ${(e as Error).message}`);
      failed++;
    }
  } else {
    say(`- no CLAUDE.md/AGENTS.md here — create one and re-run to add the instruction block`);
  }

  if (opts.hooks) {
    const relFile = path.join(".claude", "settings.json");
    const file = path.join(cwd, relFile);
    try {
      let obj:
        | { hooks?: Record<string, { matcher?: string; hooks?: { command?: string }[] }[]> }
        | undefined = {};
      if (fs.existsSync(file)) {
        try {
          obj = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
          say(`! ${relFile} — could not parse; add the PostToolUse hook manually`);
          failed++;
          obj = undefined;
        }
      }
      if (obj) {
        const hooks = (obj.hooks ??= {});
        const post = (hooks.PostToolUse ??= []);
        const already = post.some((h) =>
          (h.hooks ?? []).some((c) => c.command?.includes("whytype hook"))
        );
        if (already) {
          say(`= ${relFile} — whytype hook already wired`);
        } else {
          post.push(HOOK_ENTRY);
          write(file, JSON.stringify(obj, null, 2) + "\n");
          say(`+ ${relFile} — PostToolUse hook: npx whytype hook after Edit/Write`);
          done++;
        }
      }
    } catch (e) {
      say(`! ${relFile} — ${(e as Error).message}`);
      failed++;
    }
  }

  // Advisory only — init must succeed in a repo that has no typescript yet.
  try {
    say(`✓ typescript ${ts.version} resolved`);
  } catch {
    say(`! no usable typescript found — npm i -D typescript@6  (whytype needs >=5 <7)`);
  }
  say("→ restart Claude Code (or run /mcp) to pick up the server");

  return failed && !done ? 2 : 0;
}
