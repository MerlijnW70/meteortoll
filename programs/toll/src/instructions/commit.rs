use anchor_lang::prelude::*;
use anchor_lang::system_program::{Transfer, transfer};

use crate::constants::{ATTEMPT_SEED, BOND_LAMPORTS};
use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus, Problem};

/// Fixes a solution by its hash before the seed that will test it exists, and stakes the bond.
#[derive(Accounts)]
pub struct Commit<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,
    #[account(mut)]
    pub problem: Box<Account<'info, Problem>>,
    #[account(
        init,
        payer = solver,
        space = 8 + Attempt::INIT_SPACE,
        seeds = [ATTEMPT_SEED, problem.key().as_ref(), solver.key().as_ref()],
        bump
    )]
    pub attempt: Box<Account<'info, Attempt>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
    require!(ctx.accounts.problem.solver.is_none(), TollError::AlreadySolved);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.solver.to_account_info(),
                to: ctx.accounts.attempt.to_account_info(),
            },
        ),
        BOND_LAMPORTS,
    )?;

    let attempt = &mut ctx.accounts.attempt;
    attempt.problem = ctx.accounts.problem.key();
    attempt.solver = ctx.accounts.solver.key();
    attempt.commitment = commitment;
    attempt.committed_slot = Clock::get()?.slot;
    attempt.submission = Pubkey::default();
    attempt.seed_slot = 0;
    attempt.status = AttemptStatus::Committed;
    attempt.check = [0; 47];
    attempt.bond = BOND_LAMPORTS;
    attempt.bump = ctx.bumps.attempt;

    let problem = &mut ctx.accounts.problem;
    problem.attempts = problem.attempts.saturating_add(1);
    Ok(())
}
