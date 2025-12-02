use anchor_lang::prelude::*;

pub const NAME_LENGTH: usize = 32;
pub const URL_LENGTH: usize = 200;
pub const LISTING_SEED: &str = "LISTING_SEED";
pub const RECEIPT_SEED: &str = "RECEIPT_SEED";

// The product
#[account]
#[derive(InitSpace)]
pub struct ListingConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    #[max_len(NAME_LENGTH)]
    pub name: String,
    #[max_len(URL_LENGTH)]
    pub image_url: String,
    pub price_usd: u64,  // Stored with 2 decimals (100 = $1.00)
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub owner: Pubkey,
    pub product: Pubkey,
    pub timestamp: i64,
    pub price_paid_sol: u64,
    pub bump: u8,
}
