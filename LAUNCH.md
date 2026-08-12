# Launch prep (NOTHING here is published — Zee pulls the trigger)

## 0. THE NAMING DECISION — ✅ DECIDED: **WhyType** (Zee, 2026-08-12)

Rename sweep done (code, wordmark, worker, extension manifest, repo).
Still to claim at launch: `whytype` on npm (free as of 2026-08-12), whytype.dev
domain, X handle, VS Code marketplace publisher.

Original findings, kept for the record:

**"TypeLens" is taken where it hurts most.** Findings (2026-08-12):

- VS Code Marketplace: **TypeLens by kisstkondoros** (Tamas Kiss) — established
  reference-counter codelens extension, years on the marketplace. Anyone
  searching our name finds his tool. Direct collision for our own extension.
- npm `typelens`: unpublished 2024-11-06 — npm usually blocks reuse of
  unpublished names for other authors. Assume unavailable.
- npm scope `@typelens/*`: free, but the marketplace collision stands.

Verified free on npm (2026-08-12): `whytype`, `typewhy`, `becausets`,
`tstrace`, `typetrace`. Personal shortlist, no decision made:

- **whytype** — the question is the brand; matches the "Why does this fail?"
  UI voice; whytype.dev reads clean.
- **typetrace** — describes the mechanism (tracing resolution); more generic.
- Keep "the compiler, explaining itself" as tagline regardless.

Before deciding: check domain (.dev), X handle, VS Code marketplace search,
GitHub org. Rename touches: repo, wrangler name + workers.dev URL, extension
publisher/displayName, wordmark component, README, this file.

## 1. Demo video (60s storyboard — record after rename)

Material: gallery examples `buried-mismatch` and `distribution`. Screen-record
the playground at 1080p; no voiceover needed, captions carry it (silent
autoplay on X/HN).

| t | shot | caption |
|---|------|---------|
| 0–6s | VS Code tooltip with the wall-of-text nested `Config` error, slow scroll | "You know this error." |
| 6–14s | Same code pasted into the playground; click the squiggle | "Ask it *why*." |
| 14–28s | Because-chain settles in, step by step (the animation IS the shot) | "The compiler's actual reasoning — *because* by *because*." |
| 28–36s | Point at colors: apricot then sky; fix `key: 42` → `"key.pem"`; errors clear, status flips green | "What you gave it vs. what it expects." |
| 36–50s | Load `distribution` example; cursor on `Mixed`; per-member verdicts animate | "Even the weird parts. Conditionals distribute — watch each member choose." |
| 50–60s | share click → "link copied"; end card: wordmark + tagline + URL | "Runs in your tab. Nothing uploaded. <URL>" |

## 2. Show HN draft

**Title:** Show HN: WhyType – see why a TypeScript type error actually happened

**Body:**
Every TypeScript developer knows the wall-of-text error: "Type X is not
assignable to type Y", forty lines, the real problem buried at depth three.

WhyType is a playground that renders the compiler's own reasoning as an
explorable chain: click an error and read it as "because → because →
because", with the type you gave it and the type it expected color-coded at
every step. Put the cursor in a generic call to see what every type parameter
was inferred as; put it on a conditional type to see which branch fired — and
per-member verdicts when a union distributes.

Technically: the TypeScript compiler runs in a web worker over a virtual
filesystem, so nothing leaves your tab; share links compress the code into
the URL. The trace never guesses — for conditional types the engine
synthesizes probe types and reads back what the checker actually decided,
so the verdicts are the compiler's, not a reimplementation's. There's also a
VS Code extension that renders the same explanation for your project's own
tsserver diagnostics.

Built solo; the engine runs on TS 6 (the last JS-based compiler) and ports
to the tsgo stable API when TS 7.1 lands. Happy to answer anything about
digging reasoning out of the checker.

<playground URL> · <repo URL>

## 3. r/typescript draft

**Title:** I built a visual "why" for TypeScript errors — click the squiggle,
read the compiler's reasoning as a chain

**Body:** shorter, friendlier variant of the HN text + 2 gallery share links
(buried-mismatch, distribution) + the video. End with: "Which error should I
add to the gallery next?" (comment bait that's actually useful roadmap input.)

## 4. X/Twitter thread draft (5 posts)

1. Video + "TypeScript errors tell you WHAT failed. WhyType shows you WHY —
   the compiler's actual reasoning, because by because. Runs entirely in your
   tab. <URL>"
2. Screenshot of because-chain: "The famous 40-line wall of text is a tree.
   Render it like one and it stops being scary."
3. Screenshot of distribution trace: "Why is ToArray<string | number> not
   (string | number)[]? Conditionals distribute. Watch each member choose a
   branch."
4. Screenshot of any-both-branches: "any is the only type that refuses to
   choose. Yes, both branches. The gallery has the greatest hits of TS
   confusion."
5. "Engine notes: TS in a worker, virtual FS, zero servers. Conditional
   verdicts come from probe types the checker itself evaluates — never a
   reimplementation. tsgo port when the TS 7.1 API lands. <repo URL>"

## 5. Remaining build work before flipping public

- [x] Rename (see §0) — repo, worker, extension manifest, wordmark, docs
- [ ] LICENSE (MIT, Zee's name) + README badges/screenshots
- [ ] OG/social meta tags + og-image (screenshot of because-chain)
- [ ] Favicon/logo mark
- [ ] `@whytype/core` npm package skeleton (engine is already injected/isolated;
      needs package.json, exports map, build step, README) — publish at launch
- [ ] Extension: icon, README with GIF, `vsce package`, publisher account —
      publish at launch
- [ ] Custom domain on the Worker once name is chosen
- [ ] Analytics decision: Cloudflare Web Analytics (cookieless) or none —
      "nothing leaves your tab" claim must stay literally true for the code;
      page analytics are separate but be transparent in README
- [ ] Repo public + `git remote` docs check, secrets scan before flip

## 6. Launch-day order of operations

1. Final deploy + smoke test (gallery links, share round-trip, mobile layout)
2. Repo → public; npm publish `@whytype/core`; marketplace publish extension
3. Show HN (morning US time), then X thread ~1h later, r/typescript same day
4. TypeScript Discord #show-and-tell after the HN thread has some life
5. Reply to every single comment on day one — that IS the launch
