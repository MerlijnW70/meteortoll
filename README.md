# meteortoll

meteortoll is a DeSci launchpad on Meteora's Dynamic Bonding Curve. Every token is an open math
problem: multiply two matrices with fewer multiplications than the best published scheme. Trading
the token funds the problem's bounty, held by a Solana program. Whoever finds a better scheme
checks it for free in the browser and submits it; the program verifies it on-chain and pays the
first valid answer. No judges, no committee: the math decides.

Live at **https://meteortoll.vercel.app**

```bash
npm install && npm test -w app               # app tests
npm run build -w app                         # web app
scripts/build.sh test                        # Solana program and its tests
```

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE). Third-party parts:
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Security reports: [`SECURITY.md`](SECURITY.md).
