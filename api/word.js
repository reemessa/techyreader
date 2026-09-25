// POST /api/word  { "title": "موسم الهجرة إلى الشمال" }
//   -> { "word": "اغتراب", "source": "mine" | "memory" | "db" | "model" }
//   -> { "word": null, "source": "unknown" }  when the model doesn't know it
//
// Where an answer can come from, cheapest first:
//   mine   - OVERRIDES below. Your words. Never costs anything.
//   memory - this warm instance already answered it.
//   db     - the model answered it once, ever, on any instance.
//   model  - first time anyone has asked for this book.
//
// Books the model couldn't answer are remembered the same way, in the
// unknowns table, so they also cost one call ever. Each repeat ask bumps
// a counter: that table is the list of books to add to OVERRIDES.
//
// Plus a rate limit per IP, an origin check, and — the only limit that
// cannot be bypassed — the monthly spend limit on the key's workspace.

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const MODEL = "claude-haiku-4-5-20251001";
const MAX_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://thetechyreader.com",
  "http://localhost:3000",
];

// Your words. Checked before anything else, so the books in your reel
// always return exactly what you chose.
export const OVERRIDES = {
  "موسم الهجره الى الشمال": "اغتراب",
  "ساق البامبو": "انتماء",
  "مدن الملح": "اقتلاع",
  "piranesi": "متاهة",
};

// key -> word, or key -> null for a book the model didn't know.
const memory = new Map();
const hits = new Map();

export function normalise(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")   // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

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

// One word, nothing else. Anything longer means the model ignored the
// instruction, and showing nothing beats showing a sentence.
function cleanWord(raw, arabic) {
  const parts = (raw || "")
    .replace(/["'.،,؟?!:؛;()\[\]]/g, "")
    .trim()
    .split(/\s+/);

  if (parts.length > 1) return null;
  const word = parts[0];

  if (!word) return null;
  if (word.length > 20) return null;
  if (arabic && !isArabic(word)) return null;
  if (!arabic && isArabic(word)) return null;

  return word;
}

async function askModel(title, arabic) {
  const language = arabic ? "Arabic" : "English";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20,
      system:
        "You reduce a book to a single word — the feeling or idea it leaves " +
        "behind, not its subject. Reply with that one word and nothing else: " +
        "no punctuation, no explanation, no quotation marks. " +
        `The word must be in ${language}. If you do not know the book, reply ` +
        "with the single word UNKNOWN.",
      messages: [{ role: "user", content: title }],
    }),
  });

  if (!response.ok) throw new Error(`api ${response.status}`);

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ");

  if (/unknown/i.test(text)) return null;
  return cleanWord(text, arabic);
}

// The database is a cache, not the tool. If it is down, the tool still
// answers — it just pays the model again next time.
async function readStored(key) {
  try {
    const rows = await sql`select word from words where key = ${key}`;
    return rows.length ? rows[0].word : null;
  } catch (error) {
    console.error("[word] db read failed:", error.message);
    return null;
  }
}

async function store(key, title, word) {
  try {
    await sql`
      insert into words (key, title, word)
      values (${key}, ${title}, ${word})
      on conflict (key) do nothing
    `;
  } catch (error) {
    console.error("[word] db write failed:", error.message);
  }
}

// Returns true if the book is a known unknown, and counts the ask.
async function bumpUnknown(key) {
  try {
    const rows = await sql`
      update unknowns set asks = asks + 1, last_asked = now()
      where key = ${key}
      returning key
    `;
    return rows.length > 0;
  } catch (error) {
    console.error("[word] db unknown read failed:", error.message);
    return false;
  }
}

async function storeUnknown(key, title) {
  try {
    await sql`
      insert into unknowns (key, title)
      values (${key}, ${title})
      on conflict (key) do update
        set asks = unknowns.asks + 1, last_asked = now()
    `;
  } catch (error) {
    console.error("[word] db unknown write failed:", error.message);
  }
}

function unknown(res, title, source) {
  console.log(`[word] "${title}" -> unknown (${source})`);
  return res.status(200).json({ word: null, source: "unknown" });
}

function answer(res, title, word, source) {
  console.log(`[word] "${title}" -> ${word} (${source})`);
  return res.status(200).json({ word, source });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const title = (req.body && req.body.title ? String(req.body.title) : "").slice(0, 120);
  if (!title.trim()) {
    return res.status(400).json({ error: "no_title" });
  }

  const key = normalise(title);

  if (OVERRIDES[key]) return answer(res, title, OVERRIDES[key], "mine");
  if (memory.has(key)) {
    const remembered = memory.get(key);
    if (remembered) return answer(res, title, remembered, "memory");
    await bumpUnknown(key);
    return unknown(res, title, "memory");
  }

  const stored = await readStored(key);
  if (stored) {
    memory.set(key, stored);
    return answer(res, title, stored, "db");
  }

  if (await bumpUnknown(key)) {
    memory.set(key, null);
    return unknown(res, title, "db");
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    console.log(`[word] rate limited "${title}"`);
    return res.status(429).json({ error: "rate_limited" });
  }

  try {
    const word = await askModel(title, isArabic(title));
    // Covers both UNKNOWN and an answer cleanWord threw away: either
    // way, asking again would most likely get the same thing back.
    if (!word) {
      memory.set(key, null);
      await storeUnknown(key, title);
      return unknown(res, title, "model");
    }

    memory.set(key, word);
    await store(key, title, word);
    return answer(res, title, word, "model");
  } catch (error) {
    console.error(`[word] lookup failed for "${title}":`, error.message);
    return res.status(502).json({ error: "upstream" });
  }
}
