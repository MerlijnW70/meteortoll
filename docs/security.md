# Web app security

What the site at `app/` protects, how, and what is knowingly left open. The on-chain program's
rules are in `SCOPE.md`; this covers the website.

## Protections

| Risk | Protection | Where |
|---|---|---|
| RPC key leaking to browsers | The key lives only in the server variable `SOLANA_RPC_URL`; browsers call `/api/rpc`. Checked after each deploy: no client script contains it | `app/src/app/api/rpc/route.ts`, `app/src/lib/server.ts` |
| Other sites spending our RPC through their visitors | `/api/rpc` refuses requests whose `Origin` is another host | same |
| RPC abuse | Method allowlist; `getProgramAccounts` only for the toll program; bodies ≤ 64 KiB; batches ≤ 50; a per-instance budget per client address | same |
| Clickjacking a transaction approval | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | `app/next.config.ts` |
| Injected scripts and exfiltration | Content Security Policy: scripts and connections limited to this origin and Solana's public websocket endpoints; no `object`, no foreign `base` or `form` targets | same |
| MIME sniffing, referrer leaks, device APIs | `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera, microphone, location, payment | same |
| A test key wallet reaching users | The dev wallet needs both the build flag `NEXT_PUBLIC_DEV_BURNER=1` and a `localhost` page; `.env.local` is never uploaded (`.vercelignore` is an allowlist) | `app/src/app/providers.tsx`, `.vercelignore` |
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
