#!/usr/bin/env bash
# Mutation-test the toll program with cargo-mutants inside the `meteortoll` WSL distro. Slow: every
# mutant rebuilds the SBF program. Works on a copy in the WSL filesystem; results go to
# ~/mutants-toll/mutants.out (caught.txt, missed.txt, timeout.txt, unviable.txt).
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)"
stage="$HOME/mutants-toll"
rm -rf "$stage/tree"
mkdir -p "$stage/tree"
cd "$src"
cp -r .cargo Cargo.toml Cargo.lock Anchor.toml src tests idls crates programs "$stage/tree/"
cd "$stage/tree"
CARGO="$src/scripts/mutants-cargo.sh" cargo-mutants mutants \
  --package toll --file 'programs/toll/src/**/*.rs' \
  --jobs "${JOBS:-6}" --timeout 900 --build-timeout 900 --output "$stage" "$@"
