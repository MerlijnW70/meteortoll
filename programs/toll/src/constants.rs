pub const LAUNCHPAD_SEED: &[u8] = b"launchpad";
pub const PROBLEM_SEED: &[u8] = b"problem";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ATTEMPT_SEED: &[u8] = b"attempt";

pub const COMMIT_DOMAIN: &[u8] = b"meteortoll/commit/v1";
pub const SEED_DOMAIN: &[u8] = b"meteortoll/seed/v1";

/// Lamports a solver stakes on an attempt; kept by the problem if the scheme fails.
pub const BOND_LAMPORTS: u64 = 50_000_000;

/// Largest scheme a submission buffer may hold.
pub const MAX_SCHEME_LEN: u32 = 1 << 20;
