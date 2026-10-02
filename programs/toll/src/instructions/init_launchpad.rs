use anchor_lang::prelude::*;

use crate::constants::{LAUNCHPAD_SEED, MAX_GRACE_SLOTS, MIN_GRACE_SLOTS};
use crate::error::TollError;
use crate::state::Launchpad;

#[derive(Accounts)]
pub struct InitLaunchpad<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Launchpad::INIT_SPACE,
        seeds = [LAUNCHPAD_SEED, admin.key().as_ref()],
        bump
    )]
    pub launchpad: Account<'info, Launchpad>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_launchpad(ctx: Context<InitLaunchpad>, dbc_config: Pubkey, grace_slots: u64) -> Result<()> {
    require!((MIN_GRACE_SLOTS..=MAX_GRACE_SLOTS).contains(&grace_slots), TollError::BadGrace);
    let launchpad = &mut ctx.accounts.launchpad;
    launchpad.admin = ctx.accounts.admin.key();
    launchpad.dbc_config = dbc_config;
    launchpad.grace_slots = grace_slots;
    launchpad.bump = ctx.bumps.launchpad;
    Ok(())
}
