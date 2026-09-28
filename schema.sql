-- D1 (SQLite-compatible) schema for FB Live Bidding
-- Run via: wrangler d1 execute fb-bidding-db --file=schema.sql

CREATE TABLE IF NOT EXISTS Auctions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT    NOT NULL,
  base_price REAL   NOT NULL DEFAULT 0,
  -- 'active' | 'closed'
  status    TEXT    NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS Bids (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id   INTEGER NOT NULL REFERENCES Auctions(id) ON DELETE CASCADE,
  bidder_name  TEXT    NOT NULL,
  bid_amount   REAL    NOT NULL,
  -- ISO-8601 UTC timestamp, set by the Worker on insert
  timestamp    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed one active auction so the demo works immediately
INSERT OR IGNORE INTO Auctions (id, item_name, base_price, status)
VALUES (1, 'Limited-Edition Sneakers', 50.00, 'active');
