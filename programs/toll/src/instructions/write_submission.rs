use anchor_lang::prelude::*;

use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus};
use crate::submission;

#[derive(Accounts)]
pub struct WriteSubmission<'info> {
    pub solver: Signer<'info>,
    #[account(
        has_one = solver,
        has_one = submission @ TollError::BadSubmission,
        constraint = attempt.status == AttemptStatus::Committed @ TollError::WrongStatus,
    )]
    pub attempt: Box<Account<'info, Attempt>>,
    /// CHECK: matched to the attempt above and read through `submission::write`
    #[account(mut, owner = crate::ID @ TollError::BadSubmission)]
    pub submission: UncheckedAccount<'info>,
}

pub fn handle_write_submission(ctx: Context<WriteSubmission>, offset: u32, bytes: Vec<u8>) -> Result<()> {
    let attempt_key = ctx.accounts.attempt.key();
    submission::write(&mut ctx.accounts.submission.try_borrow_mut_data()?, &attempt_key, offset, &bytes)
}
