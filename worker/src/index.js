/**
 * Cloudflare Worker — FB Live Bidding Backend
 * Routes:
 *   POST /webhook              — Meta Graph API live-comment payloads → bid parser
 *   GET  /api/bids             — ALL active auctions + top-10 bids each
 *   GET  /api/bids?auction=ID  — single auction bids (used by /bid page)
 *   POST /api/bid              — direct bid { auction_id, bidder_name, bid_amount }
 *   POST /api/open-auction     — open a new auction (parallel-safe, no auto-close)
 *   POST /api/close-auction    — close a specific auction { auction_id }
 */

const BID_REGEX = /\+\s*RM\s*(\d+(?:\.\d{1,2})?)/i;

// Reusable: fetch top-10 bids for one auction
async function getTopBids(db, auctionId) {
  const { results } = await db
    .prepare(`
      SELECT bidder_name, MAX(bid_amount) AS bid_amount, MAX(timestamp) AS timestamp
      FROM Bids
      WHERE auction_id = ?
      GROUP BY bidder_name
      ORDER BY bid_amount DESC
      LIMIT 10
    `)
    .bind(auctionId)
    .all();
  return results;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // ── POST /webhook ────────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/webhook") {
      let body;
      try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

      const changes = body?.entry?.[0]?.changes ?? [];
      for (const change of changes) {
        const value      = change?.value ?? {};
        const message    = value?.message ?? "";
        const bidderName = value?.from?.name ?? "Anonymous";
        const match      = BID_REGEX.exec(message);
        if (!match) continue;

        const bidAmount = parseFloat(match[1]);
        // Webhook bids go to the first active auction (FB Live = one stream at a time)
        const auction = await env.DB
          .prepare("SELECT id, base_price FROM Auctions WHERE status = 'active' ORDER BY id DESC LIMIT 1")
          .first();
        if (!auction || bidAmount <= auction.base_price) continue;

        await env.DB
          .prepare("INSERT INTO Bids (auction_id, bidder_name, bid_amount) VALUES (?, ?, ?)")
          .bind(auction.id, bidderName, bidAmount)
          .run();
      }
      return json({ ok: true });
    }

    // ── GET /api/bids ─────────────────────────────────────────────────────
    // ?auction=ID → single auction (for /bid page)
    // no param    → all active auctions (for seller dashboard)
    if (request.method === "GET" && url.pathname === "/api/bids") {
      const auctionId = url.searchParams.get("auction");

      if (auctionId) {
        // Single auction lookup — used by the /bid page
        const auction = await env.DB
          .prepare("SELECT * FROM Auctions WHERE id = ?")
          .bind(parseInt(auctionId))
          .first();
        if (!auction) return json({ auction: null, bids: [] });
        const bids = await getTopBids(env.DB, auction.id);
        return json({ auction, bids });
      }

      // All active auctions with their bids — used by the seller dashboard
      const { results: auctions } = await env.DB
        .prepare("SELECT * FROM Auctions WHERE status = 'active' ORDER BY id DESC")
        .all();

      if (!auctions.length) return json({ auctions: [], allBids: {} });

      // Fetch bids for every active auction in parallel
      const bidMap = {};
      await Promise.all(
        auctions.map(async (a) => {
          bidMap[a.id] = await getTopBids(env.DB, a.id);
        })
      );

      return json({ auctions, allBids: bidMap });
    }

    // ── POST /api/bid ─────────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/api/bid") {
      let body;
      try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

      const bidderName = (body?.bidder_name ?? "").trim();
      const bidAmount  = parseFloat(body?.bid_amount ?? 0);
      const auctionId  = parseInt(body?.auction_id ?? 0);

      if (!bidderName)                          return json({ error: "bidder_name is required" }, 400);
      if (!bidAmount || isNaN(bidAmount))        return json({ error: "bid_amount must be a positive number" }, 400);
      if (!auctionId || isNaN(auctionId))        return json({ error: "auction_id is required" }, 400);

      const auction = await env.DB
        .prepare("SELECT * FROM Auctions WHERE id = ? AND status = 'active'")
        .bind(auctionId)
        .first();

      if (!auction)                             return json({ error: "Auction not found or already closed" }, 404);
      if (bidAmount <= auction.base_price)       return json({ error: `Bid must be above RM ${auction.base_price}` }, 422);

      await env.DB
        .prepare("INSERT INTO Bids (auction_id, bidder_name, bid_amount) VALUES (?, ?, ?)")
        .bind(auctionId, bidderName, bidAmount)
        .run();

      // Return current rank for the bidder
      const rank = await env.DB
        .prepare(`
          SELECT COUNT(*) AS rank FROM (
            SELECT bidder_name, MAX(bid_amount) AS top_bid
            FROM Bids WHERE auction_id = ?
            GROUP BY bidder_name
          ) WHERE top_bid > ?
        `)
        .bind(auctionId, bidAmount)
        .first();

      return json({
        ok:         true,
        auction:    { item_name: auction.item_name, base_price: auction.base_price },
        bid_amount: bidAmount,
        rank:       (rank?.rank ?? 0) + 1,
      }, 201);
    }

    // ── POST /api/open-auction ────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/api/open-auction") {
      let body;
      try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

      const itemName  = (body?.item_name ?? "").trim();
      const basePrice = parseFloat(body?.base_price ?? 0);

      if (!itemName) return json({ error: "item_name is required" }, 400);

      // No longer closes existing auctions — parallel bidding is supported
      const result = await env.DB
        .prepare("INSERT INTO Auctions (item_name, base_price, status) VALUES (?, ?, 'active')")
        .bind(itemName, isNaN(basePrice) ? 0 : basePrice)
        .run();

      const newAuction = await env.DB
        .prepare("SELECT * FROM Auctions WHERE id = ?")
        .bind(result.meta.last_row_id)
        .first();

      return json({ opened: true, auction: newAuction }, 201);
    }

    // ── POST /api/close-auction ───────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/api/close-auction") {
      let body;
      try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

      const auctionId = parseInt(body?.auction_id ?? 0);
      if (!auctionId || isNaN(auctionId)) return json({ error: "auction_id is required" }, 400);

      const auction = await env.DB
        .prepare("SELECT id FROM Auctions WHERE id = ? AND status = 'active'")
        .bind(auctionId)
        .first();

      if (!auction) return json({ error: "Auction not found or already closed" }, 404);

      await env.DB
        .prepare("UPDATE Auctions SET status = 'closed' WHERE id = ?")
        .bind(auctionId)
        .run();

      const winner = await env.DB
        .prepare("SELECT bidder_name, MAX(bid_amount) AS bid_amount FROM Bids WHERE auction_id = ? LIMIT 1")
        .bind(auctionId)
        .first();

      const checkoutLink = winner
        ? `https://pay.example.com/checkout?buyer=${encodeURIComponent(winner.bidder_name)}&amount=${winner.bid_amount}&auction=${auctionId}`
        : null;

      return json({ closed: true, winner, checkoutLink });
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};
