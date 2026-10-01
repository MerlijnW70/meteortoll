# meteortoll web app — plan

> The plan as written on 2026-10-01, kept for the record. What shipped is described in the
> README and docs/security.md; this file is not kept in sync with the code.

Research done 2026-10-01 across four tracks: Meteora's own tooling, launchpad UX leaders and this
track's competitors, the 2026 Solana frontend stack, and how open problems and bounties are presented
elsewhere. Sources are in the research notes; the decisions are here.

## What wins this track

The listing scores Meteora depth, technical execution, originality and taste, impact, and **mainnet
traction** ("projects who have gone live on mainnet and have people actively using their product").
The field is almost entirely builder tools: curve studios and simulators, dashboards, devnet demos,
jargon without tooltips, "Loading…" with no skeleton, no live trades, no social layer. Only two entries
show mainnet tokens. Nobody else does verifiable bounties.

So the app must be **consumer grade, live on mainnet, and make the math legible to traders while
staying rigorous for researchers.** Two audiences, two front doors: **Trade** and **Solve**.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Base | Build fresh. Copy MIT pieces from Meteora's fun-launch (number formatting, explore columns, trade table patterns) with the notice kept | fun-launch reads only Jupiter's mainnet indexers, so nothing works on devnet, and it has no bounty or verification surface |
| Framework | Next.js 16 app router, React 19, Vercel | Server routes for metadata JSON, OG share images, an indexer webhook and optional Actions |
| Solana client | `@solana/web3.js` 1.x, `@coral-xyz/anchor` 0.31, DBC SDK 1.5.x — the same stack `client/` already runs on devnet | The Meteora SDK is web3.js v1; Kit adoption mid-hackathon is churn |
| Wallets | `@solana/wallet-adapter` (Wallet Standard discovery). Privy embedded login is a stretch goal | Phantom Connect is closed to new apps; Jupiter's kit is stale |
| UI | Tailwind v4, shadcn (Radix), motion, sonner, dark first, tabular numbers | Matches the Jupiter and Meteora look judges know |
| Charts | `lightweight-charts` v5 | TradingView Advanced Charts needs a license; fun-launch hot-links Jupiter's copy |
| Data, devnet | Our program's `Problem` accounts are the registry; DBC SDK `state` for pool, curve progress and fees; live trades from `EvtSwap2` decoded out of DBC inner instructions | Meteora's docs say to index `EvtSwap2`, not transfer logs; no hosted DBC data API serves devnet |
| Data, mainnet | Same source of truth, enriched by Jupiter's Data API (charts, holders), DAMM v2 API after graduation, links to DexScreener and GeckoTerminal; Jupiter routing for trading after graduation | Shows "tradable on Jupiter from day one", which Meteora sells DBC on |
| Verifier in the browser | The verifier crate compiled to `wasm32-unknown-unknown` with a tiny C ABI, run in a Web Worker; a separate `crates/verifier-wasm` wrapper keeps the root crate dependency-free | Same code as on chain: instant local pre-check, and a replay of the on-chain verdict |
| Upload | Sign all chunks in one wallet prompt (`signAndSendAllTransactions` where offered, else `signAllTransactions`), idempotent resume from chain state, simulate first. v1 large transactions are an optional later upgrade | One prompt instead of 24; Phantom warns on near-limit or failing transactions |

## Pages

**Home.**
- Hero: the flagship problem as one sentence and one number pair — *"Multiply a 7×7 by a 7×9 with 314
  multiplications. Best known: 315."*
- Bounty ticking up live, plus Trade / Solve buttons.
- Problem cards grouped by lifecycle: **Open → Near graduation → Graduated → Solved**, the pattern from
  Axiom Pulse and pump.fun's King of the Hill. Each card shows its status badge, target vs best known,
  bounty, curve progress and a quick-buy button.

**Problem page,** top to bottom:
1. **Hero:** ⟨7×7×9 : ≤314⟩ with a plain subtitle, a status badge (OPEN / DISCLOSED DEMO / VERIFYING /
   SOLVED), and the three numbers: **bounty** (SOL + USD, live), **record to beat** (315 → 314, naive
   441 small), **status and clock**. Trade box on the right.
2. **Rules summary**, Kalshi style: what counts (integer coefficients |c| ≤ 128, rank ≤ target), who
   decides (*program `3Yjx…`, instruction `verify`; no committee*), when it pays (after the grace
   window). "Full rules" expands to bond and slashing, earliest commitment wins, fees after a solve, no
   expiry, statement hash, problem address.
3. **Record staircase:** naive → historical ranks with citations → current best (Sedoglavic table,
   dated) → target. Next to it, two meters: **curve to graduation** in absolute numbers, and **bounty
   vault** growing with each trade.
4. **Attempts and lifecycle:** public feed of commits, reveals and verifies with explorer links;
   grace-window countdown once solved.
5. **How verification works:** the verifier replay (below).
6. **Why this matters:** Strassen 8 → 7 interactive and one paragraph ("matrix multiplication is the
   inner loop of AI; 4×4 took 56 years to go from 49 to 48").
7. **For researchers:** exact submission format, CLI command, statement, program ID with a verified-build
   badge, upgrade authority, download of the winning scheme with its hash.
8. **Provenance and disclosures:** table snapshot date, demo disclosure, team-solver rule.
9. **Chart, trades and holders.**

**Solve.**
1. Drop an `fmm` JSON (or the encoded file).
2. **Local check in WASM:** pass or fail in milliseconds, with the shape and rank read back, before any
   transaction.
3. **Commit:** stake the bond, and the attempt appears publicly.
4. **Upload:** one prompt signs every chunk; a progress ring shows them landing.
5. **Reveal**, then **verify** with the replay animation running on the real on-chain values.
6. Grace countdown, then **claim**, which can be repeated as fees arrive.

**Launch.** Only verifiable problems can launch, which is curation by construction and avoids
Believe-style spam. Three steps, after Jupiter Studio:
1. Pick a format from the catalog; best known and target are filled in.
2. Recap: supply, fee routing (100% of non-protocol fees to the bounty), what graduation means.
3. One signature, then a share card.

**Me.** Holdings, attempts, claimable bounties.

**Trust.**
- Program ID and verified build.
- Upgrade authority, and the plan to revoke or multisig it.
- Every rule.
- Integrity policy.
- Audit status, stated honestly as a self-review.

## Signature visuals, ranked by impact over effort

1. **"315 → 314" hero and record staircase.** Static SVG, about half a day. Reads instantly for traders
   and is the native currency for researchers.
2. **Verifier replay.**
   - Shows the slot hash that seeded the point and that it is newer than the commit.
   - Product terms stream into a running sum against the target.
   - The two 61-bit values match green.
   - A "replay in your browser" button recomputes them with the same verifier in WASM.
   - A "break it" button flips one coefficient and the check fails.
   - About a day and a half. This is the video moment.
3. **Lifecycle timeline and attempts feed** with grace countdown. About a day. The trust story and the
   solver flow on one surface.
4. **Strassen 8 → 7 interactive.** About a day. The explainer hook.
5. **U/V/W factor heatmap** of a solved scheme. Half a day. Shareable once solved. No 3D cube; it only
   reads at 2×2.

## Patterns adopted (source)

- Lifecycle columns and King-of-the-Hill slot (Axiom Pulse, pump.fun).
- Curve progress in absolute numbers (pump.fun, Jupiter Studio's estimated raise).
- Live trade feed on every token page (Jupiter Mobile, pump.fun).
- Header with copy-address, share, watchlist (Jupiter Mobile).
- Quick-buy presets on cards (pump.fun 2.0, Axiom).
- Simulate before signing with readable Anchor errors (curvature-dbc, curveforge).
- Three-step launch with recap (Jupiter Studio).
- Status badge with prize and dated changelog (Erdős Problems, Epoch FrontierMath).
- Rules summary above the trade box (Kalshi, Polymarket).
- Countdown plus per-object visual plus proof link (Busy Beaver Challenge).
- Falling record staircase (Polymath8).
- Status pipeline and public attempt posts (Gitcoin, Algora).
- Skeletons and designed empty states everywhere (the anti-example is half this track).
- OG share cards per problem; Blinks only if time remains, since X unfurls need Dialect registry approval.

## Concept-native ideas

- **Ladder, not dead token:** when a problem is solved, the next rung (target − 1) can launch with one
  click, and the solved token keeps paying its solver from fees.
- **Attempts as the social feed** instead of a comment thread; "closest attempt" replaces King of the
  Hill on the Solve side.
- **Sealed submissions** shown as a visible step: the commitment hides the scheme until the random point
  exists.
- **Attribution labels** on solved problems: solved by community / by team (disclosed), after Epoch AI.

## Rules we must get right on the page

- **Ring.** The verifier accepts integer coefficients with |c| ≤ 128. Published best ranks mix rings
  (some are over Q, F2 or C). Every problem states its ring and compares against the best known in a
  stated ring, or says plainly that it is asking for integer coefficients where the record is over Q.
- **Snapshot date.** Targets are fixed in the problem address; the "best known" shown beside them is
  dated, with a note if the table later moves.
- **Records.** Re-check before choosing public problems: `F:\fmm\records` still beats the tracked table
  only on 7×7×9 (314/315), 6×11×13, 7×11×15, 8×10×13, 8×10×14, 9×11×13, 10×13×14, 11×13×15,
  11×14×14 and 13×13×15. The 2×N×M records and several others are now behind the table.

## Data needed outside the chain

- `problems/catalog.json`: per problem address, the ring, coefficient bound, best known with citation
  and snapshot date, demo flag, display name.
- Token metadata JSON and image for each DBC launch, served by the app (`/api/metadata/[mint]`), so
  URIs are real instead of `meteortoll.invalid`.

## Risks

| Risk | Mitigation |
|---|---|
| Phantom "not reviewed" or "could be malicious" warnings | Deploy the final domain on day 1 and submit Phantom's review form; one signer per transaction; headroom in chunk size; simulate everything |
| Public RPC rate limits (already hit on devnet) | Helius free key; throttle sends; resume from chain |
| Event decoding for charts is fiddly and devnet history is thin | Decode `EvtSwap2` early; fall back to a price line from pool state |
| Anchor 1.2 IDL with the 0.31 TS client | Already proven by `client/` on devnet |
| Duplicate web3.js copies in the bundle | One version via npm overrides; pass base58 strings across SDK boundaries |
| Scope | Ship Trade + Solve + problem page first; Launch, Me, Strassen interactive and heatmap after |

## Build order (Oct 2–12)

| Day | Work |
|---|---|
| Oct 2 | App skeleton, providers, deploy to the final domain; catalog and metadata routes; WASM verifier crate + worker |
| Oct 3 | Problem page: hero, rules, staircase, meters, trade box (SDK swap), live trades from `EvtSwap2` |
| Oct 4 | Solve flow end to end on devnet, one-prompt upload, local check |
| Oct 5 | Verifier replay animation, attempts feed, grace countdown, claim |
| Oct 6 | Home with lifecycle columns, quick buy, OG share cards, skeletons and empty states |
| Oct 7 | Launch flow (catalog-gated, one signature), Me page, Trust page |
| Oct 8 | Mainnet readiness: Jupiter enrichment, Helius, verified build, program mutation run reviewed |
| Oct 9 | **Mainnet launch:** program deploy, flagship demo + public problems |
| Oct 10–11 | Traction push, Strassen interactive, heatmap, polish, Lighthouse, Playwright happy path |
| Oct 12 | Video and deck; submit to Superteam and Colosseum |
