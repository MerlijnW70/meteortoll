# Security policy

The toll program holds bounties and bonds in SOL, so a flaw in it, in the browser verifier or in the
site's transactions can cost people money. Please report it privately first.

## Reporting a vulnerability

Use GitHub's private reporting: the **Security** tab of this repository, then **Report a
vulnerability**. Please do not open a public issue, and do not try a flaw against a live problem's
funds.

A useful report says what is affected (program instruction, verifier, site), how to reproduce it
(a LiteSVM test, a scheme file or a transaction is ideal), and what an attacker gains.

## Scope

- The toll program (`programs/toll`), its verifier core (`src/`) and the WebAssembly verifier
  (`crates/verifier-wasm`).
- The site (`app/`), including the transactions it builds and its API routes.

Meteora's Dynamic Bonding Curve and DAMM v2 programs are Meteora's; report issues in them to
Meteora.

## What to expect

An answer within a few days. A confirmed flaw is fixed before it is disclosed, and the reporter is
credited unless they ask not to be.

The program's upgrade authority, audit status and known limits are on the site's How it works page.
