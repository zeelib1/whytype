# WhyType

**The compiler, explaining itself.** An interactive visual debugger for
TypeScript types: click an error and read the checker's reasoning as a
"because" chain; put the cursor in a generic call to see what every type
parameter was inferred as; trace which branch of a conditional type fired —
including distribution over unions, `any` taking both branches, and `never`.

**Playground: [whytype.dev](https://whytype.dev)**

Runs entirely client-side: the TypeScript compiler lives in a web worker with
a virtual filesystem. Nothing leaves the tab. Sharing is a compressed
`#code/...` URL (same format as the official TS playground).

## Parts

- **Playground** — [whytype.dev](https://whytype.dev),
  with a gallery of the greatest hits of TS confusion (`examples` button).
- **VS Code extension** (`extension/`) — renders the same because-chain for
  your own project's tsserver diagnostics via a "Why?" quick fix.
- **`whytype` on npm** (`core/`) — MCP server for agents (`npx whytype mcp`:
  whytype_diagnostics / whytype_explain / whytype_snippet), CLI
  (`npx whytype file:line:col`, `whytype check`), and the extraction engine
  as a library: diagnostics as explain-trees, generic inference bindings,
  conditional-type traces with real checker verdicts.

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
