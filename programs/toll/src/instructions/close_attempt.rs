use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus, Problem};

#[derive(Accounts)]
pub struct CloseAttempt<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,
    pub problem: Box<Account<'info, Problem>>,
    #[account(mut, has_one = solver, has_one = problem, close = solver)]
    pub attempt: Box<Account<'info, Attempt>>,
    /// CHECK: must be the attempt's submission, or any account when it has none
    #[account(mut)]
    pub submission: UncheckedAccount<'info>,
}

pub fn handle_close_attempt(ctx: Context<CloseAttempt>) -> Result<()> {
    let attempt = &ctx.accounts.attempt;
    let finalized = ctx.accounts.problem.finalized(Clock::get()?.slot);
    let pending = attempt.status == AttemptStatus::Revealed && !finalized;
    require!(!pending, TollError::CheckPending);

    if attempt.submission != Pubkey::default() {
        let submission = &ctx.accounts.submission;
        require_keys_eq!(submission.key(), attempt.submission, TollError::BadSubmission);
        require_keys_eq!(*submission.owner, crate::ID, TollError::BadSubmission);
        let lamports = submission.lamports();
        submission.sub_lamports(lamports)?;
        ctx.accounts.solver.add_lamports(lamports)?;
        submission.resize(0)?;
        submission.assign(&system_program::ID);
    }
    Ok(())
}
