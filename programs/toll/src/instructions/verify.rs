use anchor_lang::prelude::*;
use meteortoll::check::Verdict;

use crate::error::TollError;
use crate::kinds;
use crate::state::{Attempt, AttemptStatus, Failed, Problem, Solved};
use crate::submission;

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

    let kind = ctx.accounts.problem.kind;
    let (verdict, rank) = {
        let data = ctx.accounts.submission.try_borrow_data()?;
        let scheme = submission::scheme(&data, &attempt_key)?;
        let mut state = ctx.accounts.attempt.check;
        let outcome = kinds::run(kind, &mut state, scheme, budget)?;
        ctx.accounts.attempt.check = state;
        outcome
    };

    match verdict {
        Verdict::Running => {}
        Verdict::Holds => {
            let solver = ctx.accounts.attempt.solver;
            let committed_slot = ctx.accounts.attempt.committed_slot;
            ctx.accounts.attempt.status = AttemptStatus::Holds;
            let problem = &mut ctx.accounts.problem;
            problem.pending = problem.pending.saturating_sub(1);
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
            ctx.accounts.problem.pending = ctx.accounts.problem.pending.saturating_sub(1);
            ctx.accounts.attempt.sub_lamports(bond)?;
            ctx.accounts.problem.add_lamports(bond)?;
            emit!(Failed { problem: ctx.accounts.problem.key(), solver: ctx.accounts.attempt.solver });
        }
    }
    Ok(())
}
