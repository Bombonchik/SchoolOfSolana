use anchor_lang::prelude::*;

use crate::errors::ProductListingError;
use crate::events::ListingInitialized;
use crate::states::*;

pub fn initialize_listing(
    ctx: Context<InitializeListing>,
    name: String,
    image_url: String,
    price_usd: u64
) -> Result<()> {
    require_gte!(
        NAME_LENGTH,
        name.as_bytes().len(),
        ProductListingError::NameTooLong
    );
    require_gte!(
        URL_LENGTH,
        image_url.as_bytes().len(),
        ProductListingError::UrlTooLong
    );

    let product_listing = &mut ctx.accounts.product_listing;

    product_listing.admin = ctx.accounts.admin.key();
    product_listing.treasury = ctx.accounts.treasury.key();
    product_listing.name = name;
    product_listing.image_url = image_url;
    product_listing.price_usd = price_usd;
    product_listing.is_active = true;
    product_listing.bump = ctx.bumps.product_listing;

    emit!(ListingInitialized {
        admin: product_listing.admin.key(),
        name: product_listing.name.clone(),
        price_usd: product_listing.price_usd,
        image_url: product_listing.image_url.clone()
    });

    Ok(())
}


#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeListing<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub treasury: SystemAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + ListingConfig::INIT_SPACE,
        seeds = [LISTING_SEED.as_bytes(), admin.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub product_listing: Account<'info, ListingConfig>,
    pub system_program: Program<'info, System>,
}
