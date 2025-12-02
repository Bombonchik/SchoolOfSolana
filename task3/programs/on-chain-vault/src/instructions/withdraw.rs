//-------------------------------------------------------------------------------
///
/// TASK: Implement the withdraw functionality for the on-chain vault
///
/// Requirements:
/// - Verify that the vault is not locked
/// - Verify that the vault has enough balance to withdraw
/// - Transfer lamports from vault to vault authority
/// - Emit a withdraw event after successful transfer
///
///-------------------------------------------------------------------------------

use anchor_lang::prelude::*;
use crate::state::Vault;
use crate::errors::VaultError;
use crate::events::WithdrawEvent;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", vault_authority.key().as_ref()],
        bump,
        constraint = vault.vault_authority == vault_authority.key()
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

pub fn _withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault_authority = &ctx.accounts.vault_authority;
    let vault = &ctx.accounts.vault;

    require_eq!(vault.locked, false, VaultError::VaultLocked);
    require_gte!(vault.get_lamports(), amount, VaultError::InsufficientBalance);
    require!(vault_authority.lamports().checked_add(amount).is_some(), VaultError::Overflow);

    vault.sub_lamports(amount)?;
    vault_authority.add_lamports(amount)?;

    emit!(WithdrawEvent {
        amount: amount,
        vault_authority: vault_authority.key(),
        vault: vault.key()
    });

    msg!("Successfully withdrew {} lamports", amount);

    Ok(())
}