#![allow(clippy::result_large_err)] // the error type is LiteSVM's FailedTransactionMetadata; boxing it in tests buys nothing

mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use solana_signer::Signer;
use toll::state::AttemptStatus;

const SHAPE: (u8, u8, u8) = (7, 7, 9);
const RECORD: &str = "7x7x9_m314_ZT";
const RANK: u32 = 314;

fn broken(scheme: &[u8]) -> Vec<u8> {
    let mut bad = scheme.to_vec();
    let last = bad.len() - 1;
    bad[last] = (bad[last] as i8).wrapping_neg() as u8;
    bad
}

#[test]
fn registering_records_the_statement_and_creates_both_vaults() {
    let env = setup(SHAPE, RANK);
    let problem = problem(&env);
    assert_eq!((problem.n1, problem.n2, problem.n3, problem.target_rank), (7, 7, 9, RANK));
    assert_eq!((problem.pool, problem.base_vault, problem.quote_vault), (env.pool, env.base_vault, env.quote_vault));
    assert_eq!(problem.solver, None);
    assert_eq!(token_amount(&env.svm, &env.base_vault), 0);
    assert_eq!(token_amount(&env.svm, &env.quote_vault), 0);
}

#[test]
fn a_pool_whose_creator_is_not_the_problem_cannot_be_registered() {
    let mut env = bare(SHAPE, RANK);
    put_dbc_accounts(&mut env, Pubkey::new_unique());
    assert!(error_in(&register(&mut env, SHAPE, RANK), "CreatorIsNotProblem"));
}

#[test]
fn a_statement_other_than_the_one_the_creator_binds_cannot_be_registered() {
    let mut env = bare(SHAPE, RANK);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    env.problem = problem_address(&env.pool, SHAPE, RANK + 1);
    env.base_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.base_mint.as_ref()]);
    env.quote_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.quote_mint.as_ref()]);
    assert!(error_in(&register(&mut env, SHAPE, RANK + 1), "CreatorIsNotProblem"));
}

#[test]
fn a_target_at_the_naive_rank_is_not_a_problem() {
    let naive = 7 * 7 * 9;
    let mut env = bare(SHAPE, naive);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    assert!(error_in(&register(&mut env, SHAPE, naive), "BadStatement"));
}

#[test]
fn a_correct_scheme_solves_the_problem_and_the_solver_takes_the_vaults_after_the_grace_window() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let run = upload(&mut env, &scheme, [1u8; 32]);
    reveal(&mut env, &run).unwrap();
    assert_eq!(attempt_of(&env, &run.attempt).status, AttemptStatus::Revealed);

    verify_all(&mut env, &run, 20_000);
    assert_eq!(attempt_of(&env, &run.attempt).status, AttemptStatus::Holds);
    let solved = problem(&env);
    assert_eq!((solved.solver, solved.solved_rank), (Some(run.solver.pubkey()), RANK));
    assert_eq!(solved.solver_commit_slot, attempt_of(&env, &run.attempt).committed_slot);

    put(&mut env.svm, env.base_vault, TOKEN, token_data(&env.base_mint, &env.problem, 5_000));
    put(&mut env.svm, env.quote_vault, TOKEN, token_data(&env.quote_mint, &env.problem, 70_000));
    let (solver_base, solver_quote) = wallets(&mut env, &run.solver.pubkey());

    let early = claim_ix(&env, &run.solver.pubkey(), solver_base, solver_quote);
    assert!(error_in(&send(&mut env.svm, &[early], &run.solver, &[]), "GracePending"));

    advance(&mut env, GRACE);
    let claim = claim_ix(&env, &run.solver.pubkey(), solver_base, solver_quote);
    send(&mut env.svm, &[claim], &run.solver, &[]).unwrap();
    assert_eq!(token_amount(&env.svm, &solver_base), 5_000);
    assert_eq!(token_amount(&env.svm, &solver_quote), 70_000);
    assert_eq!(token_amount(&env.svm, &env.quote_vault), 0);

    let before = env.svm.get_balance(&run.solver.pubkey()).unwrap();
    let attempt_lamports = env.svm.get_balance(&run.attempt).unwrap();
    let submission_lamports = env.svm.get_balance(&run.submission).unwrap();
    let close = close_ix(&env, &run);
    send(&mut env.svm, &[close], &run.solver, &[]).unwrap();
    let after = env.svm.get_balance(&run.solver.pubkey()).unwrap();
    assert!(attempt_lamports >= toll::BOND_LAMPORTS);
    assert_eq!(after + 5_000, before + attempt_lamports + submission_lamports);
    assert!(env.svm.get_account(&run.submission).is_none_or(|a| a.lamports == 0));
}

#[test]
fn a_copier_who_verifies_first_loses_the_solve_to_the_earlier_commitment() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let author = upload(&mut env, &scheme, [21u8; 32]);
    advance(&mut env, 3);
    let copier = upload(&mut env, &scheme, [22u8; 32]);
    assert!(attempt_of(&env, &copier.attempt).committed_slot > attempt_of(&env, &author.attempt).committed_slot);

    reveal(&mut env, &copier).unwrap();
    verify_all(&mut env, &copier, 20_000);
    assert_eq!(problem(&env).solver, Some(copier.solver.pubkey()));

    reveal(&mut env, &author).unwrap();
    verify_all(&mut env, &author, 20_000);
    let solved = problem(&env);
    assert_eq!(solved.solver, Some(author.solver.pubkey()));
    assert_eq!(solved.solver_commit_slot, attempt_of(&env, &author.attempt).committed_slot);

    advance(&mut env, GRACE);
    let (copier_base, copier_quote) = wallets(&mut env, &copier.solver.pubkey());
    let stolen = claim_ix(&env, &copier.solver.pubkey(), copier_base, copier_quote);
    assert!(error_in(&send(&mut env.svm, &[stolen], &copier.solver, &[]), "NotSolver"));
    let (author_base, author_quote) = wallets(&mut env, &author.solver.pubkey());
    let claim = claim_ix(&env, &author.solver.pubkey(), author_base, author_quote);
    send(&mut env.svm, &[claim], &author.solver, &[]).unwrap();
}

#[test]
fn a_later_commitment_that_also_holds_does_not_take_the_solve() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let first = upload(&mut env, &scheme, [23u8; 32]);
    advance(&mut env, 3);
    let second = upload(&mut env, &scheme, [24u8; 32]);
    reveal(&mut env, &first).unwrap();
    reveal(&mut env, &second).unwrap();
    verify_all(&mut env, &first, 20_000);
    verify_all(&mut env, &second, 20_000);
    assert_eq!(attempt_of(&env, &second.attempt).status, AttemptStatus::Holds);
    assert_eq!(problem(&env).solver, Some(first.solver.pubkey()));
}

#[test]
fn the_grace_window_runs_from_the_first_solve_and_is_not_extended_by_a_takeover() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let author = upload(&mut env, &scheme, [25u8; 32]);
    advance(&mut env, 3);
    let copier = upload(&mut env, &scheme, [26u8; 32]);
    reveal(&mut env, &copier).unwrap();
    verify_all(&mut env, &copier, 20_000);
    let first_solve = problem(&env).solved_at_slot;
    reveal(&mut env, &author).unwrap();
    verify_all(&mut env, &author, 20_000);
    assert_eq!(problem(&env).solved_at_slot, first_solve);
}

#[test]
fn a_wrong_scheme_fails_and_its_bond_goes_to_the_problem() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &broken(&fixture(RECORD)), [2u8; 32]);
    reveal(&mut env, &run).unwrap();
    let problem_before = env.svm.get_balance(&env.problem).unwrap();

    verify_all(&mut env, &run, 20_000);
    let attempt = attempt_of(&env, &run.attempt);
    assert_eq!((attempt.status, attempt.bond), (AttemptStatus::Fails, 0));
    assert_eq!(problem(&env).solver, None);
    assert_eq!(env.svm.get_balance(&env.problem).unwrap(), problem_before + toll::BOND_LAMPORTS);

    let close = close_ix(&env, &run);
    send(&mut env.svm, &[close], &run.solver, &[]).unwrap();
}

#[test]
fn forfeited_bonds_are_paid_to_the_solver_on_claim() {
    let mut env = setup(SHAPE, RANK);
    let wrong = upload(&mut env, &broken(&fixture(RECORD)), [27u8; 32]);
    reveal(&mut env, &wrong).unwrap();
    verify_all(&mut env, &wrong, 20_000);
    assert_eq!(attempt_of(&env, &wrong.attempt).status, AttemptStatus::Fails);

    let run = upload(&mut env, &fixture(RECORD), [28u8; 32]);
    reveal(&mut env, &run).unwrap();
    verify_all(&mut env, &run, 20_000);
    advance(&mut env, GRACE);

    let rent = env.svm.minimum_balance_for_rent_exemption(env.svm.get_account(&env.problem).unwrap().data.len());
    let spare = env.svm.get_balance(&env.problem).unwrap() - rent;
    assert!(spare >= toll::BOND_LAMPORTS);
    let (solver_base, solver_quote) = wallets(&mut env, &run.solver.pubkey());
    let before = env.svm.get_balance(&run.solver.pubkey()).unwrap();
    let claim = claim_ix(&env, &run.solver.pubkey(), solver_base, solver_quote);
    send(&mut env.svm, &[claim], &run.solver, &[]).unwrap();
    assert_eq!(env.svm.get_balance(&env.problem).unwrap(), rent);
    assert_eq!(env.svm.get_balance(&run.solver.pubkey()).unwrap() + 5_000, before + spare);
}

#[test]
fn a_reveal_with_another_salt_does_not_match_the_commitment() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [3u8; 32]);
    let committed = attempt_of(&env, &run.attempt).committed_slot;
    env.svm.warp_to_slot(committed + 2);
    set_newest_slot_hash(&mut env.svm, committed + 1, [7u8; 32]);
    let reveal = reveal_ix(&env, &run, [4u8; 32]);
    assert!(error_in(&send(&mut env.svm, &[reveal], &run.solver, &[]), "CommitmentMismatch"));
}

#[test]
fn a_reveal_before_a_newer_slot_hash_exists_is_too_early() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [5u8; 32]);
    let committed = attempt_of(&env, &run.attempt).committed_slot;
    set_newest_slot_hash(&mut env.svm, committed, [7u8; 32]);
    let reveal = reveal_ix(&env, &run, run.salt);
    assert!(error_in(&send(&mut env.svm, &[reveal], &run.solver, &[]), "RevealTooEarly"));
}

#[test]
fn a_scheme_above_the_target_rank_does_not_answer() {
    let mut env = setup(SHAPE, RANK - 1);
    let run = upload(&mut env, &fixture(RECORD), [6u8; 32]);
    assert!(error_in(&reveal(&mut env, &run), "SchemeDoesNotAnswer"));
}

#[test]
fn a_scheme_for_other_dimensions_does_not_answer() {
    let mut env = setup((4, 9, 8), 208);
    let run = upload(&mut env, &fixture(RECORD), [8u8; 32]);
    assert!(error_in(&reveal(&mut env, &run), "SchemeDoesNotAnswer"));
}

#[test]
fn a_revealed_attempt_cannot_be_withdrawn_while_its_check_runs() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &broken(&fixture(RECORD)), [9u8; 32]);
    reveal(&mut env, &run).unwrap();
    let close = close_ix(&env, &run);
    assert!(error_in(&send(&mut env.svm, &[close], &run.solver, &[]), "CheckPending"));
}

#[test]
fn a_committed_attempt_can_be_abandoned_with_its_bond() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [10u8; 32]);
    let attempt_lamports = env.svm.get_balance(&run.attempt).unwrap();
    assert!(attempt_lamports >= toll::BOND_LAMPORTS);
    let close = close_ix(&env, &run);
    send(&mut env.svm, &[close], &run.solver, &[]).unwrap();
    assert!(env.svm.get_account(&run.attempt).is_none_or(|a| a.lamports == 0));
}

#[test]
fn once_solved_no_new_attempt_can_commit() {
    let mut env = setup(SHAPE, RANK);
    let winner = upload(&mut env, &fixture(RECORD), [11u8; 32]);
    reveal(&mut env, &winner).unwrap();
    verify_all(&mut env, &winner, 20_000);
    let late = new_solver(&mut env);
    let (sent, _) = commit(&mut env, &late, [0u8; 32]);
    assert!(error_in(&sent, "AlreadySolved"));
}

#[test]
fn after_the_grace_window_a_pending_check_stops_and_can_be_withdrawn() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let winner = upload(&mut env, &scheme, [12u8; 32]);
    let rival = upload(&mut env, &broken(&scheme), [13u8; 32]);
    reveal(&mut env, &winner).unwrap();
    reveal(&mut env, &rival).unwrap();
    verify_all(&mut env, &winner, 20_000);

    let close = close_ix(&env, &rival);
    assert!(error_in(&send(&mut env.svm, &[close], &rival.solver, &[]), "CheckPending"));

    advance(&mut env, GRACE);
    let cranker = new_solver(&mut env);
    let verify = verify_ix(&env, &rival, &cranker.pubkey(), 20_000);
    assert!(error_in(&send(&mut env.svm, &[compute_limit(1_400_000), verify], &cranker, &[]), "AlreadySolved"));
    let close = close_ix(&env, &rival);
    send(&mut env.svm, &[close], &rival.solver, &[]).unwrap();
}

#[test]
fn only_the_solver_can_claim() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [14u8; 32]);
    reveal(&mut env, &run).unwrap();
    verify_all(&mut env, &run, 20_000);
    advance(&mut env, GRACE);
    let thief = new_solver(&mut env);
    let (thief_base, thief_quote) = wallets(&mut env, &thief.pubkey());
    let claim = claim_ix(&env, &thief.pubkey(), thief_base, thief_quote);
    assert!(error_in(&send(&mut env.svm, &[claim], &thief, &[]), "NotSolver"));
}

#[test]
fn a_write_past_the_end_of_the_submission_is_refused() {
    let mut env = setup(SHAPE, RANK);
    let scheme = fixture(RECORD);
    let run = upload(&mut env, &scheme, [14u8; 32]);
    let write = ix(
        toll::instruction::WriteSubmission { offset: scheme.len() as u32 - 1, bytes: vec![1, 2] },
        toll::accounts::WriteSubmission { solver: run.solver.pubkey(), attempt: run.attempt, submission: run.submission },
    );
    assert!(error_in(&send(&mut env.svm, &[write], &run.solver, &[]), "OutOfBounds"));
}
