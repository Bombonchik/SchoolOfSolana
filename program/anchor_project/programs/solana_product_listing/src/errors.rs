use anchor_lang::prelude::*;

#[error_code]
pub enum ProductListingError {
    #[msg("The name is too long")]
    NameTooLong,
    #[msg("The image URL is too long")]
    UrlTooLong,
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("The listing is currently not active.")]
    ListingClosed,
    #[msg("Price math overflow.")]
    MathOverflow,
    #[msg("Pyth price feed is stale.")]
    StalePrice,
    #[msg("Invalid Pyth price feed.")]
    InvalidPriceFeed,
}
