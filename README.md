# WhyType

**The compiler, explaining itself.** An agent debugging TypeScript sees what
`tsc` prints: the flattened summary of a forty-line elaboration. The actual
cause — a declaration three levels down the reasoning, often in another file —
never reaches the context window, so the agent guesses: a cast, an `any`,
another wasted edit–compile–fail loop. WhyType extracts the compiler's own
reasoning — because-chains, inference bindings, conditional-type verdicts —
and hands it to whoever is debugging, agent or human:

```sh
npm i -D whytype && npx whytype init   # MCP server registered; agents stop guessing
```

**Playground: [whytype.dev](https://whytype.dev)** · **Docs:
[whytype.dev/docs](https://whytype.dev/docs/)** · **npm:
[whytype](https://www.npmjs.com/package/whytype)**

## Parts

- **`whytype` on npm** (`core/`) — MCP server for agents (`npx whytype mcp`:
  whytype_diagnostics / whytype_explain / whytype_snippet), one-command setup
  (`npx whytype init`, `--hooks` for a Claude Code PostToolUse check), CLI
  (`npx whytype file:line:col`, `whytype check`), and the extraction engine
  as a library.
- **Playground** — [whytype.dev](https://whytype.dev): click an error, read
  the reasoning; a gallery of the greatest hits of TS confusion (`examples`
  button). Runs entirely client-side — the compiler lives in a web worker,
  nothing leaves the tab; sharing is a compressed `#code/...` URL.
- **VS Code extension** (`extension/`) — renders the same because-chain for
  your own project's tsserver diagnostics via a "Why?" quick fix.

## Architecture

- `engine/` — the extraction engine, worker-hosted. TS 6 (the last JS-based
  compiler, aliased as `typescript-strada`) is the data source until the tsgo
  stable API lands in TS 7.1; every internal-API touch is quarantined in
  `engine/adapter.ts`, the single seam for that port.
- Conditional-type verdicts are never approximated: the engine synthesizes
  probe aliases (`type __WT_P0 = [check] extends [target] ? ... : ...`) into
  one extra program and reads back what the checker actually decided.
- `src/` — Vite + React + Monaco playground UI.
- `spike/` — Phase 0 feasibility spike and the Node test harness.

## Develop

```sh
npm install        # also copies TS lib files into engine/libs/
npm run dev        # playground on http://localhost:5173
npm test           # engine test harness (tsx spike/test-engine.ts)
npm run build      # production build to dist/
```

## Privacy

Your code never leaves the tab — analysis is 100% in-browser, there is no
backend. The hosted playground page loads
[self-hosted Plausible](https://plausible.io/) page analytics (cookieless,
counts visits only; it sees URLs, never editor content). Share links encode
code into the URL *fragment* — fragments are never transmitted to servers;
the recipient's browser decompresses the code locally.

## License

MIT © [Eldora Studio](https://eldora.studio)
