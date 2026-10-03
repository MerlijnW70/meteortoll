use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::PROBLEM_SEED;
use crate::cp_amm::{self, program::CpAmm};
use crate::state::{Problem, SweepSource, Swept};

#[derive(Accounts)]
pub struct SweepPositionFees<'info> {
    #[account(has_one = base_vault, has_one = quote_vault, has_one = base_mint, has_one = quote_mint)]
    pub problem: Box<Account<'info, Problem>>,
    /// CHECK: DAMM v2's pool authority, checked by the DAMM v2 program
    pub damm_pool_authority: UncheckedAccount<'info>,
    /// CHECK: the graduated DAMM v2 pool, checked by the DAMM v2 program
    pub damm_pool: UncheckedAccount<'info>,
    /// CHECK: the problem's position, checked by the DAMM v2 program
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: the token account holding the position NFT, checked by the DAMM v2 program
    pub position_nft_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the DAMM v2 pool's base vault, checked by the DAMM v2 program
    #[account(mut)]
    pub damm_base_vault: UncheckedAccount<'info>,
    /// CHECK: the DAMM v2 pool's quote vault, checked by the DAMM v2 program
    #[account(mut)]
    pub damm_quote_vault: UncheckedAccount<'info>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    /// CHECK: DAMM v2's event authority, checked by the DAMM v2 program
    pub damm_event_authority: UncheckedAccount<'info>,
    pub damm_program: Program<'info, CpAmm>,
}

pub fn handle_sweep_position_fees(ctx: Context<SweepPositionFees>) -> Result<()> {
    let problem = &ctx.accounts.problem;
    let statement = [problem.n1, problem.n2, problem.n3];
    let target = problem.target_rank.to_le_bytes();
    let seeds: &[&[u8]] = &[PROBLEM_SEED, problem.launchpad.as_ref(), problem.pool.as_ref(), &[problem.kind], &statement, &target, &[problem.bump]];
    let accounts = cp_amm::cpi::accounts::ClaimPositionFee {
        pool_authority: ctx.accounts.damm_pool_authority.to_account_info(),
        pool: ctx.accounts.damm_pool.to_account_info(),
        position: ctx.accounts.position.to_account_info(),
        token_a_account: ctx.accounts.base_vault.to_account_info(),
        token_b_account: ctx.accounts.quote_vault.to_account_info(),
        token_a_vault: ctx.accounts.damm_base_vault.to_account_info(),
        token_b_vault: ctx.accounts.damm_quote_vault.to_account_info(),
        token_a_mint: ctx.accounts.base_mint.to_account_info(),
        token_b_mint: ctx.accounts.quote_mint.to_account_info(),
        position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
        signer: problem.to_account_info(),
        token_a_program: ctx.accounts.base_token_program.to_account_info(),
        token_b_program: ctx.accounts.quote_token_program.to_account_info(),
        event_authority: ctx.accounts.damm_event_authority.to_account_info(),
        program: ctx.accounts.damm_program.to_account_info(),
    };
    let signer = &[seeds];
    let before = (ctx.accounts.base_vault.amount, ctx.accounts.quote_vault.amount);
    let cpi = CpiContext::new_with_signer(ctx.accounts.damm_program.key(), accounts, signer);
    cp_amm::cpi::claim_position_fee(cpi)?;
    ctx.accounts.base_vault.reload()?;
    ctx.accounts.quote_vault.reload()?;
    emit!(Swept {
        problem: ctx.accounts.problem.key(),
        source: SweepSource::PositionFees,
        base: ctx.accounts.base_vault.amount.saturating_sub(before.0),
        quote: ctx.accounts.quote_vault.amount.saturating_sub(before.1),
    });
    Ok(())
}
