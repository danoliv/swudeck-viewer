-- RLS policies alone don't grant table-level access; Supabase revokes
-- default privileges on public schema tables, so grant explicitly.
grant select, insert, update, delete on public.decks to authenticated;
grant select on public.decks to anon;
