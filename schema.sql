-- Run once, in the Vercel Postgres query editor.

-- Every word the model has ever produced. This is the real cache: the
-- in-memory one empties when the function goes cold, this one doesn't.
-- A book is looked up by its normalised key, so "Piranesi" and "piranesi"
-- are the same row.
create table if not exists words (
  key        text primary key,
  title      text not null,
  word       text not null,
  created_at timestamptz not null default now()
);

-- One row per vote, not a running total. Keeping the rows means you can
-- see later WHICH words people rejected, which is what tells you what
-- belongs in your own overrides table.
create table if not exists votes (
  id         serial primary key,
  key        text not null,
  title      text not null,
  word       text not null,
  vote       smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now()
);

create index if not exists votes_key_idx on votes (key);

-- The words people liked least — your list of what to fix by hand.
-- select min(title) as title, word,
--        count(*) filter (where vote = 1)  as up,
--        count(*) filter (where vote = -1) as down
-- from votes
-- group by key, word
-- having count(*) filter (where vote = -1) > 0
-- order by down desc;

-- Books the model didn't know (or answered with something that wasn't
-- one clean word). Remembered so each one costs one call ever, and
-- counted so you can see which ones people keep asking for.
create table if not exists unknowns (
  key        text primary key,
  title      text not null,
  asks       integer not null default 1,
  created_at timestamptz not null default now(),
  last_asked timestamptz not null default now()
);

-- The books to add to OVERRIDES next, most wanted first.
-- select title, asks, last_asked from unknowns order by asks desc;
