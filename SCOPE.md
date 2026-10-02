# meteortoll — scope

Entry for **Best use of Meteora's Dynamic Bonding Curve** (Crypto World's Fair side track).
Submission deadline: **2026-10-13 06:59 UTC**. Working days: Oct 2 – Oct 12.

## The pitch

**Open problems as tradable assets.** Each launch is a token for one open computational
problem with an exact, machine-checkable answer. The DBC curve prices the problem and
raises its bounty; the bounty grows with trading fees; whoever submits an answer that
the program verifies on-chain takes the bounty. After graduation the token keeps
trading on DAMM v2 as a live market on the problem.

First problem class: **matrix multiplication rank** — "find a scheme that multiplies an
n×m by m×p matrix with at most R multiplications", with R set one below the best known.
This is a real research frontier (AlphaTensor, flip-graph papers, the Sedoglavic table),
and the team's search tool `fmm` already holds schemes that beat that table on several formats,
so the demo is real research, not a toy.

Why it targets the judging criteria:

| Criterion | How we answer it |
|---|---|
| Depth of Meteora integration | DBC is the raise; creator fees, surplus and the creator LP share all route to the bounty vault by CPI; graduation into DAMM v2 is part of the product, not an afterthought |
| Technical execution | Trustless on-chain verification of submitted schemes (below) |
| Originality and taste | A new use of a bonding curve: pricing an unsolved problem. Nothing in the current field does this |
| Impact potential | Any problem with a cheap verifier fits the same template (later problem classes) |
| Traction | Real problems launched on mainnet before the deadline |

## How on-chain verification works

A scheme is correct iff, as a polynomial identity, it computes C = A·B. We test that
identity at one random point over the field of integers mod 2^61 - 1 (Schwartz–Zippel):

1. Solver **commits** `sha256(domain, problem, solver, salt, scheme)` and stakes a bond.
2. Solver uploads the scheme into a buffer account in chunks, then **reveals** the salt.
   The program checks the hash, the dimensions and `rank <= target`.
3. The random point comes from the newest slot hash, which must be newer than the commit,
   so it did not exist when the scheme was fixed.
4. **Verify** (anyone can crank it) checks
   `sum_r (u_r . A)(v_r . B)(w_r . G) == sum A[i][j] B[j][k] G[k][i]`. Coefficients are
   bounded integers, so every exact Brent coefficient is below the modulus and a wrong
   scheme passes with probability at most 3/p. The check is resumable; its state is a few
   dozen bytes in the attempt account.
5. Holds: the problem is solved. Fails or malformed: the bond goes to the bounty.

**Ordering, not correctness, uses a grace window.** Uploaded chunks are public before the
reveal, so a copier could commit the same scheme later and race to verify. The rule is that
the earliest commitment that holds wins: a copier can only commit after seeing the upload,
which is always after the author committed. Claims open once the window after the first
holding check has passed. Correctness itself needs no oracle, committee or challenge.

Measured (`programs/toll/tests/cost.rs`, LiteSVM, SBPF v0): the 7x7x9 rank-314 `fmm` record
verifies in one transaction; 9x10x10 rank 596 needs two.

## Money flow

All of it is permissionless and tested against the mainnet DBC, DAMM v2 and Metaplex programs
(`programs/toll/tests/dbc.rs`), with a launch config encoded by Meteora's own SDK
(`client/src/encode-config.ts`):

- Launch settings: every non-protocol trading fee goes to the creator (`creatorTradingFeePercentage
  = 100`), fees are collected in the quote token, graduation goes to DAMM v2, and the creator's
  DAMM v2 position is 100% permanently locked.
- The **pool creator is the problem PDA**, derived from the pool and the statement, so the pool
  itself fixes what the bounty is for.
- `sweep_trading_fees` → DBC `claim_creator_trading_fee` into the vaults.
- `sweep_surplus` → DBC `creator_withdraw_surplus` once the curve completes (zero for an SDK
  curve filled exactly to its threshold; the path is tested anyway).
- After graduation DBC hands the creator position to the problem PDA; `sweep_position_fees` →
  DAMM v2 `claim_position_fee`. The locked position keeps funding the bounty for as long as
  the token trades.
- The solver can `claim` repeatedly; fees keep arriving after a solve.
- Unsolved problems stay open; there is no expiry in v1.

**Day-1 spike, from the DBC and DAMM v2 source** (confirmed since by the tests above):
- Every creator instruction (`claim_creator_trading_fee`, `creator_withdraw_surplus`,
  `transfer_pool_creator`) takes `creator: Signer` and checks only `pool.creator == signer`
  (DBC `access_control.rs`). A PDA signing through `invoke_signed` passes.
- At DAMM v2 migration the creator's position NFT account is handed to `virtual_pool.creator`.
  DAMM v2 `claim_position_fee` accepts the NFT account's owner as signer.
- "Compounding" is a `MigratedCollectFeeMode` of the graduated DAMM v2 pool. It does not feed
  the bounty; we leave it off.

## Components

| # | Component | Where | Notes |
|---|---|---|---|
| 1 | `toll` Anchor program | `programs/toll` | problem registry, vault, sweep, commit/reveal/verify, payout |
| 2 | Verifier core | repo root (`src/`, `tests/`) | zero-dependency no_std Rust, mutation-tested; shared by the program and, as WebAssembly (`crates/verifier-wasm`), the web app; tested against four `fmm` records (`tests/fixtures`) and against mutated (broken) schemes |
| 3 | Web app | `app/` | Next.js: problems, trading on the curve, in-browser verifier (WebAssembly), solve flow, launch, portfolio |
| 4 | CLI | `client/` | setup, launch, buy, sweep, solve (commit/upload/reveal/verify), claim, close |
| 5 | Problem catalog | `problems/` | formats, current best known rank (with source), target rank |

## Out of scope for the deadline

- More problem classes. Mention them in the pitch only.
- Porting the solver to the GPU with `simdr`. `fmm` already finds schemes as it is.
- DLMM, prediction-market add-ons, and a token-2022 transfer hook.
- Bounty refunds or expiry.

## Status

What is built and proven is recorded where it can be checked: the program's tests, the app's tests,
and the transactions in `docs/devnet-run.md`. Remaining before the deadline: mainnet launch
(program, launch config and launchpad, the first problems), demo video, pitch, and submission on
Superteam and the Colosseum main track, everything in by the evening of Oct 12.

## Integrity rule (important)

We own `fmm`, and it already beats some known ranks. If we submit our own schemes to bounties
funded by the public, it looks like a rug. Two rules:

- If a problem's target is one we already meet, it is a **disclosed demo problem**, funded
  by us. We announce that publicly before it launches.
- Public problems are set at targets we have **not** reached. If `fmm` later solves one,
  we disclose that we are the solver.

## Risks

| Risk | Mitigation |
|---|---|
| DBC CPI or PDA-creator path does not work | Retired: tested against mainnet DBC and DAMM v2 binaries |
| Program holds user funds | Minimal instruction set, review of every lamport path, the upgrade authority's holder stated on the site, the program mutation-tested (`scripts/mutants.sh`). The program has no cap on vault size: until an audit, the team keeps its own launches and buys small |
| Judges see it as niche | Lead with "new asset class: open problems"; matrix rank is example #1 |
| Low organic traction | Launch by day 8; push to the research community; live verify in the video |
| Running out of time | Cuts above; the web app may stay thin as long as launch, trade and submit all work |
