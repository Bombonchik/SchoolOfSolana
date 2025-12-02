
use anchor_lang::prelude::*;

use crate::errors::ProductListingError;
use crate::events::ListingUpdated;
use crate::states::*;

pub fn update_listing(
    ctx: Context<UpdateListing>,
    _name: String,
    image_url: Option<String>,
    price_usd: Option<u64>,
) -> Result<()> {
    let product_listing = &mut ctx.accounts.product_listing;

    if let Some(new_url) = &image_url {
        require_gte!(
            URL_LENGTH,
            new_url.as_bytes().len(),
            ProductListingError::UrlTooLong
        );
        product_listing.image_url = new_url.clone();
    }

    if let Some(new_price) = price_usd {
        product_listing.price_usd = new_price;
    }

    emit!(ListingUpdated {
        admin: product_listing.admin.key(),
        name: product_listing.name.clone(),
        new_price_usd: price_usd,
        new_image_url: image_url,
    });

    Ok(())
}


#[derive(Accounts)]
#[instruction(name: String)]
pub struct UpdateListing<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [LISTING_SEED.as_bytes(), admin.key().as_ref(), name.as_bytes()],
        bump = product_listing.bump,
    )]
    pub product_listing: Account<'info, ListingConfig>,
}
