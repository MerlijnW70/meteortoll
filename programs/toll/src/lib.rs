pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod submission;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey");

declare_program!(dynamic_bonding_curve);
declare_program!(cp_amm);

#[program]
pub mod toll {
    use super::*;

    pub fn init_launchpad(ctx: Context<InitLaunchpad>, dbc_config: Pubkey, grace_slots: u64) -> Result<()> {
        instructions::init_launchpad::handle_init_launchpad(ctx, dbc_config, grace_slots)
    }

    pub fn register_problem(
        ctx: Context<RegisterProblem>,
        n1: u8,
        n2: u8,
        n3: u8,
        target_rank: u32,
    ) -> Result<()> {
        instructions::register_problem::handle_register_problem(ctx, n1, n2, n3, target_rank)
    }

    pub fn sweep_trading_fees(ctx: Context<SweepTradingFees>) -> Result<()> {
        instructions::sweep_trading_fees::handle_sweep_trading_fees(ctx)
    }

    pub fn sweep_surplus(ctx: Context<SweepSurplus>) -> Result<()> {
        instructions::sweep_surplus::handle_sweep_surplus(ctx)
    }

    pub fn sweep_position_fees(ctx: Context<SweepPositionFees>) -> Result<()> {
        instructions::sweep_position_fees::handle_sweep_position_fees(ctx)
    }

    pub fn commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        instructions::commit::handle_commit(ctx, commitment)
    }

    pub fn open_submission(ctx: Context<OpenSubmission>, len: u32) -> Result<()> {
        instructions::open_submission::handle_open_submission(ctx, len)
    }

    pub fn write_submission(ctx: Context<WriteSubmission>, offset: u32, bytes: Vec<u8>) -> Result<()> {
        instructions::write_submission::handle_write_submission(ctx, offset, bytes)
    }

    pub fn reveal(ctx: Context<Reveal>, salt: [u8; 32]) -> Result<()> {
        instructions::reveal::handle_reveal(ctx, salt)
    }

    pub fn verify(ctx: Context<Verify>, budget: u32) -> Result<()> {
        instructions::verify::handle_verify(ctx, budget)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }

    pub fn close_attempt(ctx: Context<CloseAttempt>) -> Result<()> {
        instructions::close_attempt::handle_close_attempt(ctx)
    }
}
