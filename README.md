# FB Live Bidding Automation System

Real-time Facebook Live auction bidding backend for SME e-commerce sellers.

> **Live demo:** [https://fb-live-bidding-worker.ungkuadrian.workers.dev](https://fb-live-bidding-worker.ungkuadrian.workers.dev)

## How it works

Viewers comment `+RM<amount>` during a Facebook Live stream. The Meta Graph API fires a webhook to the Cloudflare Worker, which parses the bid, validates it against the base price, and stores it in D1. The seller dashboard polls every 2 seconds and shows a live leaderboard. When the seller closes the auction, the system identifies the winner and generates a checkout link.

## Live endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `https://fb-live-bidding-worker.ungkuadrian.workers.dev/webhook` | Receives Meta Graph API live-comment events |
| `GET`  | `https://fb-live-bidding-worker.ungkuadrian.workers.dev/api/bids` | Active auction + top-10 leaderboard |
| `POST` | `https://fb-live-bidding-worker.ungkuadrian.workers.dev/api/bid` | Direct bid from the `/bid` page (name + amount) |
| `POST` | `https://fb-live-bidding-worker.ungkuadrian.workers.dev/api/open-auction` | Open a new auction |
| `POST` | `https://fb-live-bidding-worker.ungkuadrian.workers.dev/api/close-auction` | Close auction, get winner + checkout link |

## Stack

- **Edge API**: Cloudflare Worker (`worker/src/index.js`)
- **Database**: Cloudflare D1 — `fb-bidding-db` (SQLite-compatible, serverless)
- **Dashboard**: Next.js 14 + Tailwind CSS
- **Bid parser**: Meta Graph API webhook → regex `+RM<amount>`

## Project structure

```
fb-live-bidding/
├── schema.sql                  # D1 database schema + seed
├── simulate_bids.js            # Demo bid generator (run during pitch)
├── worker/
│   ├── wrangler.toml           # Cloudflare Worker config
│   └── src/
│       └── index.js            # Worker: webhook, bids, open/close auction
└── dashboard/
    ├── .env.local              # NEXT_PUBLIC_WORKER_URL
    └── app/
        ├── page.js             # Seller Dashboard (Next.js)
        └── bid/
            └── page.js         # Bidder page — scan QR → place bid directly
```

## Webhook payload format (Meta Graph API)

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "from": { "name": "Siti Nurhaliza" },
        "message": "+RM250"
      }
    }]
  }]
}
```

Any comment matching `+RM<number>` (case-insensitive, spaces allowed) is parsed as a bid. Bids at or below the item's base price are silently rejected.

---

## Local development

### 1. Create the D1 database

```bash
cd worker
wrangler d1 create fb-bidding-db
# Paste the returned database_id into wrangler.toml
```

### 2. Run schema migrations

```bash
wrangler d1 execute fb-bidding-db --local --file=../schema.sql
```

### 3. Start the Worker

```bash
cd worker
wrangler dev
# Runs on http://localhost:8787
```

### 4. Start the dashboard

```bash
cd dashboard
npm run dev
# Runs on http://localhost:3000
```

### 5. Fire demo bids

```bash
node simulate_bids.js
# Sends 100 randomised bids in batches of 5 every 3 s
```

---

## Deploy to production

```bash
# 1. Deploy Worker + D1
cd worker
wrangler d1 execute fb-bidding-db --file=../schema.sql   # run migrations on prod
wrangler deploy

# 2. Point dashboard at the deployed Worker
echo "NEXT_PUBLIC_WORKER_URL=https://fb-live-bidding-worker.ungkuadrian.workers.dev" > dashboard/.env.local

# 3. Deploy dashboard (Vercel or Cloudflare Pages)
cd dashboard && npx vercel --prod
```
