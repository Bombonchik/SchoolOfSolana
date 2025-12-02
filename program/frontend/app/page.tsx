"use client";
import { useState, useEffect, useMemo } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN, web3 } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { HermesClient } from "@pythnetwork/hermes-client";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import DynamicWalletButton from "../components/DynamicWalletButton";
import idl from "./solana_product_listing.json";

const PROGRAM_ID = new PublicKey("6wuLk2iZ7gca4t3nbNiZYjspFEr8L9xGDwWeMAhojPMw");
const SOL_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const HERMES_URL = "https://hermes.pyth.network";

// Helper to truncate addresses
const shortKey = (key: string) => `${key.slice(0, 4)}...${key.slice(-4)}`;

export default function Home() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, sendTransaction } = useWallet();

  const [listings, setListings] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [view, setView] = useState<"market" | "selling">("market");
  const [status, setStatus] = useState("");
  
  // Form State
  const [name, setName] = useState("");
  const [price, setPrice] = useState("100");
  const [url, setUrl] = useState("");

  // Update State (Map of product name -> new price)
  const [updatePrices, setUpdatePrices] = useState<{[key: string]: string}>({});

  const program = useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
    return new Program(idl as any, provider) as any;
  }, [connection, wallet]);

  const fetchData = async () => {
    if (!program || !publicKey) return;
    try {
        const allListings = await program.account.listingConfig.all();
        const myReceipts = await program.account.receipt.all([
            { memcmp: { offset: 8, bytes: publicKey.toBase58() } }
        ]);

        const enrichedReceipts = myReceipts.map((r: any) => {
            const product = allListings.find((l: any) => l.publicKey.toBase58() === r.account.product.toBase58());
            return {
                ...r,
                productName: product ? product.account.name : "Unknown/Deleted",
                productImage: product ? product.account.imageUrl : null,
            };
        });

        setListings(allListings);
        setReceipts(enrichedReceipts);
    } catch (e) {
        console.error("Fetch error:", e);
    }
  };

  useEffect(() => { fetchData(); }, [program, publicKey]);

  const createListing = async () => {
    if (!program || !publicKey) return;
    try {
      setStatus("Creating...");
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("LISTING_SEED"), publicKey.toBuffer(), Buffer.from(name)],
        program.programId
      );
      await program.methods.initialize(name, url, new BN(price))
        .accounts({
            admin: publicKey,
            treasury: publicKey,
            productListing: listingPda,
            systemProgram: web3.SystemProgram.programId
        } as any).rpc();
      
      setStatus("Created!");
      setName(""); setUrl(""); fetchData();
    } catch (e: any) { setStatus("Error: " + e.message); }
  };

  const updateListingPrice = async (productName: string) => {
    if (!program || !publicKey) return;
    const newPrice = updatePrices[productName];
    if (!newPrice) return;

    try {
      setStatus(`Updating ${productName}...`);
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("LISTING_SEED"), publicKey.toBuffer(), Buffer.from(productName)],
        program.programId
      );

      // update(name, image_url (optional), price (optional))
      await program.methods.update(productName, null, new BN(newPrice))
        .accounts({
            admin: publicKey,
            productListing: listingPda,
        } as any).rpc();

      setStatus("Price Updated!");
      fetchData();
    } catch (e: any) { setStatus("Error: " + e.message); }
  };

  const deactivateListing = async (productName: string) => {
    if (!program || !publicKey) return;
    try {
      setStatus(`Deactivating ${productName}...`);
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("LISTING_SEED"), publicKey.toBuffer(), Buffer.from(productName)],
        program.programId
      );

      await program.methods.deactivate(productName)
        .accounts({
            admin: publicKey,
            productListing: listingPda,
        } as any).rpc();

      setStatus("Listing Deactivated!");
      fetchData();
    } catch (e: any) { setStatus("Error: " + e.message); }
  };

  const buyProduct = async (listing: any) => {
    if (!program || !publicKey || !wallet) return;
    try {
      setStatus(`Fetching Price for ${listing.account.name}...`);
      const sellerKey = listing.account.admin;
      const productName = listing.account.name;

      const hermes = new HermesClient(HERMES_URL, {});
      const update = await hermes.getLatestPriceUpdates([SOL_FEED_ID], { encoding: "base64" });
      const updateBinary = update.binary.data;

      const receiver = new PythSolanaReceiver({ connection, wallet: wallet as any });
      const builder = receiver.newTransactionBuilder({ closeUpdateAccounts: true });
      await builder.addPostPriceUpdates(updateBinary);

      await builder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => {
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

          const ix = await program.methods.buy(sellerKey, productName, receiptSeed)
            .accounts({
              buyer: publicKey,
              treasury: sellerKey,
              productListing: listingPda,
              receipt: receiptPda,
              priceUpdate: pythAccount,
              systemProgram: web3.SystemProgram.programId,
            } as any).instruction();
          
          return [{ instruction: ix, signers: [] }];
      });

      setStatus("Confirming...");
      const txs = await builder.buildVersionedTransactions({ computeUnitPriceMicroLamports: 50000 });
      for (const txObj of txs) {
          const sig = await sendTransaction(txObj.tx, connection, { signers: txObj.signers, skipPreflight: true });
          await connection.confirmTransaction(sig, "confirmed");
      }
      setStatus(`Successfully bought ${productName}!`);
      fetchData();
    } catch (e: any) { setStatus("Error: " + e.message); }
  };

  // FILTERING LOGIC
  const myListings = listings.filter(l => l.account.admin.toBase58() === publicKey?.toBase58());
  
  // MARKETPLACE: Hide my items AND hide inactive items
  const marketplaceListings = listings.filter(l => 
    l.account.admin.toBase58() !== publicKey?.toBase58() && 
    l.account.isActive
  );

  const displayListings = view === "market" ? marketplaceListings : myListings;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">🛍️</div>
            <h1 className="text-2xl font-bold">Solana Dollar Store</h1>
        </div>
        <DynamicWalletButton />
      </div>

      {status && (
        <div className="fixed bottom-5 right-5 bg-slate-800 border border-indigo-500 text-white px-6 py-4 rounded-xl shadow-2xl z-50 max-w-md break-words animate-pulse">
            {status}
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* LEFT COLUMN */}
        <div className="space-y-8">
            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h2 className="text-lg font-bold mb-4 text-indigo-400">Create Listing</h2>
                <div className="space-y-3">
                    <input className="w-full bg-slate-800 p-3 rounded border border-slate-600 outline-none" 
                        placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} />
                    <input className="w-full bg-slate-800 p-3 rounded border border-slate-600 outline-none" 
                        type="number" placeholder="Price (Cents)" value={price} onChange={e => setPrice(e.target.value)} />
                    <input className="w-full bg-slate-800 p-3 rounded border border-slate-600 outline-none" 
                        placeholder="Image URL" value={url} onChange={e => setUrl(e.target.value)} />
                    <button onClick={createListing} disabled={!publicKey} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition disabled:opacity-50">
                        List Item
                    </button>
                </div>
            </div>

            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700">
                <h2 className="text-lg font-bold mb-4 text-emerald-400">My Receipts</h2>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {receipts.length === 0 && <p className="text-slate-500 text-sm">No purchases yet.</p>}
                    {receipts.map((r, i) => (
                        <div key={i} className="bg-slate-800 p-3 rounded-xl flex gap-3 items-center hover:bg-slate-750 transition">
                            <img src={r.productImage || "https://placehold.co/50"} className="w-12 h-12 rounded bg-black object-cover" alt="thumb" />
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm truncate">{r.productName}</div>
                                <div className="text-xs text-slate-400">{(r.account.pricePaidSol.toNumber()/LAMPORTS_PER_SOL).toFixed(4)} SOL</div>
                                <a href={`https://explorer.solana.com/address/${r.publicKey.toBase58()}?cluster=devnet`} target="_blank" className="text-[10px] text-indigo-400 hover:underline">
                                   View: {shortKey(r.publicKey.toBase58())}
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2">
            <div className="flex gap-4 mb-6 border-b border-slate-700 pb-4">
                <button onClick={() => setView("market")} className={`pb-2 px-2 ${view === "market" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400"}`}>Marketplace</button>
                <button onClick={() => setView("selling")} className={`pb-2 px-2 ${view === "selling" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400"}`}>My Listings</button>
                <div className="flex-1" />
                <button onClick={fetchData} className="text-sm text-slate-400 hover:text-white">↻ Refresh</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {displayListings.map((item, i) => (
                    <div key={i} className={`bg-[#1e293b] rounded-2xl overflow-hidden border ${!item.account.isActive ? 'border-red-900 opacity-75' : 'border-slate-700 hover:border-indigo-500/50'} transition`}>
                        <div className="h-40 bg-black relative">
                            <img src={item.account.imageUrl} className="w-full h-full object-cover opacity-80" 
                                 onError={(e) => (e.currentTarget.src = "https://placehold.co/400?text=No+Image")} />
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs font-bold border border-white/10">
                                ${(item.account.priceUsd.toNumber()/100).toFixed(2)}
                            </div>
                            {!item.account.isActive && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center font-bold text-red-500 text-xl uppercase tracking-widest">
                                    Deactivated
                                </div>
                            )}
                        </div>
                        <div className="p-4">
                            <h3 className="font-bold text-lg truncate">{item.account.name}</h3>
                            <p className="text-xs text-slate-400 mb-4 font-mono">Seller: {shortKey(item.account.admin.toBase58())}</p>
                            
                            {/* ACTION BUTTONS */}
                            {view === "market" ? (
                                <button onClick={() => buyProduct(item)} disabled={!item.account.isActive}
                                    className={`w-full py-2 rounded-lg font-bold text-sm ${item.account.isActive ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                                    {item.account.isActive ? "Buy Now" : "Unavailable"}
                                </button>
                            ) : (
                                // SELLER CONTROLS
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <input 
                                            type="number" 
                                            placeholder="New Price"
                                            className="w-full bg-slate-800 p-2 rounded text-sm border border-slate-600"
                                            onChange={(e) => setUpdatePrices({...updatePrices, [item.account.name]: e.target.value})}
                                        />
                                        <button 
                                            onClick={() => updateListingPrice(item.account.name)}
                                            className="bg-blue-600 px-3 rounded text-sm hover:bg-blue-500">
                                            Update
                                        </button>
                                    </div>
                                    {item.account.isActive && (
                                        <button 
                                            onClick={() => deactivateListing(item.account.name)}
                                            className="w-full bg-red-900/50 hover:bg-red-900 text-red-200 py-2 rounded text-sm border border-red-900">
                                            Deactivate Listing
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}