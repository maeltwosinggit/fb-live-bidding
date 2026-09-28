# FB Live Bidding Automation System

Real-time Facebook Live auction bidding backend for SME e-commerce sellers.

## Stack
- **Backend**: Cloudflare Worker (Edge runtime)
- **Database**: Cloudflare D1 (SQLite-compatible, serverless)
- **Frontend**: Next.js 14 + Tailwind CSS
- **Bid Parser**: Meta Graph API webhook → regex `+RM<amount>`

## Project Structure
```
fb-live-bidding/
├── schema.sql                  # D1 database schema + seed
├── simulate_bids.js            # Demo bid generator (run during pitch)
├── worker/
│   ├── wrangler.toml           # Cloudflare Worker config
│   └── src/
│       └── index.js            # Worker: POST /webhook, GET /api/bids
└── dashboard/
    └── app/
        └── page.js             # Seller Dashboard (Next.js)
```

## Quickstart (Local Dev)

### 1. Create the D1 database
```bash
cd worker
wrangler d1 create fb-bidding-db
# Copy the database_id into wrangler.toml
```

### 2. Run schema migrations
```bash
wrangler d1 execute fb-bidding-db --local --file=../schema.sql
```

### 3. Start the Worker locally
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
# In a third terminal
node simulate_bids.js
```

## Deploy to Production
```bash
# Deploy Worker + D1
cd worker
wrangler d1 execute fb-bidding-db --file=../schema.sql   # run migrations on prod
wrangler deploy

# Update dashboard env
echo "NEXT_PUBLIC_WORKER_URL=https://fb-live-bidding-worker.<your-subdomain>.workers.dev" > dashboard/.env.local

# Deploy dashboard (Vercel / Cloudflare Pages)
cd dashboard && npx vercel --prod
```

## Webhook Payload Format (Meta Graph API)
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

Any comment matching `+RM<number>` is parsed as a bid.
