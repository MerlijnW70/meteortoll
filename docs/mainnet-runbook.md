# Mainnet runbook

The order matters: each stage needs the one before it, and the tokens' metadata is served by the
site, so the site switches to mainnet before the first problem launches. Every command after the
build is run from the repository root on Windows, with:

```sh
export TOLL_CLUSTER=mainnet
export TOLL_RPC='https://mainnet.helius-rpc.com/?api-key=…'   # a paid RPC: a deploy sends hundreds of transactions
```

`client/` reads its keypair from `.keys/mainnet.json` (the deploy payer, upgrade authority and
launchpad admin) and keeps what it creates in `client/state/mainnet.json`.

## 0. Before spending anything

```sh
bash scripts/build.sh                          # in the WSL distro: the program and its IDL
npm --prefix client run toll -- preflight
```

`preflight` checks that the RPC really serves mainnet (by genesis hash), prints the local
program's size and sha256, and compares the wallet's balance with what the remaining stages cost,
from live rent: the deploy holds the program's rent twice at its peak (buffer and program data) and
returns the buffer's half when it finishes. It says `go` or `no go` and exits non-zero on `no go`.

## 1. Deploy the program

In the WSL distro:

```sh
solana program deploy \
  --url "$TOLL_RPC" --use-rpc --with-compute-unit-price 50000 --max-sign-attempts 50 \
  --program-id programs/toll/toll-keypair.json \
  /home/dev/target-meteortoll/deploy/toll.so
```

An interrupted deploy leaves a buffer that holds its rent: `solana program show --buffers` lists
it, and the same deploy command with `--buffer <address>` resumes it, or `solana program close
<address>` returns the rent.

Then `preflight` again: it must report that the deployed program is byte for byte the local build,
and the upgrade authority.

## 2. Launch config and launchpad

```sh
npm --prefix client run toll -- setup          # the mainnet profile and a grace window of 9000 slots
```

## 3. Switch the site to mainnet

1. Put the launchpad address `setup` printed in `LAUNCHPADS.mainnet` (`app/src/lib/config.ts`).
2. In Vercel, set `NEXT_PUBLIC_CLUSTER=mainnet` and a mainnet `SOLANA_RPC_URL` for production.
3. Push to `main` and wait for the deploy; `/launch` and `/api/stats` must load.

## 4. Launch the problems

```sh
npm --prefix client run toll -- launch 2 12 15 277 --name "2x12x15 rank<=277" --symbol MM21215
```

One per problem. Each token's metadata points at `https://meteortoll.vercel.app/api/metadata/<mint>`
(`TOLL_SITE` changes the site), so wallets and Jupiter show the problem's name, description and
image. The Launch page does the same with a first buy in the creating transaction.

Add every problem to `problems/catalog.json` under `mainnet` (a disclosed demo with `kind: "demo"`
and its `demoNote`), push, and check each problem page.

## 5. Keep it running

- Keeper: set the repository variable `CLUSTER=mainnet`, give the keeper wallet a little mainnet
  SOL for fees (it pays about 0.00001 SOL per transaction), and give the workflow a mainnet
  `SOLANA_RPC_URL` secret.
- Upgrade authority: hand it to a multisig, or revoke it, before any public bounty is large:
  `solana program set-upgrade-authority 3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey --new-upgrade-authority <multisig vault>`.
  `preflight` shows the current authority.
