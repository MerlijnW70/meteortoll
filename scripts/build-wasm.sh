#!/usr/bin/env bash
# Build the browser verifier and copy it into the app's public folder.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build -p verifier-wasm --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/verifier_wasm.wasm app/public/verifier.wasm
ls -l app/public/verifier.wasm
