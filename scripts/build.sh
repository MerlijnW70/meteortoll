#!/usr/bin/env bash
# Build the toll program and run its LiteSVM tests. Run inside the `meteortoll` WSL distro.
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/target-meteortoll}"
mkdir -p "$CARGO_TARGET_DIR/deploy"
cp programs/toll/toll-keypair.json "$CARGO_TARGET_DIR/deploy/toll-keypair.json"
anchor build --arch v0
if [ "${1:-}" = "test" ]; then
  shift
  cargo test -p toll "$@"
fi
