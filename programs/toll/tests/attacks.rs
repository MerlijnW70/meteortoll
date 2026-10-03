#![allow(clippy::result_large_err)]

mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const SHAPE: (u8, u8, u8) = (7, 7, 9);
const RECORD: &str = "7x7x9_m314_ZT";
const RANK: u32 = 314;

fn solved() -> (Env, Run) {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [31u8; 32]);
    reveal(&mut env, &run).unwrap();
    verify_all(&mut env, &run, 20_000);
    (env, run)
}

#[test]
fn hijack_fresh_submission() {
    let mut env = setup(SHAPE, RANK);
    let victim = Keypair::new();
    put(&mut env.svm, victim.pubkey(), toll::ID, vec![0u8; toll::submission::HEADER_LEN + 4_000]);

    let thief = new_solver(&mut env);
    let (sent, attempt) = commit(&mut env, &thief, [9u8; 32]);
    sent.unwrap();
    let mut open = open_ix(&thief.pubkey(), &attempt, &victim.pubkey(), 4_000);
    for meta in &mut open.accounts {
        if meta.pubkey == victim.pubkey() {
            meta.is_signer = false;
        }
    }
    assert!(error_in(&send(&mut env.svm, &[open], &thief, &[]), "AccountNotSigner"));
    assert_eq!(attempt_of(&env, &attempt).submission, Pubkey::default());
}

#[test]
fn foreign_program_account() {
    let mut env = setup(SHAPE, RANK);
    let thief = new_solver(&mut env);
    let (sent, attempt) = commit(&mut env, &thief, [9u8; 32]);
    sent.unwrap();
    let fake = Keypair::new();
    put(&mut env.svm, fake.pubkey(), SYSTEM, vec![0u8; toll::submission::HEADER_LEN + 100]);
    let open = open_ix(&thief.pubkey(), &attempt, &fake.pubkey(), 100);
    assert!(error_in(&send(&mut env.svm, &[open], &thief, &[&fake]), "BadSubmission"));
}

#[test]
fn reopen_submission() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [32u8; 32]);
    let other = Keypair::new();
    put(&mut env.svm, other.pubkey(), toll::ID, vec![0u8; toll::submission::HEADER_LEN + 100]);
    let open = open_ix(&run.solver.pubkey(), &run.attempt, &other.pubkey(), 100);
    assert!(error_in(&send(&mut env.svm, &[open], &run.solver, &[&other]), "BadSubmission"));
}

#[test]
fn write_others_submission() {
    let mut env = setup(SHAPE, RANK);
    let victim = upload(&mut env, &fixture(RECORD), [33u8; 32]);
    let thief = upload(&mut env, &fixture(RECORD), [34u8; 32]);
    let write = ix(
        toll::instruction::WriteSubmission { offset: 0, bytes: vec![0; 8] },
        toll::accounts::WriteSubmission { solver: thief.solver.pubkey(), attempt: thief.attempt, submission: victim.submission },
    );
    assert!(error_in(&send(&mut env.svm, &[write], &thief.solver, &[]), "BadSubmission"));
}

#[test]
fn write_after_reveal() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [35u8; 32]);
    reveal(&mut env, &run).unwrap();
    let write = ix(
        toll::instruction::WriteSubmission { offset: 0, bytes: vec![0; 8] },
        toll::accounts::WriteSubmission { solver: run.solver.pubkey(), attempt: run.attempt, submission: run.submission },
    );
    assert!(error_in(&send(&mut env.svm, &[write], &run.solver, &[]), "WrongStatus"));
}

#[test]
fn double_commit() {
    let mut env = setup(SHAPE, RANK);
    let solver = new_solver(&mut env);
    commit(&mut env, &solver, [1u8; 32]).0.unwrap();
    env.svm.expire_blockhash();
    assert!(commit(&mut env, &solver, [2u8; 32]).0.is_err());
}

#[test]
fn reveal_after_final() {
    let mut env = setup(SHAPE, RANK);
    let first = upload(&mut env, &fixture(RECORD), [31u8; 32]);
    let late = upload(&mut env, &fixture(RECORD), [36u8; 32]);
    reveal(&mut env, &first).unwrap();
    verify_all(&mut env, &first, 20_000);
    advance(&mut env, GRACE);
    assert!(error_in(&reveal(&mut env, &late), "AlreadySolved"));
}

#[test]
fn close_others_attempt() {
    let mut env = setup(SHAPE, RANK);
    let victim = upload(&mut env, &fixture(RECORD), [37u8; 32]);
    let thief = new_solver(&mut env);
    let close = ix(
        toll::instruction::CloseAttempt {},
        toll::accounts::CloseAttempt {
            solver: thief.pubkey(),
            problem: env.problem,
            attempt: victim.attempt,
            submission: victim.submission,
        },
    );
    assert!(error_in(&send(&mut env.svm, &[close], &thief, &[]), "ConstraintHasOne"));
}

#[test]
fn close_with_foreign_submission() {
    let mut env = setup(SHAPE, RANK);
    let victim = upload(&mut env, &fixture(RECORD), [38u8; 32]);
    let thief = upload(&mut env, &fixture(RECORD), [39u8; 32]);
    let before = env.svm.get_balance(&victim.submission).unwrap();
    let close = ix(
        toll::instruction::CloseAttempt {},
        toll::accounts::CloseAttempt {
            solver: thief.solver.pubkey(),
            problem: env.problem,
            attempt: thief.attempt,
            submission: victim.submission,
        },
    );
    assert!(error_in(&send(&mut env.svm, &[close], &thief.solver, &[]), "BadSubmission"));
    assert_eq!(env.svm.get_balance(&victim.submission).unwrap(), before);
}

#[test]
fn claim_to_foreign_wallet() {
    let (mut env, run) = solved();
    advance(&mut env, GRACE);
    let thief = new_solver(&mut env);
    let (thief_base, thief_quote) = wallets(&mut env, &thief.pubkey());
    let claim = claim_ix(&env, &run.solver.pubkey(), thief_base, thief_quote);
    assert!(error_in(&send(&mut env.svm, &[claim], &run.solver, &[]), "ConstraintTokenOwner"));
}

#[test]
fn claim_twice() {
    let (mut env, run) = solved();
    put(&mut env.svm, env.quote_vault, TOKEN, token_data(&env.quote_mint, &env.problem, 70_000));
    advance(&mut env, GRACE);
    let (base, quote) = wallets(&mut env, &run.solver.pubkey());
    let claim = claim_ix(&env, &run.solver.pubkey(), base, quote);
    send(&mut env.svm, std::slice::from_ref(&claim), &run.solver, &[]).unwrap();
    let rent = env.svm.get_balance(&env.problem).unwrap();
    env.svm.expire_blockhash();
    send(&mut env.svm, &[claim], &run.solver, &[]).unwrap();
    assert_eq!(token_amount(&env.svm, &quote), 70_000);
    assert_eq!(env.svm.get_balance(&env.problem).unwrap(), rent);
    assert!(rent > 0);
}

#[test]
fn claim_wrong_vault() {
    let (mut env, run) = solved();
    advance(&mut env, GRACE);
    let (base, quote) = wallets(&mut env, &run.solver.pubkey());
    let mut claim = claim_ix(&env, &run.solver.pubkey(), base, quote);
    let fake = Pubkey::new_unique();
    put(&mut env.svm, fake, TOKEN, token_data(&env.quote_mint, &env.problem, 1));
    for meta in &mut claim.accounts {
        if meta.pubkey == env.quote_vault {
            meta.pubkey = fake;
        }
    }
    assert!(error_in(&send(&mut env.svm, &[claim], &run.solver, &[]), "ConstraintHasOne"));
}

#[test]
fn register_twice() {
    let mut env = setup(SHAPE, RANK);
    env.svm.expire_blockhash();
    assert!(register(&mut env, SHAPE, RANK).is_err());
}

#[test]
fn grace_bounds() {
    assert!(error_in(&launchpad_with_grace(149), "BadGrace"));
    assert!(error_in(&launchpad_with_grace(216_001), "BadGrace"));
    assert!(error_in(&launchpad_with_grace(u64::MAX), "BadGrace"));
    launchpad_with_grace(150).unwrap();
    launchpad_with_grace(216_000).unwrap();
}

#[test]
fn rank_floor() {
    let mut env = bare(SHAPE, 62);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    assert!(error_in(&register(&mut env, SHAPE, 62), "BadStatement"));
    let mut env = bare(SHAPE, 63);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    register(&mut env, SHAPE, 63).unwrap();
}

#[test]
fn write_in_commit_slot() {
    let mut env = setup(SHAPE, RANK);
    let solver = new_solver(&mut env);
    let (sent, attempt) = commit(&mut env, &solver, [5u8; 32]);
    sent.unwrap();
    let buffer = Keypair::new();
    put(&mut env.svm, buffer.pubkey(), toll::ID, vec![0u8; toll::submission::HEADER_LEN + 8]);
    send(&mut env.svm, &[open_ix(&solver.pubkey(), &attempt, &buffer.pubkey(), 8)], &solver, &[&buffer]).unwrap();
    let write = ix(
        toll::instruction::WriteSubmission { offset: 0, bytes: vec![1; 8] },
        toll::accounts::WriteSubmission { solver: solver.pubkey(), attempt, submission: buffer.pubkey() },
    );
    assert!(error_in(&send(&mut env.svm, std::slice::from_ref(&write), &solver, &[]), "WriteTooEarly"));
    advance(&mut env, 1);
    send(&mut env.svm, &[write], &solver, &[]).unwrap();
}

#[test]
fn unverified_reveal_bond() {
    let mut env = setup(SHAPE, RANK);
    let honest = upload(&mut env, &fixture(RECORD), [41u8; 32]);
    let mut junk = fixture(RECORD);
    let last = junk.len() - 1;
    junk[last] = (junk[last] as i8).wrapping_neg() as u8;
    let griefer = upload(&mut env, &junk, [42u8; 32]);
    reveal(&mut env, &honest).unwrap();
    verify_all(&mut env, &honest, 20_000);
    reveal(&mut env, &griefer).unwrap();
    advance(&mut env, GRACE * 4);
    let close = close_ix(&env, &griefer);
    assert!(error_in(&send(&mut env.svm, &[close], &griefer.solver, &[]), "CheckPending"));
    verify_all(&mut env, &griefer, 20_000);
    assert_eq!(attempt_of(&env, &griefer.attempt).bond, 0);
}

#[test]
fn verify_size_limit() {
    let mut env = bare((32, 32, 48), 1536);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    register(&mut env, (32, 32, 48), 1536).unwrap();
    let mut env = bare((5, 13, 224), 2912);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    assert!(error_in(&register(&mut env, (5, 13, 224), 2912), "BadStatement"));
}

#[test]
fn rank_floor_pairs() {
    for shape in [(9, 8, 2), (2, 9, 8), (8, 2, 9)] {
        let mut env = bare(shape, 71);
        let creator = env.problem;
        put_dbc_accounts(&mut env, creator);
        assert!(error_in(&register(&mut env, shape, 71), "BadStatement"), "{shape:?}");
        let mut env = bare(shape, 72);
        let creator = env.problem;
        put_dbc_accounts(&mut env, creator);
        register(&mut env, shape, 72).unwrap();
    }
}

#[test]
fn unknown_kind() {
    let mut env = bare(SHAPE, RANK);
    env.problem = problem_address_of(1, &env.launchpad, &env.pool, SHAPE, RANK);
    env.base_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.base_mint.as_ref()]);
    env.quote_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.quote_mint.as_ref()]);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    assert!(error_in(&register_kind(&mut env, 1, SHAPE, RANK), "UnknownKind"));
}

#[test]
fn kind_in_address() {
    let mut env = bare(SHAPE, RANK);
    env.problem = problem_address_of(1, &env.launchpad, &env.pool, SHAPE, RANK);
    env.base_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.base_mint.as_ref()]);
    env.quote_vault = pda(&[toll::VAULT_SEED, env.problem.as_ref(), env.quote_mint.as_ref()]);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    assert!(error_in(&register(&mut env, SHAPE, RANK), "ConstraintSeeds"));
}

#[test]
fn registered_kind() {
    let env = setup(SHAPE, RANK);
    let stored = problem(&env);
    assert_eq!((stored.kind, stored.reserved), (toll::KIND_MATRIX, [0; 64]));
}

#[test]
fn forged_kind_reveal() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [51u8; 32]);
    set_kind(&mut env, 7);
    assert!(error_in(&reveal(&mut env, &run), "UnknownKind"));
}

#[test]
fn forged_kind_verify() {
    let mut env = setup(SHAPE, RANK);
    let run = upload(&mut env, &fixture(RECORD), [52u8; 32]);
    reveal(&mut env, &run).unwrap();
    set_kind(&mut env, 7);
    let cranker = new_solver(&mut env);
    let verify = verify_ix(&env, &run, &cranker.pubkey(), 2_000);
    assert!(error_in(&send(&mut env.svm, &[compute_limit(1_400_000), verify], &cranker, &[]), "UnknownKind"));
}
