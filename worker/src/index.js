/**
 * Cloudflare Worker — FB Live Bidding Backend
 * Routes:
 *   POST /webhook  — receives Meta Graph API live-comment payloads, extracts bids
 *   GET  /api/bids — returns top-10 bids for the active auction
 *   POST /api/close-auction — closes active auction, returns winner checkout link
 */

// Regex: matches "+RM50", "+RM 120.50", "+rm200" (case-insensitive)
const BID_REGEX = /\+\s*RM\s*(\d+(?:\.\d{1,2})?)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS headers so the Next.js dashboard (any origin) can call this ──
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── POST /webhook ────────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/webhook") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Bad JSON", { status: 400, headers: cors });
      }

      // Meta Graph API wraps events in entry[].changes[]
      // Shape: { entry: [{ changes: [{ value: { from: { name }, message } }] }] }
      const changes = body?.entry?.[0]?.changes ?? [];

      for (const change of changes) {
        const value = change?.value ?? {};
        const message = value?.message ?? "";
        const bidderName = value?.from?.name ?? "Anonymous";

        const match = BID_REGEX.exec(message);
        if (!match) continue; // comment is not a bid — skip

        const bidAmount = parseFloat(match[1]);

        // Fetch the active auction
        const auction = await env.DB
          .prepare("SELECT id, base_price FROM Auctions WHERE status = 'active' LIMIT 1")
          .first();

        if (!auction) continue; // no active auction

        // Only accept bids above the base price
        if (bidAmount <= auction.base_price) continue;

        // Insert the bid — D1 handles concurrent writes safely
        await env.DB
          .prepare(
            "INSERT INTO Bids (auction_id, bidder_name, bid_amount) VALUES (?, ?, ?)"
          )
          .bind(auction.id, bidderName, bidAmount)
          .run();
      }

      // Meta requires a 200 to acknowledge the webhook
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── GET /api/bids ─────────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/api/bids") {
      const auction = await env.DB
        .prepare("SELECT * FROM Auctions WHERE status = 'active' LIMIT 1")
        .first();

      if (!auction) {
        return new Response(JSON.stringify({ auction: null, bids: [] }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Top 10 unique bidders — highest bid per bidder, ordered descending
      const { results } = await env.DB
        .prepare(`
          SELECT bidder_name, MAX(bid_amount) AS bid_amount, MAX(timestamp) AS timestamp
          FROM Bids
          WHERE auction_id = ?
          GROUP BY bidder_name
          ORDER BY bid_amount DESC
          LIMIT 10
        `)
        .bind(auction.id)
        .all();

      return new Response(JSON.stringify({ auction, bids: results }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── POST /api/bid — direct bid submission from the /bid page ─────────
    if (request.method === "POST" && url.pathname === "/api/bid") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Bad JSON", { status: 400, headers: cors });
      }

      const bidderName = (body?.bidder_name ?? "").trim();
      const bidAmount  = parseFloat(body?.bid_amount ?? 0);

      if (!bidderName) {
        return new Response(JSON.stringify({ error: "bidder_name is required" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!bidAmount || isNaN(bidAmount) || bidAmount <= 0) {
        return new Response(JSON.stringify({ error: "bid_amount must be a positive number" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const auction = await env.DB
        .prepare("SELECT * FROM Auctions WHERE status = 'active' LIMIT 1")
        .first();

      if (!auction) {
        return new Response(JSON.stringify({ error: "No active auction" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (bidAmount <= auction.base_price) {
        return new Response(JSON.stringify({ error: `Bid must be above the base price of RM ${auction.base_price}` }), {
          status: 422, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await env.DB
        .prepare("INSERT INTO Bids (auction_id, bidder_name, bid_amount) VALUES (?, ?, ?)")
        .bind(auction.id, bidderName, bidAmount)
        .run();

      // Return the bidder's current rank
      const rank = await env.DB
        .prepare(`
          SELECT COUNT(*) AS rank FROM (
            SELECT bidder_name, MAX(bid_amount) AS top_bid
            FROM Bids WHERE auction_id = ?
            GROUP BY bidder_name
          ) WHERE top_bid > ?
        `)
        .bind(auction.id, bidAmount)
        .first();

      return new Response(JSON.stringify({
        ok: true,
        auction: { item_name: auction.item_name, base_price: auction.base_price },
        bid_amount: bidAmount,
        rank: (rank?.rank ?? 0) + 1,   // 1-based
      }), {
        status: 201, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── POST /api/close-auction ───────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/api/close-auction") {
      const auction = await env.DB
        .prepare("SELECT id FROM Auctions WHERE status = 'active' LIMIT 1")
        .first();

      if (!auction) {
        return new Response(JSON.stringify({ error: "No active auction" }), {
          status: 404,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Mark auction as closed
      await env.DB
        .prepare("UPDATE Auctions SET status = 'closed' WHERE id = ?")
        .bind(auction.id)
        .run();

      // Find the winner (highest single bid)
      const winner = await env.DB
        .prepare(
          "SELECT bidder_name, MAX(bid_amount) AS bid_amount FROM Bids WHERE auction_id = ? LIMIT 1"
        )
        .bind(auction.id)
        .first();

      // Generate a mock checkout link (replace with real payment gateway in prod)
      const checkoutLink = winner
        ? `https://pay.example.com/checkout?buyer=${encodeURIComponent(winner.bidder_name)}&amount=${winner.bid_amount}&auction=${auction.id}`
        : null;

      return new Response(JSON.stringify({ closed: true, winner, checkoutLink }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── POST /api/open-auction ────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/api/open-auction") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Bad JSON", { status: 400, headers: cors });
      }

      const itemName  = (body?.item_name  ?? "").trim();
      const basePrice = parseFloat(body?.base_price ?? 0);

      if (!itemName) {
        return new Response(JSON.stringify({ error: "item_name is required" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Close any currently active auction first (only one live at a time)
      await env.DB
        .prepare("UPDATE Auctions SET status = 'closed' WHERE status = 'active'")
        .run();

      // Insert the new auction
      const result = await env.DB
        .prepare("INSERT INTO Auctions (item_name, base_price, status) VALUES (?, ?, 'active')")
        .bind(itemName, isNaN(basePrice) ? 0 : basePrice)
        .run();

      const newAuction = await env.DB
        .prepare("SELECT * FROM Auctions WHERE id = ?")
        .bind(result.meta.last_row_id)
        .first();

      return new Response(JSON.stringify({ opened: true, auction: newAuction }), {
        status: 201,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};
