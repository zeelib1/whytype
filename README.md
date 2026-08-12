# TypeLens

**The compiler, explaining itself.** An interactive visual debugger for
TypeScript types: click an error and read the checker's reasoning as a
"because" chain; put the cursor in a generic call to see what every type
parameter was inferred as; trace which branch of a conditional type fired —
including distribution over unions, `any` taking both branches, and `never`.

Runs entirely client-side: the TypeScript compiler lives in a web worker with
a virtual filesystem. Nothing leaves the tab. Sharing is a compressed
`#code/...` URL (same format as the official TS playground).

## Architecture

- `engine/` — the extraction engine, worker-hosted. TS 6 (the last JS-based
  compiler, aliased as `typescript-strada`) is the data source until the tsgo
  stable API lands in TS 7.1; every internal-API touch is quarantined in
  `engine/adapter.ts`, the single seam for that port.
- Conditional-type verdicts are never approximated: the engine synthesizes
  probe aliases (`type __TL_P0 = [check] extends [target] ? ... : ...`) into
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
