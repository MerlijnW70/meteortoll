use anchor_lang::prelude::*;

pub const LAUNCHPAD_SEED: &[u8] = b"launchpad";
pub const PROBLEM_SEED: &[u8] = b"problem";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ATTEMPT_SEED: &[u8] = b"attempt";

pub const COMMIT_DOMAIN: &[u8] = b"meteortoll/commit/v1";
pub const SEED_DOMAIN: &[u8] = b"meteortoll/seed/v1";

pub const MIN_GRACE_SLOTS: u64 = 150;
pub const MAX_GRACE_SLOTS: u64 = 216_000;

#[constant]
pub const BOND_LAMPORTS: u64 = 50_000_000;

#[constant]
pub const MAX_SCHEME_LEN: u32 = 1 << 20;

#[constant]
pub const VERIFY_BUDGET: u32 = 2_000;
