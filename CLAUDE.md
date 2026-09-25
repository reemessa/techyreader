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
| `/publishers` | Searchable cards of the book-fair publishers and their booths, with a wishlist heart | none; hearts saved in the reader's browser |

## Shape of the repo

- One folder per tool, holding one self-contained `index.html`. Vercel
  serves `/<folder>/index.html` at `/<folder>` with no config.
- `api/*.js` holds Vercel serverless functions, only for tools that need a
  secret or the database.
- No build step, no framework, no shared CSS. Duplication between tools
  is on purpose.
- Pushing to `main` deploys to production.

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
