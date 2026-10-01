#!/usr/bin/env bash
# Stand-in `cargo` for cargo-mutants (see scripts/mutants.sh). The LiteSVM tests load
# target/deploy/toll.so, so a test build first rebuilds the SBF program whenever a source changed.
set -euo pipefail
real="$HOME/.cargo/bin/cargo"
unset CARGO
if [ "${1:-}" = test ]; then
  export CARGO_TARGET_DIR="$PWD/target"
  so=target/deploy/toll.so
  if [ ! -f "$so" ] || [ -n "$(find programs/toll/src src -name '*.rs' -newer "$so" -print -quit)" ]; then
    mkdir -p target/deploy
    cp programs/toll/toll-keypair.json target/deploy/
    anchor build --arch v0 --no-idl >&2 || exit 1
  fi
fi
exec "$real" "$@"
