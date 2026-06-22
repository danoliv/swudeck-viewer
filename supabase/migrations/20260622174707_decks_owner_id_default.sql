-- decks-api.ts inserts never set owner_id explicitly; default it to the
-- calling user so inserts satisfy the owner_all RLS check.
alter table public.decks alter column owner_id set default auth.uid();
