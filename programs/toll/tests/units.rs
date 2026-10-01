//! Boundary tests for the program's pure helpers: the submission buffer layout and the solve
//! timing rules. They run natively, without the SBF build the LiteSVM tests need.

use anchor_lang::error::{Error, ERROR_CODE_OFFSET};
use anchor_lang::prelude::Pubkey;
use toll::error::TollError;
use toll::submission::{self, HEADER_LEN, MAGIC};
use toll::{Problem, MAX_SCHEME_LEN};

fn code(result: Result<impl Sized, Error>) -> u32 {
    match result {
        Err(Error::AnchorError(error)) => error.error_code_number,
        Err(other) => panic!("not an Anchor error: {other:?}"),
        Ok(_) => panic!("expected an error"),
    }
}

fn toll(error: TollError) -> u32 {
    ERROR_CODE_OFFSET + error as u32
}

fn opened(attempt: &Pubkey, len: u32) -> Vec<u8> {
    let mut data = vec![0u8; HEADER_LEN + len as usize];
    submission::open(&mut data, attempt, len).unwrap();
    data
}

#[test]
fn open_writes_the_header() {
    let attempt = Pubkey::new_unique();
    let data = opened(&attempt, 300);
    assert_eq!(data[..8], MAGIC);
    assert_eq!(data[8..40], *attempt.as_ref());
    assert_eq!(data[40..44], 300u32.to_le_bytes());
    assert!(data[HEADER_LEN..].iter().all(|b| *b == 0));
}

#[test]
fn open_bounds_the_length() {
    let attempt = Pubkey::new_unique();
    let mut empty = vec![0u8; HEADER_LEN + 8];
    assert_eq!(code(submission::open(&mut empty, &attempt, 0)), toll(TollError::BadSubmission));

    // Exactly the maximum fits; one more does not, even with room in the buffer.
    let mut max = vec![0u8; HEADER_LEN + MAX_SCHEME_LEN as usize + 1];
    assert!(submission::open(&mut max, &attempt, MAX_SCHEME_LEN).is_ok());
    let mut over = vec![0u8; HEADER_LEN + MAX_SCHEME_LEN as usize + 1];
    assert_eq!(code(submission::open(&mut over, &attempt, MAX_SCHEME_LEN + 1)), toll(TollError::BadSubmission));
}

#[test]
fn open_needs_room_for_the_scheme() {
    let attempt = Pubkey::new_unique();
    let mut exact = vec![0u8; HEADER_LEN + 10];
    assert!(submission::open(&mut exact, &attempt, 10).is_ok());
    let mut short = vec![0u8; HEADER_LEN + 9];
    assert_eq!(code(submission::open(&mut short, &attempt, 10)), toll(TollError::BadSubmission));
}

#[test]
fn open_refuses_a_used_buffer() {
    let attempt = Pubkey::new_unique();
    let mut data = opened(&attempt, 10);
    assert_eq!(code(submission::open(&mut data, &attempt, 10)), toll(TollError::BadSubmission));
    // Any single nonzero header byte is enough to refuse.
    let mut dirty = vec![0u8; HEADER_LEN + 10];
    dirty[HEADER_LEN - 1] = 1;
    assert_eq!(code(submission::open(&mut dirty, &attempt, 10)), toll(TollError::BadSubmission));
}

/// Clients (`packages/core` SUBMISSION_HEADER) write the scheme at byte 44; the layout must not drift.
#[test]
fn scheme_starts_at_byte_44() {
    let attempt = Pubkey::new_unique();
    let mut data = vec![0u8; 44 + 3];
    submission::open(&mut data, &attempt, 3).unwrap();
    data[44..47].copy_from_slice(&[6, 5, 4]);
    assert_eq!(submission::scheme(&data, &attempt).unwrap(), &[6, 5, 4]);
    submission::write(&mut data, &attempt, 1, &[9]).unwrap();
    assert_eq!(data[44..47], [6, 9, 4]);
}

#[test]
fn scheme_returns_exactly_the_declared_bytes() {
    let attempt = Pubkey::new_unique();
    let mut data = opened(&attempt, 4);
    data.extend_from_slice(&[9, 9]); // trailing space beyond the declared length
    data[HEADER_LEN..HEADER_LEN + 4].copy_from_slice(&[1, 2, 3, 4]);
    assert_eq!(submission::scheme(&data, &attempt).unwrap(), &[1, 2, 3, 4]);
}

#[test]
fn scheme_checks_magic_owner_and_length() {
    let attempt = Pubkey::new_unique();
    let data = opened(&attempt, 4);
    assert_eq!(code(submission::scheme(&data, &Pubkey::new_unique())), toll(TollError::BadSubmission));

    let mut magic = data.clone();
    magic[0] ^= 1;
    assert_eq!(code(submission::scheme(&magic, &attempt)), toll(TollError::BadSubmission));

    let mut truncated = data.clone();
    truncated.pop();
    assert_eq!(code(submission::scheme(&truncated, &attempt)), toll(TollError::BadSubmission));

    assert_eq!(code(submission::scheme(&data[..HEADER_LEN - 1], &attempt)), toll(TollError::BadSubmission));
    assert_eq!(submission::scheme(&data[..HEADER_LEN + 4], &attempt).unwrap().len(), 4);
}

#[test]
fn write_stays_inside_the_scheme() {
    let attempt = Pubkey::new_unique();
    let mut data = opened(&attempt, 6);
    submission::write(&mut data, &attempt, 2, &[7, 8, 9, 10]).unwrap();
    assert_eq!(data[HEADER_LEN..], [0, 0, 7, 8, 9, 10]);
    submission::write(&mut data, &attempt, 0, &[5]).unwrap();
    assert_eq!(data[HEADER_LEN], 5);

    assert_eq!(code(submission::write(&mut data, &attempt, 3, &[1, 1, 1, 1])), toll(TollError::OutOfBounds));
    assert_eq!(code(submission::write(&mut data, &attempt, u32::MAX, &[1])), toll(TollError::OutOfBounds));
    assert_eq!(code(submission::write(&mut data, &Pubkey::new_unique(), 0, &[1])), toll(TollError::BadSubmission));
    assert_eq!(data[HEADER_LEN..], [5, 0, 7, 8, 9, 10]);
}

fn problem(solver: Option<Pubkey>, commit: u64, solved_at: u64, grace: u64) -> Problem {
    Problem {
        launchpad: Pubkey::default(),
        pool: Pubkey::default(),
        base_mint: Pubkey::default(),
        quote_mint: Pubkey::default(),
        base_vault: Pubkey::default(),
        quote_vault: Pubkey::default(),
        n1: 2,
        n2: 2,
        n3: 2,
        target_rank: 7,
        solver,
        solved_rank: 7,
        solver_commit_slot: commit,
        solved_at_slot: solved_at,
        grace_slots: grace,
        attempts: 1,
        bump: 255,
    }
}

#[test]
fn finalized_after_exactly_the_grace_window() {
    let solved = problem(Some(Pubkey::new_unique()), 90, 100, 50);
    assert!(!solved.finalized(149));
    assert!(solved.finalized(150));
    assert!(solved.finalized(151));
    assert!(!problem(None, 0, 0, 0).finalized(u64::MAX));
    // The deadline saturates instead of wrapping to an early slot.
    assert!(!problem(Some(Pubkey::new_unique()), 0, u64::MAX - 1, 10).finalized(5));
}

#[test]
fn only_a_strictly_earlier_commitment_takes_over() {
    assert!(problem(None, 0, 0, 0).takes_over(1_000));
    let solved = problem(Some(Pubkey::new_unique()), 90, 100, 50);
    assert!(solved.takes_over(89));
    assert!(!solved.takes_over(90));
    assert!(!solved.takes_over(91));
}
