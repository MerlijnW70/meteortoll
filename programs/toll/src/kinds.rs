use anchor_lang::prelude::*;
use meteortoll::check::{Check, STATE_LEN, Seed, Verdict};
use meteortoll::scheme::Header;

use crate::constants::{CHECK_CAPACITY, KIND_MATRIX};
use crate::error::TollError;
use crate::state::Problem;

pub fn start(problem: &Problem, scheme: &[u8], seed: &Seed) -> Result<[u8; CHECK_CAPACITY]> {
    match problem.kind {
        KIND_MATRIX => matrix_start(problem, scheme, seed),
        _ => err!(TollError::UnknownKind),
    }
}

pub fn run(kind: u8, state: &mut [u8; CHECK_CAPACITY], scheme: &[u8], budget: u32) -> Result<(Verdict, u32)> {
    match kind {
        KIND_MATRIX => matrix_run(state, scheme, budget),
        _ => err!(TollError::UnknownKind),
    }
}

fn matrix_start(problem: &Problem, scheme: &[u8], seed: &Seed) -> Result<[u8; CHECK_CAPACITY]> {
    let header = Header::parse(scheme).map_err(|_| error!(TollError::SchemeDoesNotAnswer))?;
    require!(
        (header.n1, header.n2, header.n3) == (problem.n1, problem.n2, problem.n3) && header.rank <= problem.target_rank,
        TollError::SchemeDoesNotAnswer
    );
    let check = Check::start(scheme, seed).map_err(|_| error!(TollError::SchemeDoesNotAnswer))?;
    let mut state = [0u8; CHECK_CAPACITY];
    state[..STATE_LEN].copy_from_slice(&check.save());
    Ok(state)
}

fn matrix_run(state: &mut [u8; CHECK_CAPACITY], scheme: &[u8], budget: u32) -> Result<(Verdict, u32)> {
    let mut saved = [0u8; STATE_LEN];
    saved.copy_from_slice(&state[..STATE_LEN]);
    let mut check = Check::restore(&saved).map_err(|_| error!(TollError::WrongStatus))?;
    let verdict = check.run(scheme, budget).unwrap_or(Verdict::Fails);
    state[..STATE_LEN].copy_from_slice(&check.save());
    Ok((verdict, check.header().rank))
}
