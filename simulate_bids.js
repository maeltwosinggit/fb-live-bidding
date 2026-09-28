/**
 * simulate_bids.js — Demo Bid Generator
 * Fires 5 randomized Meta-shaped webhook payloads every 3 seconds.
 * Usage: node simulate_bids.js
 *
 * Points at the local wrangler dev server by default.
 * Change WORKER_URL to your deployed Worker URL for live demos.
 */

const WORKER_URL = process.env.WORKER_URL || "http://localhost:8787/webhook";

const FAKE_BIDDERS = [
  "Siti Nurhaliza", "Ahmad Faiz", "Lim Wei Jie",
  "Priya Ramasamy", "Hafiz Zulkifli", "Nurul Ain",
  "David Tan", "Amirah Binti Hassan", "Kevin Ng", "Zarina Mohd",
];

// Generates a single Meta Graph API live-comment payload
function mockMetaPayload(bidderName, bidAmount) {
  return {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        time: Date.now(),
        changes: [
          {
            field: "live_videos",
            value: {
              // Simulating a live comment event
              event: "comments",
              from: { name: bidderName, id: `USER_${Math.floor(Math.random() * 99999)}` },
              // The bid message — this is what the regex parser picks up
              message: `+RM${bidAmount}`,
              comment_id: `COMMENT_${Date.now()}`,
              video_id: "LIVE_VIDEO_ID",
            },
          },
        ],
      },
    ],
  };
}

let fireCount = 0;
const MAX_FIRES = 20; // 20 rounds × 5 bids = 100 bids total, plenty for a pitch

const interval = setInterval(async () => {
  if (fireCount >= MAX_FIRES) {
    console.log("✅ Simulation complete — 100 bids sent.");
    clearInterval(interval);
    return;
  }

  // Send 5 bids concurrently each tick
  const promises = Array.from({ length: 5 }, () => {
    const bidder = FAKE_BIDDERS[Math.floor(Math.random() * FAKE_BIDDERS.length)];
    // Bids range from RM55 to RM999 in RM5 increments (realistic for live bidding)
    const bidAmount = 55 + Math.floor(Math.random() * 189) * 5;
    const payload = mockMetaPayload(bidder, bidAmount);

    return fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then(() => console.log(`  → Sent bid: ${bidder} +RM${bidAmount}`))
      .catch((err) => console.error(`  ✗ Failed: ${err.message}`));
  });

  console.log(`\n[Round ${fireCount + 1}/${MAX_FIRES}] Sending 5 bids...`);
  await Promise.all(promises);
  fireCount++;
}, 3000);
