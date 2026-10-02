use anchor_lang::prelude::*;

use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus};
use crate::submission;

#[derive(Accounts)]
pub struct OpenSubmission<'info> {
    pub solver: Signer<'info>,
    #[account(
        mut,
        has_one = solver,
        constraint = attempt.status == AttemptStatus::Committed @ TollError::WrongStatus,
        constraint = attempt.submission == Pubkey::default() @ TollError::BadSubmission,
    )]
    pub attempt: Box<Account<'info, Attempt>>,
    #[account(mut, owner = crate::ID @ TollError::BadSubmission)]
    pub submission: Signer<'info>,
}

pub fn handle_open_submission(ctx: Context<OpenSubmission>, len: u32) -> Result<()> {
    let attempt_key = ctx.accounts.attempt.key();
    submission::open(&mut ctx.accounts.submission.try_borrow_mut_data()?, &attempt_key, len)?;
    ctx.accounts.attempt.submission = ctx.accounts.submission.key();
    Ok(())
}
