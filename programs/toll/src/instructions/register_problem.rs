use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{PROBLEM_SEED, VAULT_SEED};
use crate::dynamic_bonding_curve::accounts::{PoolConfig, VirtualPool};
use crate::error::TollError;
use crate::state::{Launchpad, Problem};

/// The problem's address is derived from the pool and the statement, so making it the
/// pool's creator binds that statement to that pool before anyone can register it.
#[derive(Accounts)]
#[instruction(n1: u8, n2: u8, n3: u8, target_rank: u32)]
pub struct RegisterProblem<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub launchpad: Box<Account<'info, Launchpad>>,
    #[account(address = launchpad.dbc_config @ TollError::WrongConfig)]
    pub config: AccountLoader<'info, PoolConfig>,
    pub pool: AccountLoader<'info, VirtualPool>,
    #[account(
        init,
        payer = payer,
        space = 8 + Problem::INIT_SPACE,
        seeds = [PROBLEM_SEED, pool.key().as_ref(), &[n1, n2, n3], &target_rank.to_le_bytes()],
        bump
    )]
    pub problem: Box<Account<'info, Problem>>,
    #[account(mint::token_program = base_token_program)]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = quote_token_program)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED, problem.key().as_ref(), base_mint.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = problem,
        token::token_program = base_token_program,
    )]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED, problem.key().as_ref(), quote_mint.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = problem,
        token::token_program = quote_token_program,
    )]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_problem(ctx: Context<RegisterProblem>, n1: u8, n2: u8, n3: u8, target_rank: u32) -> Result<()> {
    let naive = u32::from(n1) * u32::from(n2) * u32::from(n3);
    require!(target_rank > 0 && target_rank < naive, TollError::BadStatement);

    {
        let pool = ctx.accounts.pool.load()?;
        let state = &pool.pool_state;
        require_keys_eq!(state.config, ctx.accounts.config.key(), TollError::WrongConfig);
        require_keys_eq!(state.creator, ctx.accounts.problem.key(), TollError::CreatorIsNotProblem);
        require_keys_eq!(state.base_mint, ctx.accounts.base_mint.key(), TollError::WrongMint);
        let config = ctx.accounts.config.load()?;
        require_keys_eq!(config.quote_mint, ctx.accounts.quote_mint.key(), TollError::WrongMint);
    }

    let problem = &mut ctx.accounts.problem;
    problem.launchpad = ctx.accounts.launchpad.key();
    problem.pool = ctx.accounts.pool.key();
    problem.base_mint = ctx.accounts.base_mint.key();
    problem.quote_mint = ctx.accounts.quote_mint.key();
    problem.base_vault = ctx.accounts.base_vault.key();
    problem.quote_vault = ctx.accounts.quote_vault.key();
    problem.n1 = n1;
    problem.n2 = n2;
    problem.n3 = n3;
    problem.target_rank = target_rank;
    problem.solver = None;
    problem.solved_rank = 0;
    problem.solver_commit_slot = 0;
    problem.solved_at_slot = 0;
    problem.grace_slots = ctx.accounts.launchpad.grace_slots;
    problem.attempts = 0;
    problem.bump = ctx.bumps.problem;
    Ok(())
}
