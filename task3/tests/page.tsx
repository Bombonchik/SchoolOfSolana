"use client";
import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  window.Buffer = Buffer;
}
import { useState, useMemo } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import DynamicWalletButton from "../components/DynamicWalletButton";
import { Program, AnchorProvider, BN, web3 } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
import { ComputeBudgetProgram } from "@solana/web3.js";

import idl from "./solana_product_listing.json";

// Your Deployed Program ID
const PROGRAM_ID = new PublicKey("6wuLk2iZ7gca4t3nbNiZYjspFEr8L9xGDwWeMAhojPMw");

// Pyth Constants (Devnet)
const PYTH_RECEIVER_PROGRAM_ID = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5Cc59");
const SOL_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const HERMES_URL = "https://hermes.pyth.network";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, sendTransaction } = useWallet(); // Get sendTransaction directly

  const [productName, setProductName] = useState("Super Sword");
  const [price, setPrice] = useState("100");
  const [image, setImage] = useState("https://placehold.co/400");
  const [status, setStatus] = useState("");

  const program = useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
    return new Program(idl as any, provider);
  }, [connection, wallet]);

  const createListing = async () => {
    if (!program || !publicKey) return;
    try {
      setStatus("Creating listing...");
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("LISTING_SEED"), publicKey.toBuffer(), Buffer.from(productName)],
        program.programId
      );

      await program.methods
        .initialize(productName, image, new BN(price))
        .accounts({
          admin: publicKey,
          treasury: publicKey,
          productListing: listingPda,
          systemProgram: web3.SystemProgram.programId,
        } as any)
        .rpc();
      setStatus("Listing created!");
    } catch (e: any) {
      console.error(e);
      setStatus("Error: " + e.message);
    }
  };


  const buyProduct = async (sellerKeyStr: string) => {
    if (!program || !publicKey || !wallet) return;
    try {
      setStatus("Fetching Price...");
      const sellerKey = new PublicKey(sellerKeyStr);
      
      // 1. Fetch Price Updates from Hermes (As per docs)
      const hermesClient = new HermesClient(HERMES_URL, {});
      const priceUpdateResult = await hermesClient.getLatestPriceUpdates(
        [SOL_FEED_ID],
        { encoding: "base64" }
      );
      
      // The docs say price updates are strings of base64-encoded binary data
      const priceUpdateData = priceUpdateResult.binary.data;

      if (!priceUpdateData || priceUpdateData.length === 0) {
          throw new Error("Failed to fetch price");
      }

      // 2. Initialize Receiver (As per docs)
      const pythReceiver = new PythSolanaReceiver({ 
          connection: program.provider.connection, 
          wallet: wallet as any 
      });
      
      // 3. Create Transaction Builder
      const transactionBuilder = pythReceiver.newTransactionBuilder({ 
          closeUpdateAccounts: true 
      });
      
      // Add the price update data to the transaction
      await transactionBuilder.addPostPriceUpdates(priceUpdateData);

      // 4. Add Application Logic (As per docs "addPriceConsumerInstructions")
      // This callback gives us the correct 'getPriceUpdateAccount' function
      await transactionBuilder.addPriceConsumerInstructions(
          async (getPriceUpdateAccount) => {
              // SDK gives us the specific PDA for this feed
              const pythAccount = getPriceUpdateAccount(SOL_FEED_ID);

              const [listingPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("LISTING_SEED"), sellerKey.toBuffer(), Buffer.from(productName)],
                program.programId
              );

              const receiptSeed = web3.Keypair.generate().publicKey;
              const [receiptPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("RECEIPT_SEED"), publicKey.toBuffer(), listingPda.toBuffer(), receiptSeed.toBuffer()],
                program.programId
              );

              // Create the Anchor instruction
              const ix = await program.methods
                .buy(sellerKey, productName, receiptSeed)
                .accounts({
                  buyer: publicKey,
                  treasury: sellerKey,
                  productListing: listingPda,
                  receipt: receiptPda,
                  priceUpdate: pythAccount, // Use the address calculated by the SDK
                  systemProgram: web3.SystemProgram.programId,
                } as any)
                .instruction();

              // Return it in the format the SDK expects: { instruction, signers }
              return [{
                  instruction: ix,
                  signers: [] 
              }];
          }
      );

      // 5. Send the Transaction
      setStatus("Sending Atomic Transaction...");
      
      // Build versioned transactions (supports Lookup Tables if needed)
      const txs = await transactionBuilder.buildVersionedTransactions({
          computeUnitPriceMicroLamports: 50000,
      });
      
      for (const txObj of txs) {
          const signature = await sendTransaction(txObj.tx, program.provider.connection, {
              signers: txObj.signers,
              skipPreflight: true, 
          });
          setStatus("Sent! Waiting for confirmation...");
          await program.provider.connection.confirmTransaction(signature, "confirmed");
          console.log("Sig:", signature);
      }

      setStatus("Success! Price updated & Item bought.");
    } catch (e: any) {
      console.error(e);
      setStatus("Error: " + e.message);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Solana Dollar Store
        </h1>
        <DynamicWalletButton />
      </div>

      <div className="flex flex-col gap-8 w-full max-w-md mt-10">
        {/* ADMIN SECTION */}
        <div className="p-6 border border-gray-700 rounded-lg bg-gray-800">
            <h2 className="text-xl font-bold mb-4 text-purple-400">Admin: Create Product</h2>
            <div className="flex flex-col gap-3">
                <input className="p-2 rounded bg-gray-700 text-white" placeholder="Name" value={productName} onChange={e => setProductName(e.target.value)} />
                <input className="p-2 rounded bg-gray-700 text-white" type="number" placeholder="Price (Cents)" value={price} onChange={e => setPrice(e.target.value)} />
                <button onClick={createListing} className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded font-bold transition">
                    Create Listing
                </button>
            </div>
        </div>

        {/* BUYER SECTION */}
        <div className="p-6 border border-gray-700 rounded-lg bg-gray-800">
            <h2 className="text-xl font-bold mb-4 text-green-400">User: Buy Product</h2>
            <div className="flex flex-col gap-3">
                <label className="text-xs text-gray-400">Seller's Public Key</label>
                <input className="p-2 rounded bg-gray-700 text-white" id="sellerKey" placeholder="Paste Seller Pubkey..." />
                <button onClick={() => {
                    // @ts-ignore
                    const key = document.getElementById("sellerKey").value;
                    if(key) buyProduct(key);
                }} className="bg-green-600 hover:bg-green-700 text-white p-3 rounded font-bold transition">
                    Buy Item (Auto-fetch Price)
                </button>
            </div>
        </div>

        {status && (
            <div className="p-4 bg-gray-800 rounded border border-yellow-500 text-yellow-500 text-center font-mono">
                {status}
            </div>
        )}
      </div>
    </main>
  );
}