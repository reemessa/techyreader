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
-- select w.title, w.word,
--        count(*) filter (where v.vote = 1)  as up,
--        count(*) filter (where v.vote = -1) as down
-- from words w join votes v on v.key = w.key
-- group by w.title, w.word
-- having count(*) filter (where v.vote = -1) > 0
-- order by down desc;
