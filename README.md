# meteortoll

meteortoll is a DeSci launchpad on Meteora's Dynamic Bonding Curve. Every token is an open math
problem: multiply two matrices with fewer multiplications than the best published scheme. Trading
the token funds the problem's bounty, held by a Solana program. Whoever finds a better scheme
checks it for free in the browser and submits it; the program verifies it on-chain and pays the
first valid answer. No judges, no committee: the math decides.

Live at **https://meteortoll.vercel.app** (devnet).

## Quickstart for judges

### Try it in the browser

1. Switch a Solana wallet to devnet and get devnet SOL from the [faucet](https://faucet.solana.com).
2. Open the [demo problem ⟨7×7×9 : ≤314⟩](https://meteortoll.vercel.app/p/HLHmqukEVUYqtWY6V6k5tiP6YRhPxY78z6gf64Y6kpvc)
   and buy some of its token; its trading fees fund the prize.
3. Download [a scheme that solves it](https://meteortoll.vercel.app/samples/7x7x9-rank314.bin).
4. Drop the file on the [solve page](https://meteortoll.vercel.app/solve). The browser checks it;
   no wallet needed.
5. Click **Commit and stake 0.05 SOL**, then **Upload, reveal and verify**. The program verifies
   the scheme on-chain. When the grace window ends, **Claim** pays out the prize and the bond.

Both 7×7×9 problems are disclosed demos: the team found this rank-314 scheme, which beats the
published 315. If someone already solved the demo, its page shows the verified result instead, like
[this finished one](https://meteortoll.vercel.app/p/3dfmHk3tf5dU4c55vjAs7mwYuYoezt8bT4ez3G19xQ2H).

### Devnet addresses

| | |
|---|---|
| toll program | [`3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey`](https://explorer.solana.com/address/3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey?cluster=devnet) |
| launchpad | [`5ZMaqTZ1TgytdTG1EFCuGZg9hSKALfFMuJSg2WT2CJa4`](https://explorer.solana.com/address/5ZMaqTZ1TgytdTG1EFCuGZg9hSKALfFMuJSg2WT2CJa4?cluster=devnet) |
| DBC config | [`Z4PT2dz65c2AW7jVYCoArmRvDSuLqZhQ7AnqFA2y1wT`](https://explorer.solana.com/address/Z4PT2dz65c2AW7jVYCoArmRvDSuLqZhQ7AnqFA2y1wT?cluster=devnet) |

### Run the app and tests

Node 22 and stable Rust:

```bash
npm ci
npm test -w app                    # app
npm test -w client                 # operator CLI
cargo test -p meteortoll           # verifier core
npm run build -w app && npm run start -w app    # http://localhost:3000, on devnet
```

### Build and test the program

Solana CLI 4.1 and Anchor 1.2. The tests run against Meteora's and Metaplex's programs, dumped
from mainnet:

```bash
mkdir -p programs/toll/tests/fixtures
solana program dump -u mainnet-beta dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN programs/toll/tests/fixtures/dbc.so
solana program dump -u mainnet-beta cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG programs/toll/tests/fixtures/damm_v2.so
solana program dump -u mainnet-beta metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s programs/toll/tests/fixtures/mpl_token_metadata.so
anchor build --arch v0
cargo test -p toll
```

The build matches the deployed devnet program byte for byte:

```bash
solana program dump -u devnet 3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey devnet.so
cmp target/deploy/toll.so <(head -c "$(stat -c%s target/deploy/toll.so)" devnet.so) && echo match
```

### Where things are

| Path | What |
|---|---|
| `programs/toll/` | Solana program: bounties, commit/reveal, on-chain verification, payout |
| `src/` | verifier core, `no_std` Rust, shared by the program and the browser |
| `crates/verifier-wasm/` | the verifier core built for the browser |
| `app/` | the site (Next.js) |
| `client/` | operator CLI: launchpad setup, launches, fee sweeps |
| `packages/core/` | shared TypeScript: accounts, scheme encoding, launch parameters |
| `problems/` | problem catalog, best-known ranks, launch economics |

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE). Third-party parts:
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Security reports: [`SECURITY.md`](SECURITY.md).
