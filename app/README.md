# meteortoll web app

The site at https://meteortoll.vercel.app: problems, trading on the DBC curve, the in-browser
verifier, the solve flow, launches and the portfolio. See the repository README for how the
whole system works.

## Run

From the repository root (npm workspaces):

```bash
npm install
npm run dev -w app      # http://localhost:3000
npm test -w app         # unit tests in src/lib
npm run build -w app
```

## Environment

| Variable | Where it is read | Purpose |
|---|---|---|
| `SOLANA_RPC_URL` | server only (`src/lib/server.ts`) | The keyed RPC the `/api/rpc` proxy forwards to. Never give it a `NEXT_PUBLIC_` name: those are shipped to browsers |
| `NEXT_PUBLIC_CLUSTER` | `src/lib/config.ts` | `devnet` (default) or `mainnet` |
| `NEXT_PUBLIC_LAUNCHPAD` | `src/lib/config.ts` | The toll program's launchpad account |
| `NEXT_PUBLIC_SITE_URL` | `src/lib/server.ts` | Absolute URLs for share cards and token metadata |
| `NEXT_PUBLIC_RPC` | `src/lib/config.ts` | Overrides the browser's RPC (normally the same-origin proxy); only for local work, and never a keyed URL |
| `NEXT_PUBLIC_DEV_BURNER` | `src/app/providers.tsx` | `1` enables a throwaway test wallet, and only on a `localhost` page |

Keep secrets in `.env.local`, which is never committed or uploaded. What the site protects and how
is in `docs/security.md`.
