use anchor_lang::prelude::*;

use crate::errors::ProductListingError;
use crate::states::*;
use pyth_solana_receiver_sdk::price_update::{ PriceUpdateV2, get_feed_id_from_hex };


pub fn buy_product(
    ctx: Context<BuyProduct>,
    _seller: Pubkey,
    _product_name: String,
    _receipt_seed: Pubkey
) -> Result<()> {
    let price_update = &mut ctx.accounts.price_update;

    let maximum_age: u64 = 30;
    // SOL/USD feed
    let feed_id: [u8; 32] = get_feed_id_from_hex("0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d")?;
    
    let sol_price_data = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;

    // 100 = $1.00
    let product_price_usd = ctx.accounts.product_listing.price_usd as u128;
    // abs() because price can theoretically be negative in Pyth structs
    let sol_price_usd = sol_price_data.price.abs() as u128;
    let exponent = sol_price_data.exponent.abs() as u32;

    let lamports_per_sol: u128 = 1_000_000_000;
    let numerator = product_price_usd
        .checked_mul(10u128.pow(exponent))
        .ok_or(ProductListingError::MathOverflow)?
        .checked_mul(lamports_per_sol)
        .ok_or(ProductListingError::MathOverflow)?;

    let denominator = sol_price_usd
        .checked_mul(100)
        .ok_or(ProductListingError::MathOverflow)?;

    let amount_in_lamports_u128 = numerator
        .checked_div(denominator)
        .ok_or(ProductListingError::MathOverflow)?;

    let amount = amount_in_lamports_u128 as u64;

    msg!("Price: {} +/- {}", sol_price_data.price, sol_price_data.conf);
    msg!("Pay {} lamports for item cost {}", amount, product_price_usd);

    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, amount)?;

    let receipt = &mut ctx.accounts.receipt;
    receipt.owner = ctx.accounts.buyer.key();
    receipt.product = ctx.accounts.product_listing.key();
    receipt.timestamp = Clock::get()?.unix_timestamp;
    receipt.price_paid_sol = amount;
    receipt.bump = ctx.bumps.receipt;

    Ok(())
}


#[derive(Accounts)]
#[instruction(seller: Pubkey, product_name: String, receipt_seed: Pubkey)]
pub struct BuyProduct<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        constraint = treasury.key() == product_listing.treasury.key()
    )]
    pub treasury: SystemAccount<'info>,
    #[account(
        seeds = [LISTING_SEED.as_bytes(), seller.as_ref(), product_name.as_bytes()],
        constraint = product_listing.is_active @ ProductListingError::ListingClosed,
        bump = product_listing.bump
    )]
    pub product_listing: Account<'info, ListingConfig>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED.as_bytes(), buyer.key().as_ref(), product_listing.key().as_ref(), receipt_seed.as_ref()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    /// CHECK: Validated by Pyth SDK logic in the instruction
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}
