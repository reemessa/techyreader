// POST /api/vote  { "title": "...", "word": "...", "vote": 1 | -1 }
//
// One row per vote. No totals kept, because the interesting question is
// not "how many liked it" but "which words did people reject" — and that
// only survives if the rows do.

import { neon } from "@neondatabase/serverless";
import { normalise } from "./word.js";

const sql = neon(process.env.DATABASE_URL);

const MAX_PER_HOUR = 40;
const HOUR = 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://thetechyreader.com",
  "http://localhost:3000",
];

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + HOUR });
    return false;
  }
  if (entry.count >= MAX_PER_HOUR) return true;

  entry.count += 1;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const body = req.body || {};
  const title = String(body.title || "").slice(0, 120);
  const word = String(body.word || "").slice(0, 40);
  const vote = Number(body.vote);

  if (!title.trim() || !word.trim() || (vote !== 1 && vote !== -1)) {
    return res.status(400).json({ error: "bad_vote" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "rate_limited" });
  }

  try {
    await sql`
      insert into votes (key, title, word, vote)
      values (${normalise(title)}, ${title}, ${word}, ${vote})
    `;
    console.log(`[vote] "${title}" / ${word} -> ${vote > 0 ? "up" : "down"}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(`[vote] failed for "${title}":`, error.message);
    return res.status(502).json({ error: "db" });
  }
}
