# thetechyreader.com

Small tools for readers. One folder per tool, all served from the same
domain.

Live at [thetechyreader.com](https://thetechyreader.com), deployed from
`main` on every push.

---

## Layout

```
/<tool-name>/index.html   the tool's page — one self-contained file
/fonts/                   Aref Ruqaa and Cairo, served from this site (OFL)
/publishers-sw.js         offline copy of /publishers (see below)
/api/*.js                 Vercel serverless functions
/schema.sql               the Postgres tables
/package.json             dependencies (shared across all tools)
```

A new tool is a new folder. `one-word/index.html` is served at
`/one-word` with no configuration — Vercel maps the path for you.

---

## Conventions

These are the rules the whole site follows. Breaking one should be a
deliberate decision, not an accident.

**Static page plus a function.** A tool is one HTML file and, if it
needs a secret or a database, one function under `/api`. No per-tool
backend, no build step, no framework. This keeps every tool deployable
in under a minute and debuggable by reading one file.

**Arabic-first.** `dir="rtl"`, Arabic copy, and Arabic titles treated as
the normal case rather than the edge case. Aref Ruqaa for display, Cairo
for UI.

**Nothing loads from other sites.** The fonts live in `/fonts` and each
page declares them with `@font-face` at the top of its `<style>`, so no
visitor's address goes to Google. Every page ends with a small privacy
line in the footer saying what leaves the phone: nothing, or for
one-word, the book title to Anthropic. Keep that line true when a tool
changes.

**The palette, everywhere:**

| | |
|---|---|
| ground | `#F5F5F4` |
| card | `#FFFFFF` |
| ink | `#201F1D` |
| muted | `#666560` |
| deep green | `#0F3A2B` |
| green | `#167B54` |
| gold | `#C79A3E` |

Deep green for headings and the big surfaces, gold for the main
buttons. Light only, no dark mode.

**Visits are counted with Vercel Web Analytics** (the project's
Analytics tab). Every page carries the two script lines just before
`</head>`; a page without them isn't counted. No cookies. Visits served
from `/publishers`' offline copy with no signal never reach Vercel, so
fair-day numbers run low.

**Secrets live in Vercel, never in the repo.** The repo is public.
`ANTHROPIC_API_KEY` and `DATABASE_URL` are environment variables set in
the Vercel dashboard.

---

## Infrastructure

| | |
|---|---|
| Domain | Porkbun (A record → Vercel) |
| Hosting | Vercel, project `techyreader` |
| Database | Neon Postgres, via the Vercel Marketplace integration |
| Model | Anthropic API, Haiku |

The database is shared by all tools. Give each tool its own tables
rather than a separate database.

---

## The tools

### `/one-word`

Type a book title, get back one word.

**Where an answer comes from, cheapest first:**

1. `OVERRIDES` in `api/word.js` — words chosen by hand. Free, and always
   the same, which matters when a book is going to appear in a reel.
2. In-memory cache — this warm function instance already answered it.
3. The `words` table — the model answered it once, on any instance, ever.
4. The model — first time anyone has asked for this book.

Every model answer is written to `words`, so each book costs one API
call for the lifetime of the tool. This ordering is the whole cost
strategy; don't reorder it.

Books the model doesn't know go to the `unknowns` table instead, and are
answered from there (or from memory) without asking the model again.
Each repeat ask adds 1 to `asks`, so the most-wanted missing books are:

```sql
select title, asks, last_asked from unknowns order by asks desc;
```

Adding one to `OVERRIDES` fixes it immediately, since overrides are
checked first.

**Cost controls, all four:**

- the cache chain above, which is what actually saves money
- a per-IP rate limit in the function (10 lookups/hour)
- an origin check, which stops other websites from calling the API
  from a visitor's browser. It does not stop scripts: a request with
  no `Origin` header (curl, a server) passes. That's deliberate —
  rejecting empty origins risks breaking the page itself — so the
  rate limit and the spend cap are the real protection
- a monthly spend limit on the Anthropic workspace that owns the key
  (keys don't carry their own limit) — the only one that
  can't be bypassed, and the one that matters if the others fail

**Votes.** Thumbs up/down writes a row to `votes` — one row per vote,
not a running total, because the useful question is *which words did
people reject*. That list is what should move into `OVERRIDES`:

```sql
select min(title) as title, word,
       count(*) filter (where vote = 1)  as up,
       count(*) filter (where vote = -1) as down
from votes
group by key, word
having count(*) filter (where vote = -1) > 0
order by down desc;
```

A vote is only saved if its word is what the tool actually gives for
that book (the override, or the stored model answer), so the list covers
override books too. There's no check against one person voting
repeatedly. Fine as a signal, useless as a poll — don't read the counts
as one.

**Known weakness.** Arabic classics get vaguer words than English
contemporary fiction, and a misspelled Arabic title fails outright. The
normaliser strips diacritics and unifies أ/إ/آ and ة/ه, but it can't fix
a wrong letter. If this keeps happening, the fix is to accept an author
name alongside the title and pass both to the model.

### `/publisher-wheel`

Press the button, a bookshelf slides like a slot machine, and it stops
on one spine: a random Arabic publisher. Pressing the button again
while it slides brakes it onto a book a few spines ahead; if nobody
presses it, it brakes by itself after 10 seconds. Arabic only.

Static page, no function, no database. The list is the `PUBLISHERS`
array at the top of the script in `publisher-wheel/index.html`, and
every spin picks from the whole list, however long it is.

### `/publishers`

The same book-fair publishers as cards, grouped by hall (A, B, C), each
with its booth and a heart. Search matches names and booth numbers and
ignores hamza and diacritics. The heart builds a wishlist ("قائمتي"),
kept in the reader's browser (`localStorage`, key `publishers:saved`,
stored by name). No accounts, nothing sent anywhere.

Static page. The list is a copy of the one in the publisher wheel; when
it changes, change both.

**Works offline.** `publishers-sw.js` (a service worker, at the site root
so it can cover `/publishers` without a trailing slash) keeps a copy of
the page and its fonts on the phone after the first visit. The fair's
internet is bad, so the cached page is shown straight away and refreshed
in the background: a change to the list reaches a phone on its second
visit after the deploy. To force everyone onto a fresh copy, bump
`VERSION` in `publishers-sw.js`.

---

## Working on this

Read the file before changing it. Each tool page is self-contained on
purpose — the duplication between tools is intentional, and it's cheaper
than a shared stylesheet that every tool has to stay compatible with.

Deploys are automatic on push to `main`. Check the Vercel logs after a
change to `/api`: every lookup logs its source.

```
[word] "Daughter of smoke and bone" -> yearning (model)
[word] "Daughter of smoke and bone" -> yearning (db)
[vote] "Daughter of smoke and bone" / yearning -> up
```