
# Project Description

**Deployed Frontend URL:** https://one-dollar-store.vercel.app/

**Solana Program ID:** `6wuLk2iZ7gca4t3nbNiZYjspFEr8L9xGDwWeMAhojPMw`

## Project Overview

### Description
The **Solana Dollar Store** is a decentralized e-commerce marketplace where sellers can list items with stable prices in **USD (cents)**, and buyers pay in **SOL** at the current market rate.

The core innovation of this dApp is its integration with the **Pyth Network Pull Oracle**. Instead of relying on possibly stale on-chain data, the frontend fetches the real-time price of SOL/USD from Pyth Hermes, pushes it to the blockchain, and executes the purchase in a single **atomic transaction**. This ensures buyers always pay the fair market value and sellers receive the exact dollar amount they expected.

### Key Features
- **Stable Pricing:** Sellers list items in USD cents (e.g., 100 = $1.00), protecting them from crypto volatility.
- **Atomic Oracle Swaps:** The "Buy" action bundles a Pyth Price Update instruction and the Purchase instruction into one transaction, guaranteeing 0-latency pricing.
- **Receipt System:** Every purchase generates a permanent on-chain Receipt PDA, linking the buyer to the specific product they bought.
- **Marketplace Dashboard:** Users can view all active listings on the network, see their own listings, and view their purchase history (Receipts).
- **Admin Controls:** Sellers can update prices, change product images, or deactivate listings to stop sales.

### How to Use the dApp

1.  **Connect Wallet:** Click "Select Wallet" and connect to **Solana Devnet**.
2.  **Create a Listing (Seller):**
    * Enter a Product Name (e.g., "Super Sword").
    * Enter a Price in Cents (e.g., 250 for $2.50).
    * Paste a direct Image URL.
    * Click "Create Listing".
3.  **Buy a Product (Buyer):**
    * Browse the "Marketplace" section.
    * Click "Buy Now" on any item.
    * Approve the transaction (this updates the Oracle price and transfers SOL instantly).
4.  **View Receipts:** Check the "My Receipts" panel to see proof of your on-chain purchases.

## Program Architecture

The project follows a modular Anchor architecture, separating state, instructions, and error handling.

### PDA Usage
I implemented Program Derived Addresses (PDAs) to create deterministic, searchable addresses for products and receipts without requiring a centralized database.

**PDAs Used:**
- **ListingConfig**: `["LISTING_SEED", seller_pubkey, name_seed]`
    - **Purpose:** Stores the product details (price, image, active state). Using the name as a seed allows a single seller to create multiple distinct products.
- **Receipt**: `["RECEIPT_SEED", buyer_pubkey, listing_pubkey, receipt_seed]`
    - **Purpose:** Serves as proof of purchase. It links the specific Buyer to the specific Listing. The `receipt_seed` (random) allows a user to buy the same item multiple times.

### Program Instructions

**Instructions Implemented:**
- `initialize_listing`: Creates a new `ListingConfig` account, setting the price in USD and storing the image URL.
- `update_listing`: Allows the seller to update the price or image URL. Uses `Option<T>` to allow partial updates.
- `deactivate_listing`: Sets the `is_active` flag to false, preventing future purchases without deleting the data history.
- `buy_product`:
    1.  Verifies the Pyth Price Feed is fresh (< 60 seconds old).
    2.  Calculates the SOL cost using Fixed-Point math: `(Price_USD / SOL_Price)`.
    3.  Transfers Lamports from Buyer to Seller via CPI.
    4.  Initializes the `Receipt` PDA.

### Account Structure

```rust
#[account]
#[derive(InitSpace)]
pub struct ListingConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(200)]
    pub image_url: String,
    pub price_usd: u64,    // Price in cents (2 decimals)
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub owner: Pubkey,
    pub listing_key: Pubkey, // Link to the parent product
    pub timestamp: i64,
    pub price_paid_sol: u64, // Historical record of cost
    pub bump: u8,
}
```

## Testing

### Test Coverage

I utilized the Anchor framework (TypeScript) to test instruction logic and security constraints.

**Happy Path Tests:**

- **Initialize Listing:** Verifies that a user can create a product and that data (price/image) is stored correctly on-chain.
    
- **Update Listing:** Verifies that a seller can change the price of an existing item.
    
- **Deactivate Listing:** Verifies that the `is_active` flag correctly flips to false.
    
- **Buy Product:** Simulates the purchase flow. _Note: In local tests, this verifies instruction routing; on Devnet, the frontend performs the real atomic update._
    

**Unhappy Path Tests:**

- **Buy Deactivated Item:** Ensures that a user cannot purchase an item after the seller has called `deactivate`. The program correctly throws the `ListingClosed` error.
    

### Running Tests

Bash

```
anchor test
```

### Additional Notes for Evaluators

This project uses the **Pyth Pull Oracle** architecture (Hermes).

- **Frontend Integration:** The frontend fetches a signed "Price Update" (VAA) from the Pyth HTTP API.
    
- **Atomic Transaction:** The frontend bundles the `pyth_solana_receiver::post_update` instruction AND my custom `buy_product` instruction into a single transaction.
    
- **Security:** The `buy_product` instruction reads the `PriceUpdateV2` account in the same slot it was updated, ensuring maximum security and price freshness.