create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  slug        text not null unique,
  name        text not null default 'Untitled deck',
  data        jsonb not null,
  visibility  text not null default 'private'
              check (visibility in ('private','unlisted','public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index decks_owner_idx on public.decks (owner_id);

alter table public.decks enable row level security;

-- Owners: full control of their own rows
create policy "owner_all" on public.decks
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Anyone (incl. anon) can read unlisted/public decks
create policy "read_shared" on public.decks
  for select using (visibility in ('public','unlisted'));

-- Keep updated_at current on every update
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger decks_touch before update on public.decks
  for each row execute function public.touch_updated_at();
