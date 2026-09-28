"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

const RANK_STYLES = [
  "bg-yellow-400 text-yellow-900",
  "bg-gray-300 text-gray-800",
  "bg-amber-600 text-amber-100",
];

// ── QR Code panel (per auction) ───────────────────────────────────────────
function QRPanel({ url, itemName }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 160,
      margin: 2,
      color: { dark: "#ffffff", light: "#111827" },
    });
  }, [url]);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const link = document.createElement("a");
    link.download = `bid-qr-${itemName.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="flex items-center gap-4 bg-gray-800/60 rounded-xl px-4 py-3 mb-4">
      <div className="bg-gray-800 rounded-lg p-2 flex-shrink-0">
        <canvas ref={canvasRef} className="rounded" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-1">Scan to Bid</p>
        <p className="text-xs text-gray-600 font-mono truncate mb-2">{url}</p>
        <div className="flex gap-2">
          <button onClick={handleCopy}
            className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
          <button onClick={handleDownload}
            className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
            ⬇ PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Single auction card ───────────────────────────────────────────────────
function AuctionCard({ auction, bids, onClose }) {
  const [closing, setClosing]     = useState(false);
  const [winner, setWinner]       = useState(null);
  const [checkout, setCheckout]   = useState(null);
  const [closed, setClosed]       = useState(false);

  // QR URL derived from auction ID — survives page refresh
  const bidPageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/bid?auction=${auction.id}`
    : `https://fb-live-bidding-dashboard.pages.dev/bid?auction=${auction.id}`;

  const topBidder = bids?.[0] ?? null;

  async function handleClose() {
    setClosing(true);
    try {
      const res  = await fetch(`${WORKER_URL}/api/close-auction`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction_id: auction.id }),
      });
      const data = await res.json();
      setClosed(true);
      setWinner(data.winner);
      setCheckout(data.checkoutLink);
      onClose(auction.id); // remove from parent list after short delay
    } catch {
      // ignore
    } finally {
      setClosing(false);
    }
  }

  // ── Closed state ─────────────────────────────────────────────────────
  if (closed) {
    return (
      <div className="bg-yellow-400/10 border border-yellow-400 rounded-2xl px-5 py-4 mb-4">
        <p className="text-yellow-400 font-bold text-sm mb-1">🏆 {auction.item_name} — Closed</p>
        {winner ? (
          <>
            <p className="text-white font-bold text-lg">{winner.bidder_name}</p>
            <p className="text-green-400 font-semibold">RM {Number(winner.bid_amount).toFixed(2)}</p>
            {checkout && (
              <a href={checkout} target="_blank" rel="noreferrer"
                className="mt-2 inline-block bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition">
                💳 Send Checkout Link →
              </a>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-sm">No bids received.</p>
        )}
      </div>
    );
  }

  // ── Active state ──────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 mb-4">

      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-bold text-base leading-tight">{auction.item_name}</p>
          <p className="text-gray-500 text-xs mt-0.5">Base: <span className="text-green-400">RM {auction.base_price}</span> · ID #{auction.id}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-red-400 font-semibold flex-shrink-0 ml-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          LIVE
        </span>
      </div>

      {/* QR code */}
      <QRPanel url={bidPageUrl} itemName={auction.item_name} />

      {/* Leaderboard */}
      <div className="rounded-xl overflow-hidden border border-gray-800 mb-3">
        {!bids || bids.length === 0 ? (
          <p className="text-center text-gray-600 text-xs py-4">
            No bids yet — share the QR!
          </p>
        ) : (
          <ul>
            {bids.map((bid, i) => (
              <li key={bid.bidder_name}
                className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 ${i === 0 ? "bg-yellow-400/5" : ""}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${RANK_STYLES[i] ?? "bg-gray-700 text-gray-300"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium truncate text-white">{bid.bidder_name}</span>
                <span className={`text-sm font-bold tabular-nums ${i === 0 ? "text-yellow-400" : "text-green-400"}`}>
                  RM {Number(bid.bid_amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Close button */}
      <button onClick={handleClose} disabled={closing}
        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 active:scale-95 transition text-white font-bold py-2.5 rounded-xl text-sm">
        {closing ? "Closing…" : `🔒 Close & Declare Winner${topBidder ? ` — ${topBidder.bidder_name}` : ""}`}
      </button>
    </div>
  );
}

// ── Main seller dashboard ─────────────────────────────────────────────────
export default function SellerDashboard() {
  const [auctions, setAuctions]       = useState([]);   // all active auctions
  const [allBids, setAllBids]         = useState({});   // { auctionId: bids[] }
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]             = useState(null);

  const [itemName, setItemName]   = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [opening, setOpening]     = useState(false);

  // ── Poll all active auctions every 2 seconds ─────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const res  = await fetch(`${WORKER_URL}/api/bids`);
      const data = await res.json();
      setAuctions(data.auctions ?? []);
      setAllBids(data.allBids   ?? {});
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch {
      setError("Cannot reach Worker.");
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 2000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Remove a closed auction from the local list after 8 seconds
  function handleAuctionClosed(auctionId) {
    setTimeout(() => {
      setAuctions(prev => prev.filter(a => a.id !== auctionId));
    }, 8000);
  }

  // ── Open a new auction (parallel) ────────────────────────────────────
  async function handleOpenAuction(e) {
    e.preventDefault();
    if (!itemName.trim()) return;
    setOpening(true);
    try {
      const res  = await fetch(`${WORKER_URL}/api/open-auction`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_name: itemName.trim(), base_price: parseFloat(basePrice) || 0 }),
      });
      const data = await res.json();
      if (data.opened) {
        setItemName("");
        setBasePrice("");
        await fetchAll(); // refresh immediately
      } else {
        setError(data.error ?? "Failed to open auction.");
      }
    } catch {
      setError("Failed to open auction.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center px-4 py-10">

      {/* Header */}
      <div className="w-full max-w-2xl mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🔴 FB Live Bidding</h1>
          <p className="text-gray-500 text-sm mt-1">
            {auctions.length > 0
              ? `${auctions.length} auction${auctions.length > 1 ? "s" : ""} running`
              : "No active auctions"}
            {lastUpdated && <span className="ml-2 text-gray-700">· {lastUpdated}</span>}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-2xl mb-4 bg-red-900/50 border border-red-600 text-red-300 text-sm px-4 py-3 rounded-lg">
          ⚠ {error}
        </div>
      )}

      {/* Active auction cards */}
      <div className="w-full max-w-2xl">
        {auctions.map(auction => (
          <AuctionCard
            key={auction.id}
            auction={auction}
            bids={allBids[auction.id] ?? []}
            onClose={handleAuctionClosed}
          />
        ))}
      </div>

      {/* ── Open New Auction form (always visible — add as many as you want) ── */}
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl px-6 py-5">
        <h2 className="text-base font-bold mb-4 text-white">
          {auctions.length === 0 ? "🎯 Open Your First Auction" : "➕ Open Another Auction"}
        </h2>
        <form onSubmit={handleOpenAuction} className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Item Name</label>
            <input type="text" placeholder="e.g. Air Jordan 1 Retro"
              value={itemName} onChange={e => setItemName(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Base Price (RM)</label>
            <input type="number" placeholder="e.g. 50" min="0" step="0.01"
              value={basePrice} onChange={e => setBasePrice(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
            />
          </div>
          <button type="submit" disabled={opening || !itemName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition text-white font-bold py-3 rounded-xl text-sm">
            {opening ? "Opening…" : "🚀 Open Auction & Go Live"}
          </button>
        </form>
      </div>

    </main>
  );
}
