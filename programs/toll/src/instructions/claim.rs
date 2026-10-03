use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

use crate::constants::PROBLEM_SEED;
use crate::error::TollError;
use crate::state::{Claimed, Problem};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,
    #[account(
        mut,
        has_one = base_vault,
        has_one = quote_vault,
        has_one = base_mint,
        has_one = quote_mint,
        constraint = problem.solver == Some(solver.key()) @ TollError::NotSolver,
    )]
    pub problem: Box<Account<'info, Problem>>,
    #[account(mut)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = base_mint, token::authority = solver, token::token_program = base_token_program)]
    pub solver_base: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::authority = solver, token::token_program = quote_token_program)]
    pub solver_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let problem = &ctx.accounts.problem;
    require!(problem.finalized(Clock::get()?.slot), TollError::GracePending);
    let statement = [problem.n1, problem.n2, problem.n3];
    let target = problem.target_rank.to_le_bytes();
    let seeds: &[&[u8]] = &[PROBLEM_SEED, problem.launchpad.as_ref(), problem.pool.as_ref(), &statement, &target, &[problem.bump]];
    let signer = &[seeds];

    let a = &ctx.accounts;
    let paid = (a.base_vault.amount, a.quote_vault.amount);
    for (vault, to, mint, program) in [
        (&a.base_vault, &a.solver_base, &a.base_mint, &a.base_token_program),
        (&a.quote_vault, &a.solver_quote, &a.quote_mint, &a.quote_token_program),
    ] {
        if vault.amount == 0 {
            continue;
        }
        let accounts = TransferChecked {
            from: vault.to_account_info(),
            mint: mint.to_account_info(),
            to: to.to_account_info(),
            authority: problem.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(program.key(), accounts, signer),
            vault.amount,
            mint.decimals,
        )?;
    }

    let info = ctx.accounts.problem.to_account_info();
    let rent = Rent::get()?.minimum_balance(info.data_len());
    let spare = info.lamports().saturating_sub(rent);
    ctx.accounts.problem.sub_lamports(spare)?;
    ctx.accounts.solver.add_lamports(spare)?;
    emit!(Claimed { problem: ctx.accounts.problem.key(), solver: ctx.accounts.solver.key(), base: paid.0, quote: paid.1, bonds: spare });
    Ok(())
}
