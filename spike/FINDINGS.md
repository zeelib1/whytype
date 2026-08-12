# Phase 0 Spike — Findings (2026-08-11)

**Decision gate: PASSED.** The TS 6 (Strada) compiler API yields all three data
shapes the visualizer needs. Run with `npx tsx spike/extract.ts`.

## Setup
- `typescript` (7.0.2 / tsgo) — the compiler users run; **no JS API**, target for Phase 4.
- `typescript-strada` (npm alias → `typescript@6.0.3`) — the extraction engine for now.

## Gate results

### A — Generic call instantiation ✅
`checker.getResolvedSignature(call)` + the signature's internal `mapper`
(TypeMapper union: Simple/Array/Composite) recovers **every type parameter's
inferred argument**: `T := { id: number; name: string; tags: string[] }`,
`K := "tags"`. This is the data for the "generic instantiation stepper".
Internal API — pin the TS 6 minor version and wrap access in one adapter module.

### B — Conditional type branch ✅
Result type via `checker.getTypeAtLocation(alias.name)`; branch determination by
instantiating `trueType`/`falseType` from the conditional's declaration and
comparing identity with the result. Correctly reports TRUE branch for
`IsString<"hello">`, FALSE for `IsString<42>`.

### C — Structural mismatch path ✅ (two regimes, both covered)
1. **Object literals** (contextual typing): TS pins the error at the exact leaf
   (`key: 42`) with `relatedInformation` pointing at the expected declaration.
2. **Pre-typed assignments**: `diag.messageText` is a `DiagnosticMessageChain`
   tree — and TS 6 already collapses the path (`TS2200: the types of
   'server.tls.key' are incompatible`). This is the error-explainer's data,
   essentially free.

## Implications for Phase 1
- Wrap all internal-API touches (`signature.mapper`, mapper kinds) in a single
  `engine/adapter.ts` so the Phase 4 tsgo port has one seam.
- The error explainer (priority-1 feature) needs **no internal APIs at all** —
  public diagnostics suffice. Ship it first.
- Engine must run in a web worker with a virtual FS host (no disk) for the
  client-side playground.
