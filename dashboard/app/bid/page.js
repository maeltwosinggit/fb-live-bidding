"use client";

import { useState, useEffect, useCallback } from "react";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

// Ordinal suffix helper: 1 → "1st", 2 → "2nd", etc.
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function BidPage() {
  const [auction, setAuction]     = useState(null);       // active auction info
  const [loading, setLoading]     = useState(true);       // initial load
  const [name, setName]           = useState("");
  const [amount, setAmount]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Result state after a successful bid
  const [result, setResult]       = useState(null);  // { rank, bid_amount, item_name }
  const [error, setError]         = useState(null);

  // ── Load the active auction on mount ────────────────────────────────
  const loadAuction = useCallback(async () => {
    try {
      const res  = await fetch(`${WORKER_URL}/api/bids`);
      const data = await res.json();
      setAuction(data.auction ?? null);
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  // ── Submit bid ───────────────────────────────────────────────────────
  async function handleBid(e) {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    setSubmitting(true);
    setError(null);

    try {
      const res  = await fetch(`${WORKER_URL}/api/bid`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bidder_name: name.trim(),
          bid_amount:  parseFloat(amount),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Bid failed. Please try again.");
        return;
      }

      // Show rank result
      setResult({
        rank:       data.rank,
        bid_amount: data.bid_amount,
        item_name:  data.auction.item_name,
      });
      setAmount(""); // clear amount for a follow-up overbid
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Raise bid again from the result screen ───────────────────────────
  function handleBidAgain() {
    setResult(null);
    setError(null);
  }

  // ── LOADING ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading auction…</div>
      </main>
    );
  }

  // ── NO ACTIVE AUCTION ────────────────────────────────────────────────
  if (!auction) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-4">😴</p>
        <h1 className="text-white text-xl font-bold mb-2">No Live Auction Right Now</h1>
        <p className="text-gray-500 text-sm">The seller hasn&apos;t opened an auction yet. Check back soon!</p>
      </main>
    );
  }

  // ── BID ACCEPTED — show rank card ────────────────────────────────────
  if (result) {
    const isWinning = result.rank === 1;
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
        <div className={`w-full max-w-sm rounded-2xl border px-6 py-8 text-center ${
          isWinning
            ? "bg-yellow-400/10 border-yellow-400"
            : "bg-gray-900 border-gray-700"
        }`}>
          <p className="text-4xl mb-3">{isWinning ? "🏆" : "✅"}</p>

          <p className={`text-2xl font-black mb-1 ${isWinning ? "text-yellow-400" : "text-white"}`}>
            {isWinning ? "You're Winning!" : `You're ${ordinal(result.rank)}!`}
          </p>

          <p className="text-gray-400 text-sm mb-4">
            Your bid of{" "}
            <span className="text-green-400 font-bold text-base">RM {Number(result.bid_amount).toFixed(2)}</span>
            {" "}is{" "}
            {isWinning ? "currently the highest for" : `ranked ${ordinal(result.rank)} for`}{" "}
            <span className="text-white font-medium">{result.item_name}</span>
          </p>

          {!isWinning && (
            <p className="text-yellow-500 text-xs mb-5">
              Bid higher to take the top spot!
            </p>
          )}

          <button
            onClick={handleBidAgain}
            className={`w-full font-bold py-3 rounded-xl text-sm transition active:scale-95 ${
              isWinning
                ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {isWinning ? "🔒 Hold Your Lead" : "⬆ Raise My Bid"}
          </button>
        </div>
      </main>
    );
  }

  // ── BID FORM ─────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Auction info card */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 mb-6 text-center">
          <p className="text-xs text-red-400 font-semibold uppercase tracking-widest flex items-center justify-center gap-1.5 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Live Auction
          </p>
          <p className="text-white font-bold text-xl leading-tight">{auction.item_name}</p>
          <p className="text-gray-500 text-sm mt-1">
            Starting from <span className="text-green-400 font-semibold">RM {auction.base_price}</span>
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
            ⚠ {error}
          </div>
        )}

        {/* Bid form */}
        <form onSubmit={handleBid} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Name</label>
            <input
              type="text"
              placeholder="e.g. Siti Nurhaliza"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full bg-gray-800 border border-gray-600 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500 placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Bid (RM)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-base">RM</span>
              <input
                type="number"
                placeholder={`${Number(auction.base_price) + 1}`}
                min={Number(auction.base_price) + 0.01}
                step="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-600 text-white rounded-xl pl-12 pr-4 py-3 text-base focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Must be above RM {auction.base_price}
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim() || !amount}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition text-white font-bold py-4 rounded-xl text-base mt-1"
          >
            {submitting ? "Placing Bid…" : "🔨 Place Bid"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700 mt-6">
          Highest bidder wins when the seller closes the auction.
        </p>
      </div>
    </main>
  );
}
