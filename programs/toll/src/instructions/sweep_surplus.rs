use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::PROBLEM_SEED;
use crate::dynamic_bonding_curve::{self, program::DynamicBondingCurve};
use crate::state::{Problem, SweepSource, Swept};

#[derive(Accounts)]
pub struct SweepSurplus<'info> {
    #[account(has_one = pool, has_one = quote_vault, has_one = quote_mint)]
    pub problem: Box<Account<'info, Problem>>,
    /// CHECK: checked by the DBC program
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: the pool's config, checked by the DBC program
    pub config: UncheckedAccount<'info>,
    /// CHECK: DBC's pool authority, checked by the DBC program
    pub pool_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the pool's quote token vault, checked by the DBC program
    #[account(mut)]
    pub pool_quote_vault: UncheckedAccount<'info>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    /// CHECK: DBC's event authority, checked by the DBC program
    pub event_authority: UncheckedAccount<'info>,
    pub dbc_program: Program<'info, DynamicBondingCurve>,
}

pub fn handle_sweep_surplus(ctx: Context<SweepSurplus>) -> Result<()> {
    let problem = &ctx.accounts.problem;
    let statement = [problem.n1, problem.n2, problem.n3];
    let target = problem.target_rank.to_le_bytes();
    let seeds: &[&[u8]] = &[PROBLEM_SEED, problem.launchpad.as_ref(), problem.pool.as_ref(), &statement, &target, &[problem.bump]];
    let accounts = dynamic_bonding_curve::cpi::accounts::CreatorWithdrawSurplus {
        pool_authority: ctx.accounts.pool_authority.to_account_info(),
        config: ctx.accounts.config.to_account_info(),
        virtual_pool: ctx.accounts.pool.to_account_info(),
        token_quote_account: ctx.accounts.quote_vault.to_account_info(),
        quote_vault: ctx.accounts.pool_quote_vault.to_account_info(),
        quote_mint: ctx.accounts.quote_mint.to_account_info(),
        creator: problem.to_account_info(),
        token_quote_program: ctx.accounts.quote_token_program.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        program: ctx.accounts.dbc_program.to_account_info(),
    };
    let signer = &[seeds];
    let before = ctx.accounts.quote_vault.amount;
    let cpi = CpiContext::new_with_signer(ctx.accounts.dbc_program.key(), accounts, signer);
    dynamic_bonding_curve::cpi::creator_withdraw_surplus(cpi)?;
    ctx.accounts.quote_vault.reload()?;
    emit!(Swept {
        problem: ctx.accounts.problem.key(),
        source: SweepSource::Surplus,
        base: 0,
        quote: ctx.accounts.quote_vault.amount.saturating_sub(before),
    });
    Ok(())
}
