use anchor_lang::prelude::*;
use solana_sdk_ids::sysvar::slot_hashes;
use solana_sha256_hasher::hashv;
use meteortoll::check::{Check, Seed};
use meteortoll::scheme::Header;

use crate::constants::{COMMIT_DOMAIN, SEED_DOMAIN};
use crate::error::TollError;
use crate::state::{Attempt, AttemptStatus, Problem};
use crate::submission;

/// Checks the uploaded scheme against the commitment, then fixes the random point from the
/// newest slot hash, which did not exist when the commitment was made.
#[derive(Accounts)]
pub struct Reveal<'info> {
    pub solver: Signer<'info>,
    pub problem: Box<Account<'info, Problem>>,
    #[account(
        mut,
        has_one = solver,
        has_one = problem,
        has_one = submission @ TollError::BadSubmission,
        constraint = attempt.status == AttemptStatus::Committed @ TollError::WrongStatus,
    )]
    pub attempt: Box<Account<'info, Attempt>>,
    /// CHECK: matched to the attempt above and read through `submission::scheme`
    #[account(owner = crate::ID @ TollError::BadSubmission)]
    pub submission: UncheckedAccount<'info>,
    /// CHECK: address-checked sysvar, read raw so the whole list is never deserialized
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
}

pub fn handle_reveal(ctx: Context<Reveal>, salt: [u8; 32]) -> Result<()> {
    let problem = &ctx.accounts.problem;
    require!(!problem.finalized(Clock::get()?.slot), TollError::AlreadySolved);
    let attempt_key = ctx.accounts.attempt.key();

    let data = ctx.accounts.submission.try_borrow_data()?;
    let scheme = submission::scheme(&data, &attempt_key)?;
    let digest = hashv(&[
        COMMIT_DOMAIN,
        problem.key().as_ref(),
        ctx.accounts.solver.key().as_ref(),
        &salt,
        scheme,
    ]);
    require!(digest.to_bytes() == ctx.accounts.attempt.commitment, TollError::CommitmentMismatch);

    let header = Header::parse(scheme).map_err(|_| error!(TollError::SchemeDoesNotAnswer))?;
    require!(
        (header.n1, header.n2, header.n3) == (problem.n1, problem.n2, problem.n3)
            && header.rank <= problem.target_rank,
        TollError::SchemeDoesNotAnswer
    );

    let (slot, hash) = newest_slot_hash(&ctx.accounts.slot_hashes.try_borrow_data()?)?;
    require!(slot > ctx.accounts.attempt.committed_slot, TollError::RevealTooEarly);
    let seed = hashv(&[SEED_DOMAIN, &hash, attempt_key.as_ref()]).to_bytes();

    let check = Check::start(scheme, &Seed(seed)).map_err(|_| error!(TollError::SchemeDoesNotAnswer))?;
    drop(data);

    let attempt = &mut ctx.accounts.attempt;
    attempt.check = check.save();
    attempt.seed_slot = slot;
    attempt.status = AttemptStatus::Revealed;
    Ok(())
}

/// The sysvar is `len u64` followed by `(slot u64, hash [u8; 32])` entries, newest first.
fn newest_slot_hash(data: &[u8]) -> Result<(u64, [u8; 32])> {
    let entry = data.get(8..48).ok_or_else(|| error!(TollError::RevealTooEarly))?;
    let count = u64::from_le_bytes(data[..8].try_into().unwrap_or_default());
    require!(count > 0, TollError::RevealTooEarly);
    let slot = u64::from_le_bytes(entry[..8].try_into().unwrap_or_default());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&entry[8..]);
    Ok((slot, hash))
}
