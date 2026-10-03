#![allow(dead_code)]

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{AccountDeserialize, Discriminator, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use toll::dynamic_bonding_curve::accounts::{PoolConfig, VirtualPool};
use toll::state::{Attempt, Problem};

pub const DBC: Pubkey = toll::dynamic_bonding_curve::ID;
pub const TOKEN: Pubkey = anchor_spl::token::ID;
pub const SYSTEM: Pubkey = anchor_lang::system_program::ID;
pub const SLOT_HASHES: Pubkey = solana_sdk_ids::sysvar::slot_hashes::ID;
pub const GRACE: u64 = 150;
const COMPUTE_BUDGET: Pubkey = solana_sdk_ids::compute_budget::ID;

pub type Sent = Result<TransactionMetadata, FailedTransactionMetadata>;

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub launchpad: Pubkey,
    pub config: Pubkey,
    pub pool: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub problem: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
}

pub fn fixture(name: &str) -> Vec<u8> {
    let path = format!("{}/../../tests/fixtures/{name}.bin", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(&path).unwrap_or_else(|why| panic!("{path}: {why}"))
}

pub fn send(svm: &mut LiteSVM, instructions: &[Instruction], payer: &Keypair, signers: &[&Keypair]) -> Sent {
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);
    let mut all: Vec<&Keypair> = vec![payer];
    all.extend(signers.iter().copied().filter(|k| k.pubkey() != payer.pubkey()));
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &all).unwrap();
    let sent = svm.send_transaction(tx);
    svm.expire_blockhash();
    sent
}

pub fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction::new_with_bytes(toll::ID, &data.data(), accounts.to_account_metas(None))
}

pub fn compute_limit(units: u32) -> Instruction {
    let mut data = vec![2u8];
    data.extend_from_slice(&units.to_le_bytes());
    Instruction::new_with_bytes(COMPUTE_BUDGET, &data, Vec::<AccountMeta>::new())
}

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &toll::ID).0
}

pub fn problem_address(launchpad: &Pubkey, pool: &Pubkey, n: (u8, u8, u8), target: u32) -> Pubkey {
    pda(&[toll::PROBLEM_SEED, launchpad.as_ref(), pool.as_ref(), &[n.0, n.1, n.2], &target.to_le_bytes()])
}

pub fn mint_data(decimals: u8) -> Vec<u8> {
    let mut data = vec![0u8; 82];
    data[36..44].copy_from_slice(&0u64.to_le_bytes());
    data[44] = decimals;
    data[45] = 1;
    data
}

pub fn token_data(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut data = vec![0u8; 165];
    data[..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1;
    data
}

pub fn token_amount(svm: &LiteSVM, account: &Pubkey) -> u64 {
    let data = svm.get_account(account).unwrap().data;
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

pub fn put(svm: &mut LiteSVM, key: Pubkey, owner: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(key, Account { lamports, data, owner, executable: false, rent_epoch: 0 })
        .unwrap();
}

pub fn set_newest_slot_hash(svm: &mut LiteSVM, slot: u64, hash: [u8; 32]) {
    let mut data = Vec::with_capacity(48);
    data.extend_from_slice(&1u64.to_le_bytes());
    data.extend_from_slice(&slot.to_le_bytes());
    data.extend_from_slice(&hash);
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    let owner = solana_sdk_ids::sysvar::ID;
    svm.set_account(SLOT_HASHES, Account { lamports, data, owner, executable: false, rent_epoch: 0 })
        .unwrap();
}

pub fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let data = svm.get_account(key).unwrap().data;
    T::try_deserialize(&mut data.as_slice()).unwrap()
}

pub fn problem(env: &Env) -> Problem {
    read(&env.svm, &env.problem)
}

pub fn attempt_of(env: &Env, attempt: &Pubkey) -> Attempt {
    read(&env.svm, attempt)
}

pub fn put_dbc_accounts(env: &mut Env, creator: Pubkey) {
    let mut config: PoolConfig = bytemuck::Zeroable::zeroed();
    config.quote_mint = env.quote_mint;
    let mut data = PoolConfig::DISCRIMINATOR.to_vec();
    data.extend_from_slice(bytemuck::bytes_of(&config));
    put(&mut env.svm, env.config, DBC, data);

    let mut pool: VirtualPool = bytemuck::Zeroable::zeroed();
    pool.pool_state.config = env.config;
    pool.pool_state.creator = creator;
    pool.pool_state.base_mint = env.base_mint;
    let mut data = VirtualPool::DISCRIMINATOR.to_vec();
    data.extend_from_slice(bytemuck::bytes_of(&pool));
    put(&mut env.svm, env.pool, DBC, data);
}

pub fn bare(n: (u8, u8, u8), target: u32) -> Env {
    let mut svm = LiteSVM::new();
    let program = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/toll.so"));
    svm.add_program(toll::ID, program).unwrap();
    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();

    let launchpad = pda(&[toll::LAUNCHPAD_SEED, admin.pubkey().as_ref()]);
    let config = Pubkey::new_unique();
    let pool = Pubkey::new_unique();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    let problem = problem_address(&launchpad, &pool, n, target);
    let base_vault = pda(&[toll::VAULT_SEED, problem.as_ref(), base_mint.as_ref()]);
    let quote_vault = pda(&[toll::VAULT_SEED, problem.as_ref(), quote_mint.as_ref()]);
    put(&mut svm, base_mint, TOKEN, mint_data(6));
    put(&mut svm, quote_mint, TOKEN, mint_data(9));

    let mut env = Env { svm, admin, launchpad, config, pool, base_mint, quote_mint, problem, base_vault, quote_vault };
    let init = ix(
        toll::instruction::InitLaunchpad { dbc_config: config, grace_slots: GRACE },
        toll::accounts::InitLaunchpad { admin: env.admin.pubkey(), launchpad, system_program: SYSTEM },
    );
    send(&mut env.svm, &[init], &env.admin, &[]).unwrap_or_else(|failed| panic!("{:?}", failed.meta.logs));
    env
}

pub fn launchpad_with_grace(grace_slots: u64) -> Sent {
    let mut svm = LiteSVM::new();
    let program = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/toll.so"));
    svm.add_program(toll::ID, program).unwrap();
    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 10_000_000_000).unwrap();
    let launchpad = pda(&[toll::LAUNCHPAD_SEED, admin.pubkey().as_ref()]);
    let init = ix(
        toll::instruction::InitLaunchpad { dbc_config: Pubkey::new_unique(), grace_slots },
        toll::accounts::InitLaunchpad { admin: admin.pubkey(), launchpad, system_program: SYSTEM },
    );
    send(&mut svm, &[init], &admin, &[])
}

pub fn register(env: &mut Env, n: (u8, u8, u8), target: u32) -> Sent {
    let register = ix(
        toll::instruction::RegisterProblem { n1: n.0, n2: n.1, n3: n.2, target_rank: target },
        toll::accounts::RegisterProblem {
            payer: env.admin.pubkey(),
            launchpad: env.launchpad,
            config: env.config,
            pool: env.pool,
            problem: env.problem,
            base_mint: env.base_mint,
            quote_mint: env.quote_mint,
            base_vault: env.base_vault,
            quote_vault: env.quote_vault,
            base_token_program: TOKEN,
            quote_token_program: TOKEN,
            system_program: SYSTEM,
        },
    );
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, &[register], &admin, &[])
}

pub fn setup(n: (u8, u8, u8), target: u32) -> Env {
    let mut env = bare(n, target);
    let creator = env.problem;
    put_dbc_accounts(&mut env, creator);
    register(&mut env, n, target).unwrap();
    env
}

pub struct Run {
    pub solver: Keypair,
    pub attempt: Pubkey,
    pub submission: Pubkey,
    pub salt: [u8; 32],
}

pub fn commitment(problem: &Pubkey, solver: &Pubkey, salt: &[u8; 32], scheme: &[u8]) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[toll::COMMIT_DOMAIN, problem.as_ref(), solver.as_ref(), salt, scheme]).to_bytes()
}

pub fn new_solver(env: &mut Env) -> Keypair {
    let solver = Keypair::new();
    env.svm.airdrop(&solver.pubkey(), 10_000_000_000).unwrap();
    solver
}

pub fn commit(env: &mut Env, solver: &Keypair, digest: [u8; 32]) -> (Sent, Pubkey) {
    let attempt = pda(&[toll::ATTEMPT_SEED, env.problem.as_ref(), solver.pubkey().as_ref()]);
    let commit = ix(
        toll::instruction::Commit { commitment: digest },
        toll::accounts::Commit { solver: solver.pubkey(), problem: env.problem, attempt, system_program: SYSTEM },
    );
    (send(&mut env.svm, &[commit], solver, &[]), attempt)
}

pub fn upload(env: &mut Env, scheme: &[u8], salt: [u8; 32]) -> Run {
    let solver = new_solver(env);
    let digest = commitment(&env.problem, &solver.pubkey(), &salt, scheme);
    let (sent, attempt) = commit(env, &solver, digest);
    sent.unwrap();

    let buffer = Keypair::new();
    let submission = buffer.pubkey();
    put(&mut env.svm, submission, toll::ID, vec![0u8; toll::submission::HEADER_LEN + scheme.len()]);
    send(&mut env.svm, &[open_ix(&solver.pubkey(), &attempt, &submission, scheme.len())], &solver, &[&buffer]).unwrap();
    advance(env, 1);

    for (index, chunk) in scheme.chunks(900).enumerate() {
        let write = ix(
            toll::instruction::WriteSubmission { offset: (index * 900) as u32, bytes: chunk.to_vec() },
            toll::accounts::WriteSubmission { solver: solver.pubkey(), attempt, submission },
        );
        send(&mut env.svm, &[write], &solver, &[]).unwrap();
    }
    Run { solver, attempt, submission, salt }
}

pub fn open_ix(solver: &Pubkey, attempt: &Pubkey, submission: &Pubkey, len: usize) -> Instruction {
    ix(
        toll::instruction::OpenSubmission { len: len as u32 },
        toll::accounts::OpenSubmission { solver: *solver, attempt: *attempt, submission: *submission },
    )
}

pub fn reveal_ix(env: &Env, run: &Run, salt: [u8; 32]) -> Instruction {
    ix(
        toll::instruction::Reveal { salt },
        toll::accounts::Reveal {
            solver: run.solver.pubkey(),
            problem: env.problem,
            attempt: run.attempt,
            submission: run.submission,
            slot_hashes: SLOT_HASHES,
        },
    )
}

pub fn slot(svm: &LiteSVM) -> u64 {
    let clock = svm.get_account(&solana_sdk_ids::sysvar::clock::ID).unwrap().data;
    u64::from_le_bytes(clock[..8].try_into().unwrap())
}

pub fn advance(env: &mut Env, slots: u64) {
    let next = slot(&env.svm) + slots;
    env.svm.warp_to_slot(next);
}

pub fn reveal(env: &mut Env, run: &Run) -> Sent {
    let committed = attempt_of(env, &run.attempt).committed_slot;
    let now = slot(&env.svm).max(committed + 2);
    env.svm.warp_to_slot(now);
    set_newest_slot_hash(&mut env.svm, now - 1, [7u8; 32]);
    let reveal = reveal_ix(env, run, run.salt);
    send(&mut env.svm, &[reveal], &run.solver, &[])
}

pub fn verify_ix(env: &Env, run: &Run, cranker: &Pubkey, budget: u32) -> Instruction {
    ix(
        toll::instruction::Verify { budget },
        toll::accounts::Verify { cranker: *cranker, problem: env.problem, attempt: run.attempt, submission: run.submission },
    )
}

pub fn verify_all(env: &mut Env, run: &Run, budget: u32) -> Vec<u64> {
    let cranker = new_solver(env);
    let mut costs = Vec::new();
    for _ in 0..10_000 {
        let verify = verify_ix(env, run, &cranker.pubkey(), budget);
        let sent = send(&mut env.svm, &[compute_limit(1_400_000), verify], &cranker, &[])
            .unwrap_or_else(|failed| panic!("{:?}", failed.meta.logs));
        costs.push(sent.compute_units_consumed);
        if attempt_of(env, &run.attempt).status != toll::state::AttemptStatus::Revealed {
            return costs;
        }
    }
    panic!("the check did not finish");
}

pub fn claim_ix(env: &Env, solver: &Pubkey, solver_base: Pubkey, solver_quote: Pubkey) -> Instruction {
    ix(
        toll::instruction::Claim {},
        toll::accounts::Claim {
            solver: *solver,
            problem: env.problem,
            base_vault: env.base_vault,
            quote_vault: env.quote_vault,
            solver_base,
            solver_quote,
            base_mint: env.base_mint,
            quote_mint: env.quote_mint,
            base_token_program: TOKEN,
            quote_token_program: TOKEN,
        },
    )
}

pub fn wallets(env: &mut Env, owner: &Pubkey) -> (Pubkey, Pubkey) {
    let (base, quote) = (Pubkey::new_unique(), Pubkey::new_unique());
    put(&mut env.svm, base, TOKEN, token_data(&env.base_mint, owner, 0));
    put(&mut env.svm, quote, TOKEN, token_data(&env.quote_mint, owner, 0));
    (base, quote)
}

pub fn close_ix(env: &Env, run: &Run) -> Instruction {
    ix(
        toll::instruction::CloseAttempt {},
        toll::accounts::CloseAttempt {
            solver: run.solver.pubkey(),
            problem: env.problem,
            attempt: run.attempt,
            submission: run.submission,
        },
    )
}

pub fn error_in(sent: &Sent, name: &str) -> bool {
    match sent {
        Ok(_) => false,
        Err(failed) => failed.meta.logs.iter().any(|line| line.contains(name)),
    }
}

pub fn events<T: anchor_lang::Event + anchor_lang::Discriminator + anchor_lang::AnchorDeserialize>(sent: &TransactionMetadata) -> Vec<T> {
    sent.logs
        .iter()
        .filter_map(|line| line.strip_prefix("Program data: "))
        .filter_map(base64)
        .filter(|bytes| bytes.starts_with(T::DISCRIMINATOR))
        .map(|bytes| T::deserialize(&mut &bytes[T::DISCRIMINATOR.len()..]).expect("event decodes"))
        .collect()
}

fn base64(text: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut buffer, mut bits) = (0u32, 0);
    for byte in text.bytes().filter(|b| *b != b'=') {
        let value = ALPHABET.iter().position(|a| *a == byte)? as u32;
        buffer = buffer << 6 | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}
