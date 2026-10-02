use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::PROBLEM_SEED;
use crate::dynamic_bonding_curve::{self, program::DynamicBondingCurve};
use crate::state::{Problem, SweepSource, Swept};

/// Permissionless: moves the creator's share of DBC trading fees into the problem's vaults.
#[derive(Accounts)]
pub struct SweepTradingFees<'info> {
    #[account(has_one = pool, has_one = base_vault, has_one = quote_vault, has_one = base_mint, has_one = quote_mint)]
    pub problem: Box<Account<'info, Problem>>,
    /// CHECK: checked by the DBC program
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: DBC's pool authority, checked by the DBC program
    pub pool_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the pool's base token vault, checked by the DBC program
    #[account(mut)]
    pub pool_base_vault: UncheckedAccount<'info>,
    /// CHECK: the pool's quote token vault, checked by the DBC program
    #[account(mut)]
    pub pool_quote_vault: UncheckedAccount<'info>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    /// CHECK: DBC's event authority, checked by the DBC program
    pub event_authority: UncheckedAccount<'info>,
    pub dbc_program: Program<'info, DynamicBondingCurve>,
}

pub fn handle_sweep_trading_fees(ctx: Context<SweepTradingFees>) -> Result<()> {
    let problem = &ctx.accounts.problem;
    let statement = [problem.n1, problem.n2, problem.n3];
    let target = problem.target_rank.to_le_bytes();
    let seeds: &[&[u8]] = &[PROBLEM_SEED, problem.pool.as_ref(), &statement, &target, &[problem.bump]];
    let accounts = dynamic_bonding_curve::cpi::accounts::ClaimCreatorTradingFee {
        pool_authority: ctx.accounts.pool_authority.to_account_info(),
        pool: ctx.accounts.pool.to_account_info(),
        token_a_account: ctx.accounts.base_vault.to_account_info(),
        token_b_account: ctx.accounts.quote_vault.to_account_info(),
        base_vault: ctx.accounts.pool_base_vault.to_account_info(),
        quote_vault: ctx.accounts.pool_quote_vault.to_account_info(),
        base_mint: ctx.accounts.base_mint.to_account_info(),
        quote_mint: ctx.accounts.quote_mint.to_account_info(),
        creator: problem.to_account_info(),
        token_base_program: ctx.accounts.base_token_program.to_account_info(),
        token_quote_program: ctx.accounts.quote_token_program.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        program: ctx.accounts.dbc_program.to_account_info(),
    };
    let signer = &[seeds];
    let before = (ctx.accounts.base_vault.amount, ctx.accounts.quote_vault.amount);
    let cpi = CpiContext::new_with_signer(ctx.accounts.dbc_program.key(), accounts, signer);
    dynamic_bonding_curve::cpi::claim_creator_trading_fee(cpi, u64::MAX, u64::MAX)?;
    ctx.accounts.base_vault.reload()?;
    ctx.accounts.quote_vault.reload()?;
    emit!(Swept {
        problem: ctx.accounts.problem.key(),
        source: SweepSource::TradingFees,
        base: ctx.accounts.base_vault.amount.saturating_sub(before.0),
        quote: ctx.accounts.quote_vault.amount.saturating_sub(before.1),
    });
    Ok(())
}
