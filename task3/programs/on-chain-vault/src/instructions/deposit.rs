//-------------------------------------------------------------------------------
///
/// TASK: Implement the deposit functionality for the on-chain vault
/// 
/// Requirements:
/// - Verify that the user has enough balance to deposit
/// - Verify that the vault is not locked
/// - Transfer lamports from user to vault using CPI (Cross-Program Invocation)
/// - Emit a deposit event after successful transfer
/// 
///-------------------------------------------------------------------------------

use anchor_lang::prelude::*;
use anchor_lang::system_program::Transfer;
use anchor_lang::system_program::transfer;
use crate::state::Vault;
use crate::errors::VaultError;
use crate::events::DepositEvent;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

pub fn _deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let user = &ctx.accounts.user;
    let vault = &ctx.accounts.vault;
    let system_program = &ctx.accounts.system_program;

    require_eq!(vault.locked, false, VaultError::VaultLocked);
    require_gte!(user.lamports(), amount, VaultError::InsufficientBalance);
    require!(vault.get_lamports().checked_add(amount).is_some(), VaultError::Overflow);
    
    let cpi_program = system_program.to_account_info();
    let cpi_accounts = Transfer {
        from: user.to_account_info(),
        to: vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    transfer(cpi_ctx, amount)?;

    emit!(DepositEvent {
        amount: amount,
        user: user.key(),
        vault: vault.key(),
    });

    Ok(())
}