use anchor_lang::prelude::*;

#[event]
pub struct ListingInitialized {
    pub admin: Pubkey,
    pub name: String,
    pub price_usd: u64,
    pub image_url: String
}

#[event]
pub struct ListingUpdated {
    pub admin: Pubkey,
    pub name: String,
    pub new_price_usd: Option<u64>,
    pub new_image_url: Option<String>
}

#[event]
pub struct ListingDeactivated {
    pub admin: Pubkey,
    pub name: String,
}