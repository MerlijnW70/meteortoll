# Web app security

What the site at `app/` protects, how, and what is knowingly left open. The on-chain program's
rules are in `SCOPE.md`; this covers the website.

## Protections

| Risk | Protection | Where |
|---|---|---|
| RPC key leaking to browsers | The key lives only in the server variable `SOLANA_RPC_URL`, which has no `NEXT_PUBLIC_` prefix, so Next.js never puts it in browser code; browsers call `/api/rpc` | `app/src/app/api/rpc/route.ts`, `app/src/lib/upstream.ts` |
| Other sites and scripts spending our RPC | `/api/rpc` serves only same-origin browser requests (`Origin` and `Sec-Fetch-Site`); a request with neither is refused | `app/src/lib/rpcPolicy.ts` |
| RPC abuse | Method allowlist; `getProgramAccounts` only for the toll program and only filtered; bodies ≤ 64 KiB; batches ≤ 50; the request forwarded is rebuilt from the checked fields (no duplicate-key smuggling); per-instance budgets per client, tighter for sending and simulating transactions | same |
| Paid RPC work on demand | `/api/stats` redirects any query string away (one CDN entry) and recomputes at most once a minute per instance; problem lookups for pages, preview images and token metadata are remembered for 30 s per instance, misses included, and cached at the CDN | `app/src/app/api/stats/route.ts`, `app/src/lib/server.ts` |
| A stale price at signing | Swaps are priced again from the pool when the button is pressed; the 1% slippage limit applies from that price | `app/src/components/problem/TradePanel.tsx` |
| The keeper wasting its fees | It checks attempts only on problems whose solve is not final, and simulates every transaction before paying for it | `app/src/lib/keeper.ts` |
| CI or a dependency stealing secrets | Workflows hold read-only tokens; actions are pinned to full commits; the keeper's key reaches only the step that runs it, after an install with scripts disabled | `.github/workflows/` |
| The mainnet key leaking from development | Mainnet uses its own key, never used in tests, browsers or devnet; `preflight` refuses a mainnet key that is the devnet key | `client/src/cli.ts`, `docs/mainnet-runbook.md` |
| Clickjacking a transaction approval | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | `app/next.config.ts` |
| Downgrade and cross-window attacks | HSTS, `upgrade-insecure-requests`, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (wallet popups keep working) | same |
| Injected scripts and exfiltration | Content Security Policy: scripts and connections limited to this origin and Solana's public websocket endpoints; no `object`, no foreign `base` or `form` targets | same |
| MIME sniffing, referrer leaks, device APIs | `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera, microphone, location, payment | same |
| A test key wallet reaching users | The dev wallet needs the build flag `NEXT_PUBLIC_DEV_BURNER=1`, a `localhost` page and a cluster other than mainnet; `.env.local` is never uploaded (`.vercelignore` is an allowlist) | `app/src/app/providers.tsx`, `.vercelignore` |
| Freezing the tab with a huge file | Files over 5 MiB are refused before parsing; encodings over the program's 1 MiB limit are refused | `app/src/lib/checkFile.ts` |
| One RPC provider failing or rate-limiting | The relay and every server read fall over to `SOLANA_RPC_FALLBACK_URLS`, then the cluster's public endpoint; logs name hosts, never URLs, which carry keys | `app/src/lib/upstream.ts` |
| Error reports leaking secrets or identities | Reports carry only message, stack, page and release; long base58 runs and 32+ number arrays are redacted on both sides; same-origin only, ≤ 8 KiB, a per-instance budget; the client address is never logged | `app/src/lib/report.ts`, `app/src/app/api/report/route.ts` |
| Losing a commitment's salt | Kept in this browser's storage; if lost, the attempt can be abandoned and the bond refunded | `app/src/lib/solve/program.ts` |
| Signing something unexpected | Every transaction is built from the toll and Meteora programs' IDLs and shown by the wallet before signing; swaps carry a 1% slippage limit | `app/src/lib/trade.ts`, `app/src/lib/solve/build.ts` |

## Accepted risks

- **`unsafe-inline` scripts.** Next.js bootstraps with inline scripts. Nonce-based CSP would need
  every page rendered dynamically; not worth it for a site with no user-generated content.
- **Rate limiting is per serverless instance.** Instances do not share counters, so the budget slows
  abuse rather than stopping it. Helius's own limits are the backstop.
- **`npm audit` reports high-severity issues in `bigint-buffer` and `toml`** (2026-10-01). Both come
  from `@solana/spl-token` / `@coral-xyz/anchor`, which the Meteora SDK requires. `bigint-buffer`'s
  overflow needs an attacker-controlled length passed to `toBigIntLE`; `toml` only parses Anchor's
  config file and never runs in the browser. The only offered fix is downgrading `spl-token` to a
  2021 release, which breaks the SDK. Revisit when the SDK moves to `@solana/kit`.
- **Public RPC websockets.** Subscriptions go to `api.devnet.solana.com` / `api.mainnet-beta.solana.com`
  directly; they carry no key and the app confirms by polling through the proxy anyway.
