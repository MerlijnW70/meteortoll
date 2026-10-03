#![allow(clippy::result_large_err)]

mod common;

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use common::*;
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;
use toll::dynamic_bonding_curve::accounts::VirtualPool;
use toll::dynamic_bonding_curve::client::{accounts as dbc_accounts, args as dbc_args};
use toll::dynamic_bonding_curve::types::{InitializePoolParameters, SwapParameters, SwapParameters2};

const DAMM: Pubkey = toll::cp_amm::ID;
const DAMM_CONFIG: Pubkey = anchor_lang::pubkey!("Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp");
const METAPLEX: Pubkey = anchor_lang::pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const POOL_AUTHORITY: Pubkey = anchor_lang::pubkey!("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM");
const SHAPE: (u8, u8, u8) = (7, 7, 9);
const RANK: u32 = 314;
const ONE: u64 = 1_000_000_000;
const INSTRUCTIONS_SYSVAR: Pubkey = solana_sdk_ids::sysvar::instructions::ID;
const WINDOW_SLOTS: u64 = 360;
const FIRST_BUY_TOKENS: u64 = 91_734_376_628_999;
const FIRST_BUY_FEE: u64 = 8_002_176;

fn fixture_path(name: &str) -> String {
    format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))
}

fn config_data() -> Vec<u8> {
    let text = std::fs::read_to_string(fixture_path("dbc_config_test.json")).unwrap();
    let start = text.find("\"data\": \"").unwrap() + 9;
    let hex = &text[start..start + text[start..].find('"').unwrap()];
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
}

fn dbc_event_authority() -> Pubkey {
    Pubkey::find_program_address(&[b"__event_authority"], &DBC).0
}

fn dbc_ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction::new_with_bytes(DBC, &data.data(), accounts.to_account_metas(None))
}

struct Market {
    env: Env,
    pool_base_vault: Pubkey,
    pool_quote_vault: Pubkey,
    trader: Keypair,
    trader_base: Pubkey,
    trader_quote: Pubkey,
    launcher_base: Pubkey,
}

fn market() -> Market {
    market_with_first_buy(0)
}

fn market_with_first_buy(first_buy: u64) -> Market {
    let mut svm = LiteSVM::new();
    let program = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/toll.so"));
    svm.add_program(toll::ID, program).unwrap();
    svm.add_program_from_file(DBC, fixture_path("dbc.so")).unwrap();
    svm.add_program_from_file(METAPLEX, fixture_path("mpl_token_metadata.so")).unwrap();
    svm.add_program_from_file(DAMM, fixture_path("damm_v2.so")).unwrap();
    let mut clock = svm.get_sysvar::<anchor_lang::prelude::Clock>();
    clock.unix_timestamp = 1_790_000_000;
    svm.set_sysvar(&clock);
    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100 * ONE).unwrap();

    let quote_mint = Pubkey::new_unique();
    put(&mut svm, quote_mint, TOKEN, mint_data(9));

    let config = Keypair::new();
    let event_authority = dbc_event_authority();
    let create_config = Instruction::new_with_bytes(
        DBC,
        &config_data(),
        vec![
            AccountMeta::new(config.pubkey(), true),
            AccountMeta::new_readonly(admin.pubkey(), false),
            AccountMeta::new_readonly(admin.pubkey(), false),
            AccountMeta::new_readonly(quote_mint, false),
            AccountMeta::new(admin.pubkey(), true),
            AccountMeta::new_readonly(SYSTEM, false),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(DBC, false),
        ],
    );
    send(&mut svm, &[create_config], &admin, &[&config]).unwrap_or_else(|f| panic!("create_config {:?}", f.meta.logs));

    let launchpad = pda(&[toll::LAUNCHPAD_SEED, admin.pubkey().as_ref()]);
    let init = ix(
        toll::instruction::InitLaunchpad { dbc_config: config.pubkey(), grace_slots: GRACE },
        toll::accounts::InitLaunchpad { admin: admin.pubkey(), launchpad, system_program: SYSTEM },
    );
    send(&mut svm, &[init], &admin, &[]).unwrap();

    let base = Keypair::new();
    let (high, low) = if base.pubkey() > quote_mint { (base.pubkey(), quote_mint) } else { (quote_mint, base.pubkey()) };
    let pool = Pubkey::find_program_address(&[b"pool", config.pubkey().as_ref(), high.as_ref(), low.as_ref()], &DBC).0;
    let pool_base_vault = Pubkey::find_program_address(&[b"token_vault", base.pubkey().as_ref(), pool.as_ref()], &DBC).0;
    let pool_quote_vault = Pubkey::find_program_address(&[b"token_vault", quote_mint.as_ref(), pool.as_ref()], &DBC).0;
    let metadata = Pubkey::find_program_address(&[b"metadata", METAPLEX.as_ref(), base.pubkey().as_ref()], &METAPLEX).0;
    let launcher = Keypair::new();
    svm.airdrop(&launcher.pubkey(), 10 * ONE).unwrap();

    let create_pool = dbc_ix(
        dbc_args::InitializeVirtualPoolWithSplToken {
            params: InitializePoolParameters { name: "7x7x9 rank 314".into(), symbol: "MM779".into(), uri: "https://example.invalid/779.json".into() },
        },
        dbc_accounts::InitializeVirtualPoolWithSplToken {
            config: config.pubkey(),
            pool_authority: POOL_AUTHORITY,
            creator: launcher.pubkey(),
            base_mint: base.pubkey(),
            quote_mint,
            pool,
            base_vault: pool_base_vault,
            quote_vault: pool_quote_vault,
            mint_metadata: metadata,
            metadata_program: METAPLEX,
            payer: launcher.pubkey(),
            token_quote_program: TOKEN,
            token_program: TOKEN,
            system_program: SYSTEM,
            event_authority,
            program: DBC,
        },
    );
    let problem = problem_address(&launchpad, &pool, SHAPE, RANK);
    let hand_over = dbc_ix(
        dbc_args::TransferPoolCreator {},
        dbc_accounts::TransferPoolCreator {
            virtual_pool: pool,
            config: config.pubkey(),
            creator: launcher.pubkey(),
            new_creator: problem,
            event_authority,
            program: DBC,
        },
    );
    let mut create = vec![compute_limit(600_000), create_pool];
    let (launcher_base, launcher_quote) = (Pubkey::new_unique(), Pubkey::new_unique());
    if first_buy > 0 {
        put(&mut svm, launcher_base, TOKEN, token_data(&base.pubkey(), &launcher.pubkey(), 0));
        put(&mut svm, launcher_quote, TOKEN, token_data(&quote_mint, &launcher.pubkey(), first_buy));
        let mut first = dbc_ix(
            dbc_args::Swap { params: SwapParameters { amount_in: first_buy, minimum_amount_out: 0 } },
            dbc_accounts::Swap {
                pool_authority: POOL_AUTHORITY,
                config: config.pubkey(),
                pool,
                input_token_account: launcher_quote,
                output_token_account: launcher_base,
                base_vault: pool_base_vault,
                quote_vault: pool_quote_vault,
                base_mint: base.pubkey(),
                quote_mint,
                payer: launcher.pubkey(),
                token_base_program: TOKEN,
                token_quote_program: TOKEN,
                referral_token_account: None,
                event_authority,
                program: DBC,
            },
        );
        first.accounts.push(AccountMeta::new_readonly(INSTRUCTIONS_SYSVAR, false));
        create.push(first);
    }
    create.push(hand_over);
    send(&mut svm, &create, &launcher, &[&base]).unwrap_or_else(|f| panic!("create pool {:?}", f.meta.logs));

    let base_vault = pda(&[toll::VAULT_SEED, problem.as_ref(), base.pubkey().as_ref()]);
    let quote_vault = pda(&[toll::VAULT_SEED, problem.as_ref(), quote_mint.as_ref()]);
    let mut env = Env {
        svm,
        admin,
        launchpad,
        config: config.pubkey(),
        pool,
        base_mint: base.pubkey(),
        quote_mint,
        problem,
        base_vault,
        quote_vault,
    };
    register(&mut env, SHAPE, RANK).unwrap_or_else(|f| panic!("register {:?}", f.meta.logs));

    let trader = new_solver(&mut env);
    let (trader_base, trader_quote) = (Pubkey::new_unique(), Pubkey::new_unique());
    put(&mut env.svm, trader_base, TOKEN, token_data(&env.base_mint, &trader.pubkey(), 0));
    put(&mut env.svm, trader_quote, TOKEN, token_data(&env.quote_mint, &trader.pubkey(), 1_000 * ONE));
    Market { env, pool_base_vault, pool_quote_vault, trader, trader_base, trader_quote, launcher_base }
}

fn buy(m: &mut Market, quote_in: u64) {
    let swap = dbc_ix(
        dbc_args::Swap { params: SwapParameters { amount_in: quote_in, minimum_amount_out: 0 } },
        swap_accounts(m),
    );
    let trader = m.trader.insecure_clone();
    send(&mut m.env.svm, &[compute_limit(400_000), swap], &trader, &[]).unwrap_or_else(|f| panic!("swap {:?}", f.meta.logs));
}

fn buy_out_the_curve(m: &mut Market) {
    const PARTIAL_FILL: u8 = 1;
    let swap = dbc_ix(
        dbc_args::Swap2 { params: SwapParameters2 { amount_0: 100 * ONE, amount_1: 0, swap_mode: PARTIAL_FILL } },
        dbc_accounts::Swap2 {
            pool_authority: POOL_AUTHORITY,
            config: m.env.config,
            pool: m.env.pool,
            input_token_account: m.trader_quote,
            output_token_account: m.trader_base,
            base_vault: m.pool_base_vault,
            quote_vault: m.pool_quote_vault,
            base_mint: m.env.base_mint,
            quote_mint: m.env.quote_mint,
            payer: m.trader.pubkey(),
            token_base_program: TOKEN,
            token_quote_program: TOKEN,
            referral_token_account: None,
            event_authority: dbc_event_authority(),
            program: DBC,
        },
    );
    let trader = m.trader.insecure_clone();
    send(&mut m.env.svm, &[compute_limit(400_000), swap], &trader, &[]).unwrap_or_else(|f| panic!("swap2 {:?}", f.meta.logs));
}

fn swap_accounts(m: &Market) -> dbc_accounts::Swap {
    dbc_accounts::Swap {
        pool_authority: POOL_AUTHORITY,
        config: m.env.config,
        pool: m.env.pool,
        input_token_account: m.trader_quote,
        output_token_account: m.trader_base,
        base_vault: m.pool_base_vault,
        quote_vault: m.pool_quote_vault,
        base_mint: m.env.base_mint,
        quote_mint: m.env.quote_mint,
        payer: m.trader.pubkey(),
        token_base_program: TOKEN,
        token_quote_program: TOKEN,
        referral_token_account: None,
        event_authority: dbc_event_authority(),
        program: DBC,
    }
}

fn pool_state(m: &Market) -> VirtualPool {
    let data = m.env.svm.get_account(&m.env.pool).unwrap().data;
    bytemuck::pod_read_unaligned::<VirtualPool>(&data[8..8 + std::mem::size_of::<VirtualPool>()])
}

fn sweep_fees(m: &mut Market) -> Sent {
    let sweep = ix(
        toll::instruction::SweepTradingFees {},
        toll::accounts::SweepTradingFees {
            problem: m.env.problem,
            pool: m.env.pool,
            pool_authority: POOL_AUTHORITY,
            base_vault: m.env.base_vault,
            quote_vault: m.env.quote_vault,
            pool_base_vault: m.pool_base_vault,
            pool_quote_vault: m.pool_quote_vault,
            base_mint: m.env.base_mint,
            quote_mint: m.env.quote_mint,
            base_token_program: TOKEN,
            quote_token_program: TOKEN,
            event_authority: dbc_event_authority(),
            dbc_program: DBC,
        },
    );
    let anyone = new_solver(&mut m.env);
    send(&mut m.env.svm, &[sweep], &anyone, &[])
}

fn sweep_surplus(m: &mut Market) -> Sent {
    let sweep = ix(
        toll::instruction::SweepSurplus {},
        toll::accounts::SweepSurplus {
            problem: m.env.problem,
            pool: m.env.pool,
            config: m.env.config,
            pool_authority: POOL_AUTHORITY,
            quote_vault: m.env.quote_vault,
            pool_quote_vault: m.pool_quote_vault,
            quote_mint: m.env.quote_mint,
            quote_token_program: TOKEN,
            event_authority: dbc_event_authority(),
            dbc_program: DBC,
        },
    );
    let anyone = new_solver(&mut m.env);
    send(&mut m.env.svm, &[sweep], &anyone, &[])
}

#[test]
fn pool_registered() {
    let m = market();
    let state = pool_state(&m).pool_state;
    assert_eq!((state.creator, state.config, state.base_mint), (m.env.problem, m.env.config, m.env.base_mint));
    assert_eq!(problem(&m.env).pool, m.env.pool);
}

#[test]
fn trading_fees_reach_bounty() {
    let mut m = market();
    buy(&mut m, 2 * ONE);
    buy(&mut m, ONE);
    let owed = pool_state(&m).pool_state.creator_quote_fee;
    assert!(owed > 0, "the creator earned nothing");
    assert_eq!(pool_state(&m).pool_state.partner_quote_fee, 0);

    let sent = sweep_fees(&mut m).unwrap_or_else(|f| panic!("sweep {:?}", f.meta.logs));
    assert_eq!(token_amount(&m.env.svm, &m.env.quote_vault), owed);
    let swept = events::<toll::state::Swept>(&sent);
    assert_eq!(swept.len(), 1);
    assert_eq!((swept[0].problem, swept[0].source, swept[0].base, swept[0].quote), (m.env.problem, toll::state::SweepSource::TradingFees, 0, owed));
    assert_eq!(pool_state(&m).pool_state.creator_quote_fee, 0);

    buy(&mut m, ONE);
    let more = pool_state(&m).pool_state.creator_quote_fee;
    sweep_fees(&mut m).unwrap();
    assert_eq!(token_amount(&m.env.svm, &m.env.quote_vault), owed + more);
    println!("dbc_fees: owed_after_3_quote {owed} owed_after_1_more {more}");
}

#[test]
fn surplus_reaches_bounty() {
    let mut m = market();
    assert!(sweep_surplus(&mut m).is_err(), "surplus before the curve completes");
    buy_out_the_curve(&mut m);
    sweep_fees(&mut m).unwrap();

    let state = pool_state(&m).pool_state;
    let config_data = m.env.svm.get_account(&m.env.config).unwrap().data;
    let config = bytemuck::pod_read_unaligned::<toll::dynamic_bonding_curve::accounts::PoolConfig>(
        &config_data[8..8 + std::mem::size_of::<toll::dynamic_bonding_curve::accounts::PoolConfig>()],
    );
    assert!(state.quote_reserve >= config.migration_quote_threshold, "the curve is not complete");
    let total = state.quote_reserve - config.migration_quote_threshold;
    let owed = total * 80 / 100 * u64::from(config.creator_trading_fee_percentage) / 100;

    let before = token_amount(&m.env.svm, &m.env.quote_vault);
    let sent = sweep_surplus(&mut m).unwrap_or_else(|f| panic!("surplus {:?}", f.meta.logs));
    assert_eq!(token_amount(&m.env.svm, &m.env.quote_vault) - before, owed);
    let swept = events::<toll::state::Swept>(&sent);
    assert_eq!(swept.len(), 1);
    assert_eq!((swept[0].source, swept[0].base, swept[0].quote), (toll::state::SweepSource::Surplus, 0, owed));
    assert!(sweep_surplus(&mut m).is_err(), "surplus withdrawn twice");
    println!("dbc_surplus: reserve {} threshold {} owed {owed}", state.quote_reserve, config.migration_quote_threshold);
}

#[test]
fn first_buy_fee_reaches_bounty() {
    let mut m = market_with_first_buy(ONE);
    let state = pool_state(&m).pool_state;
    assert_eq!(state.creator, m.env.problem);
    assert_eq!((token_amount(&m.env.svm, &m.launcher_base), state.creator_quote_fee), (FIRST_BUY_TOKENS, FIRST_BUY_FEE));
    sweep_fees(&mut m).unwrap_or_else(|f| panic!("sweep {:?}", f.meta.logs));
    assert_eq!(token_amount(&m.env.svm, &m.env.quote_vault), FIRST_BUY_FEE);
    if std::env::var_os("SAVE_CONFIG_FIXTURE").is_some() {
        let data = m.env.svm.get_account(&m.env.config).unwrap().data;
        let hex: String = data.iter().map(|b| format!("{b:02x}")).collect();
        std::fs::write(fixture_path("dbc_config_account_test.hex"), hex).unwrap();
    }
}

fn fee_of_buy(m: &mut Market, quote_in: u64) -> u64 {
    let before = pool_state(m).pool_state.creator_quote_fee;
    buy(m, quote_in);
    pool_state(m).pool_state.creator_quote_fee - before
}

#[test]
fn launch_window_fee_reaches_bounty() {
    let mut m = market_with_first_buy(ONE);
    let sniped = fee_of_buy(&mut m, ONE);
    assert_eq!(sniped, ONE / 2 * 80 / 100, "a buy at the opening pays 50%, 80% of it to the bounty");
    advance(&mut m.env, WINDOW_SLOTS);
    let later = fee_of_buy(&mut m, ONE);
    assert_eq!(later, FIRST_BUY_FEE, "after the window a buy pays 1%, like the launcher's first buy");
    sweep_fees(&mut m).unwrap_or_else(|f| panic!("sweep {:?}", f.meta.logs));
    assert_eq!(token_amount(&m.env.svm, &m.env.quote_vault), FIRST_BUY_FEE + sniped + later);
    println!("dbc_launch_window: first buy fee {FIRST_BUY_FEE}, sniper fee {sniped}, after the window {later}");
}

#[test]
fn launch_window_halfway() {
    let mut m = market_with_first_buy(ONE);
    advance(&mut m.env, WINDOW_SLOTS / 2);
    let fee = fee_of_buy(&mut m, ONE);
    assert!(fee < ONE / 2 * 80 / 100 && fee > FIRST_BUY_FEE, "fee {fee}");
}

#[test]
fn solver_claims_trading_fees() {
    let mut m = market();
    buy(&mut m, 5 * ONE);
    sweep_fees(&mut m).unwrap();
    let bounty = token_amount(&m.env.svm, &m.env.quote_vault);
    assert!(bounty > 0);

    let run = upload(&mut m.env, &fixture("7x7x9_m314_ZT"), [31u8; 32]);
    reveal(&mut m.env, &run).unwrap();
    verify_all(&mut m.env, &run, 20_000);
    advance(&mut m.env, GRACE);
    let (solver_base, solver_quote) = wallets(&mut m.env, &run.solver.pubkey());
    let claim = claim_ix(&m.env, &run.solver.pubkey(), solver_base, solver_quote);
    send(&mut m.env.svm, &[claim], &run.solver, &[]).unwrap();
    assert_eq!(token_amount(&m.env.svm, &solver_quote), bounty);

    buy(&mut m, ONE);
    sweep_fees(&mut m).unwrap();
    let later = token_amount(&m.env.svm, &m.env.quote_vault);
    assert!(later > 0, "fees stop after the solve");
    let claim = claim_ix(&m.env, &run.solver.pubkey(), solver_base, solver_quote);
    send(&mut m.env.svm, &[claim], &run.solver, &[]).unwrap();
    assert_eq!(token_amount(&m.env.svm, &solver_quote), bounty + later);
}

fn damm_pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &DAMM).0
}

struct Graduated {
    damm_pool: Pubkey,
    position: Pubkey,
    position_nft_account: Pubkey,
    damm_base_vault: Pubkey,
    damm_quote_vault: Pubkey,
}

fn graduate(m: &mut Market) -> Graduated {
    buy_out_the_curve(m);
    let config = std::fs::read(fixture_path("damm_v2_config_bps100.bin")).unwrap();
    put(&mut m.env.svm, DAMM_CONFIG, DAMM, config);
    m.env.svm.airdrop(&POOL_AUTHORITY, 10 * ONE).unwrap();

    let (base, quote) = (m.env.base_mint, m.env.quote_mint);
    let (high, low) = if base > quote { (base, quote) } else { (quote, base) };
    let damm_pool = damm_pda(&[b"pool", DAMM_CONFIG.as_ref(), high.as_ref(), low.as_ref()]);
    let damm_base_vault = damm_pda(&[b"token_vault", base.as_ref(), damm_pool.as_ref()]);
    let damm_quote_vault = damm_pda(&[b"token_vault", quote.as_ref(), damm_pool.as_ref()]);
    let (first, second) = (Keypair::new(), Keypair::new());
    let position_of = |nft: &Keypair| damm_pda(&[b"position", nft.pubkey().as_ref()]);
    let nft_account_of = |nft: &Keypair| damm_pda(&[b"position_nft_account", nft.pubkey().as_ref()]);

    let mut migrate = dbc_ix(
        dbc_args::MigrationDammV2 {},
        dbc_accounts::MigrationDammV2 {
            virtual_pool: m.env.pool,
            migration_metadata: Pubkey::new_unique(),
            config: m.env.config,
            pool_authority: POOL_AUTHORITY,
            pool: damm_pool,
            first_position_nft_mint: first.pubkey(),
            first_position_nft_account: nft_account_of(&first),
            first_position: position_of(&first),
            second_position_nft_mint: Some(second.pubkey()),
            second_position_nft_account: Some(nft_account_of(&second)),
            second_position: Some(position_of(&second)),
            damm_pool_authority: damm_pda(&[b"pool_authority"]),
            amm_program: DAMM,
            base_mint: base,
            quote_mint: quote,
            token_a_vault: damm_base_vault,
            token_b_vault: damm_quote_vault,
            base_vault: m.pool_base_vault,
            quote_vault: m.pool_quote_vault,
            payer: m.trader.pubkey(),
            token_base_program: TOKEN,
            token_quote_program: TOKEN,
            token_2022_program: anchor_spl::token_2022::ID,
            damm_event_authority: damm_pda(&[b"__event_authority"]),
            system_program: SYSTEM,
        },
    );
    migrate.accounts.push(AccountMeta::new_readonly(DAMM_CONFIG, false));
    let trader = m.trader.insecure_clone();
    send(&mut m.env.svm, &[compute_limit(1_000_000), migrate], &trader, &[&first, &second])
        .unwrap_or_else(|f| panic!("migrate {:?}", f.meta.logs));
    Graduated {
        damm_pool,
        position: position_of(&first),
        position_nft_account: nft_account_of(&first),
        damm_base_vault,
        damm_quote_vault,
    }
}

fn damm_buy(m: &mut Market, g: &Graduated, quote_in: u64) {
    let swap = Instruction::new_with_bytes(
        DAMM,
        &toll::cp_amm::client::args::Swap {
            _params: toll::cp_amm::types::SwapParameters { amount_in: quote_in, minimum_amount_out: 0 },
        }
        .data(),
        toll::cp_amm::client::accounts::Swap {
            pool_authority: damm_pda(&[b"pool_authority"]),
            pool: g.damm_pool,
            input_token_account: m.trader_quote,
            output_token_account: m.trader_base,
            token_a_vault: g.damm_base_vault,
            token_b_vault: g.damm_quote_vault,
            token_a_mint: m.env.base_mint,
            token_b_mint: m.env.quote_mint,
            payer: m.trader.pubkey(),
            token_a_program: TOKEN,
            token_b_program: TOKEN,
            referral_token_account: None,
            event_authority: damm_pda(&[b"__event_authority"]),
            program: DAMM,
        }
        .to_account_metas(None),
    );
    let trader = m.trader.insecure_clone();
    send(&mut m.env.svm, &[compute_limit(400_000), swap], &trader, &[]).unwrap_or_else(|f| panic!("damm swap {:?}", f.meta.logs));
}

fn sweep_position(m: &mut Market, g: &Graduated) -> Sent {
    let sweep = ix(
        toll::instruction::SweepPositionFees {},
        toll::accounts::SweepPositionFees {
            problem: m.env.problem,
            damm_pool_authority: damm_pda(&[b"pool_authority"]),
            damm_pool: g.damm_pool,
            position: g.position,
            position_nft_account: g.position_nft_account,
            base_vault: m.env.base_vault,
            quote_vault: m.env.quote_vault,
            damm_base_vault: g.damm_base_vault,
            damm_quote_vault: g.damm_quote_vault,
            base_mint: m.env.base_mint,
            quote_mint: m.env.quote_mint,
            base_token_program: TOKEN,
            quote_token_program: TOKEN,
            damm_event_authority: damm_pda(&[b"__event_authority"]),
            damm_program: DAMM,
        },
    );
    let anyone = new_solver(&mut m.env);
    send(&mut m.env.svm, &[sweep], &anyone, &[])
}

#[test]
fn graduated_position_fees() {
    let mut m = market();
    let g = graduate(&mut m);
    let nft_account = m.env.svm.get_account(&g.position_nft_account).unwrap().data;
    assert_eq!(&nft_account[32..64], m.env.problem.as_ref(), "the creator position is not the problem's");

    sweep_fees(&mut m).unwrap();
    let before = (token_amount(&m.env.svm, &m.env.base_vault), token_amount(&m.env.svm, &m.env.quote_vault));
    damm_buy(&mut m, &g, 2 * ONE);
    damm_buy(&mut m, &g, 2 * ONE);
    let sent = sweep_position(&mut m, &g).unwrap_or_else(|f| panic!("sweep position {:?}", f.meta.logs));
    let after = (token_amount(&m.env.svm, &m.env.base_vault), token_amount(&m.env.svm, &m.env.quote_vault));
    assert!(after.0 + after.1 > before.0 + before.1, "no DAMM v2 fees reached the vaults");
    let swept = events::<toll::state::Swept>(&sent);
    assert_eq!(swept.len(), 1);
    assert_eq!((swept[0].source, swept[0].base, swept[0].quote), (toll::state::SweepSource::PositionFees, after.0 - before.0, after.1 - before.1));
    println!("damm_fees: base {} quote {}", after.0 - before.0, after.1 - before.1);
}

#[test]
fn foreign_position_not_swept() {
    let mut m = market();
    let mut g = graduate(&mut m);
    let nft = Keypair::new();
    let position = damm_pda(&[b"position", nft.pubkey().as_ref()]);
    let nft_account = damm_pda(&[b"position_nft_account", nft.pubkey().as_ref()]);
    let create = Instruction::new_with_bytes(
        DAMM,
        &toll::cp_amm::client::args::CreatePosition {}.data(),
        toll::cp_amm::client::accounts::CreatePosition {
            owner: m.trader.pubkey(),
            position_nft_mint: nft.pubkey(),
            position_nft_account: nft_account,
            pool: g.damm_pool,
            position,
            pool_authority: damm_pda(&[b"pool_authority"]),
            payer: m.trader.pubkey(),
            token_program: anchor_spl::token_2022::ID,
            system_program: SYSTEM,
            event_authority: damm_pda(&[b"__event_authority"]),
            program: DAMM,
        }
        .to_account_metas(None),
    );
    let trader = m.trader.insecure_clone();
    send(&mut m.env.svm, &[create], &trader, &[&nft]).unwrap_or_else(|f| panic!("create position {:?}", f.meta.logs));
    let held = m.env.svm.get_account(&nft_account).unwrap().data;
    assert_eq!(&held[32..64], m.trader.pubkey().as_ref());

    g.position = position;
    g.position_nft_account = nft_account;
    assert!(error_in(&sweep_position(&mut m, &g), "InvalidAuthority"));
}
