"use client";

import { useState, useEffect, useCallback } from "react";

// Point this at your deployed Worker URL, or localhost:8787 for local dev
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

// Medal colours for top-3 spots
const RANK_STYLES = [
  "bg-yellow-400 text-yellow-900",   // 🥇 1st
  "bg-gray-300 text-gray-800",       // 🥈 2nd
  "bg-amber-600 text-amber-100",     // 🥉 3rd
];

export default function SellerDashboard() {
  const [auction, setAuction]         = useState(null);
  const [bids, setBids]               = useState([]);
  const [closed, setClosed]           = useState(false);
  const [winner, setWinner]           = useState(null);
  const [checkoutLink, setCheckoutLink] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]             = useState(null);

  // ── Poll /api/bids every 2 seconds ───────────────────────────────────
  const fetchBids = useCallback(async () => {
    try {
      const res  = await fetch(`${WORKER_URL}/api/bids`);
      const data = await res.json();
      setAuction(data.auction);
      setBids(data.bids ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);

      // Sync closed state if auction was closed from another session
      if (data.auction?.status === "closed") setClosed(true);
    } catch (e) {
      setError("Cannot reach Worker — is it running?");
    }
  }, []);

  useEffect(() => {
    fetchBids(); // immediate first load
    const id = setInterval(fetchBids, 2000);
    return () => clearInterval(id);
  }, [fetchBids]);

  // ── Close auction & generate checkout link ────────────────────────────
  async function handleCloseAuction() {
    try {
      const res  = await fetch(`${WORKER_URL}/api/close-auction`, { method: "POST" });
      const data = await res.json();
      setClosed(true);
      setWinner(data.winner);
      setCheckoutLink(data.checkoutLink);
    } catch {
      setError("Failed to close auction.");
    }
  }

  const topBidder = bids[0] ?? null;

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center px-4 py-10">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="w-full max-w-2xl mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🔴 Live Auction Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {auction
              ? <>Item: <span className="text-white font-medium">{auction.item_name}</span> · Base price: <span className="text-green-400">RM {auction.base_price}</span></>
              : "No active auction"}
          </p>
        </div>

        {/* Live pulse indicator */}
        {!closed && auction && (
          <span className="flex items-center gap-2 text-sm text-red-400 font-semibold">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            LIVE
          </span>
        )}
        {closed && (
          <span className="text-sm font-semibold text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
            AUCTION CLOSED
          </span>
        )}
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="w-full max-w-2xl mb-4 bg-red-900/50 border border-red-600 text-red-300 text-sm px-4 py-3 rounded-lg">
          ⚠ {error}
        </div>
      )}

      {/* ── Winner card (post-close) ────────────────────────────────────── */}
      {closed && winner && (
        <div className="w-full max-w-2xl mb-6 bg-yellow-400/10 border border-yellow-400 rounded-xl px-6 py-4">
          <p className="text-yellow-400 font-bold text-lg">🏆 Auction Closed — Winner</p>
          <p className="text-2xl font-bold mt-1">{winner.bidder_name}</p>
          <p className="text-green-400 text-xl font-semibold">RM {Number(winner.bid_amount).toFixed(2)}</p>
          {checkoutLink && (
            <a
              href={checkoutLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block bg-green-500 hover:bg-green-400 text-black font-bold px-5 py-2 rounded-lg text-sm transition"
            >
              💳 Send Checkout Link →
            </a>
          )}
        </div>
      )}

      {/* ── Leaderboard ────────────────────────────────────────────────── */}
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <span className="font-semibold text-sm text-gray-300">Top Bidders</span>
          <span className="text-xs text-gray-500">
            {lastUpdated ? `Updated ${lastUpdated}` : "Loading..."}
          </span>
        </div>

        {bids.length === 0 ? (
          <div className="text-center text-gray-500 py-16 text-sm">
            Waiting for bids… start the live stream!
          </div>
        ) : (
          <ul>
            {bids.map((bid, i) => (
              <li
                key={bid.bidder_name}
                className={`flex items-center gap-4 px-5 py-4 border-b border-gray-800/60 last:border-0 transition-colors ${
                  i === 0 ? "bg-yellow-400/5" : "hover:bg-gray-800/40"
                }`}
              >
                {/* Rank badge */}
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  RANK_STYLES[i] ?? "bg-gray-700 text-gray-300"
                }`}>
                  {i + 1}
                </span>

                {/* Name */}
                <span className="flex-1 font-medium truncate">{bid.bidder_name}</span>

                {/* Bid amount */}
                <span className={`font-bold text-lg tabular-nums ${i === 0 ? "text-yellow-400" : "text-green-400"}`}>
                  RM {Number(bid.bid_amount).toFixed(2)}
                </span>

                {/* Timestamp */}
                <span className="text-xs text-gray-600 w-20 text-right hidden sm:block">
                  {new Date(bid.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Close Auction CTA ───────────────────────────────────────────── */}
      {!closed && auction && topBidder && (
        <div className="w-full max-w-2xl mt-6">
          <button
            onClick={handleCloseAuction}
            className="w-full bg-red-600 hover:bg-red-500 active:scale-95 transition text-white font-bold py-4 rounded-xl text-base shadow-lg"
          >
            🔒 Close Auction &amp; Generate Checkout Link for {topBidder.bidder_name}
          </button>
          <p className="text-center text-xs text-gray-600 mt-2">
            This will lock the auction and declare {topBidder.bidder_name} (RM {Number(topBidder.bid_amount).toFixed(2)}) as the winner.
          </p>
        </div>
      )}
    </main>
  );
}
