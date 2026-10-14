# CLAUDE.md

thetechyreader.com: a home for small, fun tools I build for the readers
who follow my Instagram account (@reemiii_93). Each tool is its own
little project, served from its own path on the same domain.

README.md has the details (conventions, palette, infrastructure, how
each tool works). Read it before changing anything.

## The tools

| Path | What it does | Backend |
|---|---|---|
| `/one-word` | Type a book title, get back one word that captures it | `api/word.js`, `api/vote.js`, Postgres, Anthropic API |
| `/publisher-wheel` | Spin a bookshelf, land on a random Arabic publisher | none, the list lives in the page |
| `/publishers` | Searchable cards of the book-fair publishers and their booths; a zoomable fair map with a pin for any booth and for the wishlist; a wishlist heart with a private note per publisher | none; hearts and notes saved in the reader's browser |

## Shape of the repo

- One folder per tool, holding one self-contained `index.html`. Vercel
  serves `/<folder>/index.html` at `/<folder>` with no config.
- `api/*.js` holds Vercel serverless functions, only for tools that need a
  secret or the database.
- No build step, no framework, no shared CSS. Duplication between tools
  is on purpose.
- Pushing to `main` deploys to production.
- The root `index.html` is Reem's portfolio (thetechyreader.com home),
  not a tool. It has its own rules, below.

## Rules that are easy to break

- **Arabic-first.** `dir="rtl"`, Arabic copy, Aref Ruqaa for display and
  Cairo for UI. One-word also has an English toggle. The publisher wheel
  is Arabic only.
- **The site palette, light only.** No dark mode. The colours are listed in
  README.md (deep green, green and gold).
- **Secrets stay in Vercel.** The repo is public.
- **Don't reorder the lookup chain in `api/word.js`.** It's the whole cost
  strategy (overrides → memory → db → model).
- If you change `normalise()` in `api/word.js`, change the copy in
  `one-word/index.html` too.
- The publisher list is copied in `publisher-wheel/index.html` and
  `publishers/index.html`. Change both. The `/publishers` copy also has
  each publisher's country code, for the flag.
- `/publishers` works offline through `publishers-sw.js` at the repo root.
  Readers see a changed page one visit late, so bump `VERSION` in that
  file whenever a change must reach them.
- The map pins use `BOOTHS` in `publishers/index.html`: each booth's
  pixel position on `publishers/map.webp` (1780×2210), measured by hand.
  A new booth number needs an entry there, and a new map image means
  re-measuring every booth.

## The portfolio (root `index.html`)

- Bilingual EN/AR with a toggle (`portfolio:lang` in localStorage). All
  copy lives in the `COPY = { en, ar }` dictionary; change both languages.
- Its own fonts (Caveat, Lora, Amiri, Aref Ruqaa), self-hosted in `/fonts`.
  No privacy line in its footer, on purpose. No service worker.
- The page sits on a torn, ruled notebook sheet (`.pile` / `.sheet`) with
  two pages stacked behind it, punched holes and a red margin line.
- "My journey" is a three.js notebook that starts closed and turns pages,
  newest first. three.js is a trimmed esbuild bundle in
  `vendor/three/three-journey.min.js`; rebuild it if a new three.js class
  is needed.
- Work on the `portfolio` branch and merge to `main` only when asked.

## Working style

This is a fun side project. Do what's asked, make sure it works, and stop.
Don't add features, hardening or "nice to have" extras unless asked.

## Adding a new tool

1. Create `<tool-name>/index.html`, copying the head (the `@font-face`
   block and the two Vercel Analytics script lines), palette and footer
   (including the privacy line) from an existing tool. Don't load fonts or
   scripts from other sites.
2. Add a function under `api/` only if it needs a secret or the database,
   and give it its own tables in `schema.sql`.
3. Add the tool to the table above and to "The tools" in README.md.

## Recent work

Newest first. Add a line here when a piece of work is finished, so the
next session knows where things stand.

- 2026-10-14: removed the "Systems for the book trade" card from the
  portfolio; `trade.webp` is now unused.
- 2026-10-12: portfolio doodles are hand-drawn artwork (34eeb7c), made
  with Gemini: `assets/portfolio/icon-{bird,study,work}.webp`,
  `cover-birds.webp` and `trade.webp`, all in the notebook-doodle style.

- 2026-10-11: portfolio at the root, live on `main` (4191f7f). Hero with
  photo, experience strip, three.js "My journey" book from the LinkedIn
  profile, project cards, a "work with me" section aimed at business
  owners, Waraq-style footer, torn notebook paper on a desk background.

- 2026-09-28: `/publishers` wishlist notes. In قائمتي each card has a
  note box ("اكتب ملاحظة شخصية (تظهر لك فقط)"), saved with ✓ or
  discarded with ✕, stored under `publishers:notes`. Asked for by a
  reader. SW `VERSION` is `publishers-v5`.
- 2026-09-27: `/publishers` map viewer. Full-screen pinch/drag/double-tap
  map, a gold pin when a card's booth is tapped, heart pins for the
  wishlist with a قائمتي toggle. A QA test plan was written for it.
- 2026-09-27: added the fair floor plan (`publishers/map.webp`), cropped
  and cleaned from page 2 of a phone photo (`C9.pdf`, kept out of the
  repo on purpose).
