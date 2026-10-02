use anchor_lang::prelude::*;
use meteortoll::check::STATE_LEN;

#[account]
#[derive(InitSpace)]
pub struct Launchpad {
    pub admin: Pubkey,
    pub dbc_config: Pubkey,
    pub grace_slots: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Problem {
    pub launchpad: Pubkey,
    pub pool: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub n1: u8,
    pub n2: u8,
    pub n3: u8,
    pub target_rank: u32,
    pub solver: Option<Pubkey>,
    pub solved_rank: u32,
    pub solver_commit_slot: u64,
    pub solved_at_slot: u64,
    pub grace_slots: u64,
    pub attempts: u32,
    pub bump: u8,
}

impl Problem {
    /// A solve becomes final once the grace window after the first holding check has passed.
    /// Until then an attempt committed earlier can still take the solve, because a copier only
    /// sees a scheme once it is uploaded, which is always after its author committed.
    #[must_use]
    pub fn finalized(&self, slot: u64) -> bool {
        self.solver.is_some() && slot >= self.solved_at_slot.saturating_add(self.grace_slots)
    }

    /// Whether a holding attempt committed at `committed_slot` becomes the solver.
    #[must_use]
    pub fn takes_over(&self, committed_slot: u64) -> bool {
        self.solver.is_none() || committed_slot < self.solver_commit_slot
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AttemptStatus {
    Committed,
    Revealed,
    Holds,
    Fails,
}

#[account]
#[derive(InitSpace)]
pub struct Attempt {
    pub problem: Pubkey,
    pub solver: Pubkey,
    pub commitment: [u8; 32],
    pub committed_slot: u64,
    pub submission: Pubkey,
    pub seed_slot: u64,
    pub status: AttemptStatus,
    pub check: [u8; STATE_LEN],
    pub bond: u64,
    pub bump: u8,
}



#[event]
pub struct Solved {
    pub problem: Pubkey,
    pub solver: Pubkey,
    pub rank: u32,
    pub committed_slot: u64,
}

#[event]
pub struct Failed {
    pub problem: Pubkey,
    pub solver: Pubkey,
}

/// What a claim paid the solver: both vaults and the forfeited bonds the problem held.
#[event]
pub struct Claimed {
    pub problem: Pubkey,
    pub solver: Pubkey,
    pub base: u64,
    pub quote: u64,
    pub bonds: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SweepSource {
    TradingFees,
    Surplus,
    PositionFees,
}

/// What a sweep moved into the problem's vaults, measured on the vaults themselves.
#[event]
pub struct Swept {
    pub problem: Pubkey,
    pub source: SweepSource,
    pub base: u64,
    pub quote: u64,
}
