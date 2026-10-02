use anchor_lang::prelude::*;

pub const LAUNCHPAD_SEED: &[u8] = b"launchpad";
pub const PROBLEM_SEED: &[u8] = b"problem";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ATTEMPT_SEED: &[u8] = b"attempt";

pub const COMMIT_DOMAIN: &[u8] = b"meteortoll/commit/v1";
pub const SEED_DOMAIN: &[u8] = b"meteortoll/seed/v1";

/// Lamports a solver stakes on an attempt; kept by the problem if the scheme fails.
#[constant]
pub const BOND_LAMPORTS: u64 = 50_000_000;

/// Largest scheme a submission buffer may hold.
#[constant]
pub const MAX_SCHEME_LEN: u32 = 1 << 20;

/// Work units a client asks one `verify` call to do (one unit per stored coefficient). Every
/// known record stays well under Solana's 1.4M compute units per call at this budget; the cost
/// test asserts it. Exported in the IDL, so clients read it rather than copy it.
#[constant]
pub const VERIFY_BUDGET: u32 = 5_000;
