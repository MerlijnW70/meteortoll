use anchor_lang::prelude::*;
use meteortoll::check::{Check, Verdict};

use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus, Failed, Problem, Solved};
use crate::submission;

/// Permissionless crank: advances the check by `budget` units. A scheme that holds solves
/// the problem unless an attempt committed no later already holds; one that fails, or turns
/// out malformed, forfeits the bond to the problem.
#[derive(Accounts)]
pub struct Verify<'info> {
    pub cranker: Signer<'info>,
    #[account(mut)]
    pub problem: Box<Account<'info, Problem>>,
    #[account(
        mut,
        has_one = problem,
        has_one = submission @ TollError::BadSubmission,
        constraint = attempt.status == AttemptStatus::Revealed @ TollError::WrongStatus,
    )]
    pub attempt: Box<Account<'info, Attempt>>,
    /// CHECK: matched to the attempt above and read through `submission::scheme`
    #[account(owner = crate::ID @ TollError::BadSubmission)]
    pub submission: UncheckedAccount<'info>,
}

pub fn handle_verify(ctx: Context<Verify>, budget: u32) -> Result<()> {
    let slot = Clock::get()?.slot;
    require!(!ctx.accounts.problem.finalized(slot), TollError::AlreadySolved);
    let attempt_key = ctx.accounts.attempt.key();

    let verdict = {
        let data = ctx.accounts.submission.try_borrow_data()?;
        let scheme = submission::scheme(&data, &attempt_key)?;
        let mut check = Check::restore(&ctx.accounts.attempt.check)
            .map_err(|_| error!(TollError::WrongStatus))?;
        let verdict = check.run(scheme, budget).unwrap_or(Verdict::Fails);
        ctx.accounts.attempt.check = check.save();
        verdict
    };

    match verdict {
        Verdict::Running => {}
        Verdict::Holds => {
            let rank = Check::restore(&ctx.accounts.attempt.check)
                .map_err(|_| error!(TollError::WrongStatus))?
                .header()
                .rank;
            let solver = ctx.accounts.attempt.solver;
            let committed_slot = ctx.accounts.attempt.committed_slot;
            ctx.accounts.attempt.status = AttemptStatus::Holds;
            let problem = &mut ctx.accounts.problem;
            if problem.takes_over(committed_slot) {
                if problem.solver.is_none() {
                    problem.solved_at_slot = slot;
                }
                problem.solver = Some(solver);
                problem.solved_rank = rank;
                problem.solver_commit_slot = committed_slot;
                emit!(Solved { problem: problem.key(), solver, rank, committed_slot });
            }
        }
        Verdict::Fails => {
            let bond = ctx.accounts.attempt.bond;
            ctx.accounts.attempt.bond = 0;
            ctx.accounts.attempt.status = AttemptStatus::Fails;
            ctx.accounts.attempt.sub_lamports(bond)?;
            ctx.accounts.problem.add_lamports(bond)?;
            emit!(Failed { problem: ctx.accounts.problem.key(), solver: ctx.accounts.attempt.solver });
        }
    }
    Ok(())
}
