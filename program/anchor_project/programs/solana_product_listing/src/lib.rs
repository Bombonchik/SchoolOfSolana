use anchor_lang::prelude::*;

pub mod states;
pub mod errors;
pub mod events;
pub mod instructions;
use crate::instructions::*;

declare_id!("6wuLk2iZ7gca4t3nbNiZYjspFEr8L9xGDwWeMAhojPMw");

#[program]
pub mod solana_product_listing {
    use super::*;

    pub fn initialize(ctx: Context<InitializeListing>, name: String, image_url: String, price_usd: u64) -> Result<()> {
        initialize_listing(ctx, name, image_url, price_usd)
    }

    pub fn update(ctx: Context<UpdateListing>, name: String, new_image_url: Option<String>, new_price_usd: Option<u64>) -> Result<()> {
        update_listing(ctx, name, new_image_url, new_price_usd)
    }

    pub fn deactivate(ctx: Context<DeactivateListing>, name: String) -> Result<()> {
        deactivate_listing(ctx, name)
    }

    pub fn buy(ctx: Context<BuyProduct>, seller: Pubkey, product_name: String, receipt_seed: Pubkey) -> Result<()> {
        buy_product(ctx, seller, product_name, receipt_seed)
    }
}
