
use anchor_lang::prelude::*;

use crate::events::ListingDeactivated;
use crate::states::*;

pub fn deactivate_listing(
    ctx: Context<DeactivateListing>,
    _name: String,
) -> Result<()> {
    let product_listing = &mut ctx.accounts.product_listing;

    product_listing.is_active = false;

    emit!(ListingDeactivated {
        admin: product_listing.admin.key(),
        name: product_listing.name.clone()
    });

    Ok(())
}


#[derive(Accounts)]
#[instruction(name: String)]
pub struct DeactivateListing<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [LISTING_SEED.as_bytes(), admin.key().as_ref(), name.as_bytes()],
        bump = product_listing.bump,
    )]
    pub product_listing: Account<'info, ListingConfig>,
}
