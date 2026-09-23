// POST /api/word  { "title": "موسم الهجرة إلى الشمال" }  ->  { "word": "اغتراب", "source": "model" }
//
// Cost controls, in order of how much they save you:
//   1. OVERRIDES  - books you answered yourself. Never costs anything.
//   2. cache      - one model call per title, ever (per warm instance).
//   3. rateLimit  - 10 lookups per IP per hour.
//   4. origin     - only your own site may call this.
// Plus: set a monthly spend cap on the API key itself. That is the only
// limit that cannot be bypassed, so do not skip it.

const MODEL = "claude-haiku-4-5-20251001";
const MAX_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://thetechyreader.com",
  "http://localhost:3000",
];

// Your words. These are checked first, so the books in your reel always
// return exactly what you chose — no model, no surprises on camera.
const OVERRIDES = {
  "موسم الهجرة إلى الشمال": "اغتراب",
  "ساق البامبو": "انتماء",
  "مدن الملح": "اقتلاع",
  "piranesi": "متاهة",
};

// Module scope: survives between invocations while the instance stays warm,
// and empties when it cools. Good enough to kill most repeat calls. If the
// tool takes off, swap this for Vercel KV so the cache is shared and permanent.
const cache = new Map();
const hits = new Map();

function normalise(title) {
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

// One word, nothing else. Anything longer is the model ignoring instructions,
// and we'd rather show nothing than show a sentence.
function cleanWord(raw, arabic) {
  const word = (raw || "")
    .replace(/["'.،,؟?!:؛;()\[\]]/g, "")
    .trim()
    .split(/\s+/)[0];

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

  if (OVERRIDES[key]) {
    return res.status(200).json({ word: OVERRIDES[key], source: "mine" });
  }
  if (cache.has(key)) {
    return res.status(200).json({ word: cache.get(key), source: "cache" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "rate_limited" });
  }

  try {
    const word = await askModel(title, isArabic(title));
    if (!word) {
      return res.status(200).json({ word: null, source: "unknown" });
    }
    cache.set(key, word);
    return res.status(200).json({ word, source: "model" });
  } catch (error) {
    console.error("word lookup failed:", error.message);
    return res.status(502).json({ error: "upstream" });
  }
}
