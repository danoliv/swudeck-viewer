# Backend: Auth, Saved Decks & Sharing

The deck builder's optional backend (Supabase) adds account-based persistence
and sharing on top of the always-available `?d=` URL encoding. It does not
replace `?d=` — both coexist. See `doc/BACKEND_PLAN.md` for the original
implementation plan this was built from.

## Feature flag

The whole backend is gated behind two build-time env vars:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

`src/lib/supabase.ts`'s `isBackendEnabled()` returns `true` only if both are
present. If either is missing — e.g. local dev without a `.env.local`, or a
CI/e2e run without secrets — every backend-aware code path (nav sign-in
control, builder Save button, index.html's gallery) falls back to a plain
sign-in card with no working backend behind it. `?d=` sharing still works.
Unit tests force
both vars empty in `vite.config.ts`'s `test.env` so they stay hermetic
regardless of what's in a developer's `.env.local`.

The anon key is safe to expose in client code — Row Level Security (below)
is what actually protects data, not key secrecy.

## `?d=` vs `?id=`

| | `?d=<encoded>` | `?id=<slug>` |
|---|---|---|
| Requires an account | No | To create one; no to view an `unlisted`/`public` one |
| Where the data lives | The URL itself | A `decks` row in Postgres |
| Editable by | Anyone with the link (local-only) | Only the owner (via Save/Update) |
| Created by | Every edit, automatically | Clicking **Save deck** |

`src/lib/share-target.ts`'s `resolveShareTarget()` is the single place that
decides which one wins when a builder page loads: **`?id=` always takes
precedence over `?d=`** if both are present. This means refreshing a page
that has both params re-fetches the canonical saved version from the
backend, discarding any local-only edits encoded in `?d=` since the last
Save — by design, `?id=` represents "the saved truth," `?d=` is just an
ephemeral carrier for unsaved state.

## Schema

One table, `public.decks` (see `supabase/migrations/`):

```sql
create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade
              default auth.uid(),
  slug        text not null unique,
  name        text not null default 'Untitled deck',
  data        jsonb not null,                 -- a DeckData object, verbatim
  visibility  text not null default 'private'
              check (visibility in ('private','unlisted','public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

- `data` stores the exact same `DeckData` shape (`src/lib/types.ts`) that
  `?d=` encodes — no separate normalized schema for cards.
- `slug` is a random base-62 string (`src/lib/slug.ts`), generated client-side
  on save; the column's `unique` constraint is the actual collision guard.
- `visibility`:
  - `private` — only the owner can read it (used for copies via "Save to my
    account").
  - `unlisted` — anyone with the slug can read it; default for a first Save.
  - `public` — same as `unlisted` today; reserved for a future browse page.

## Row Level Security

RLS is enabled with two policies:

```sql
create policy "owner_all" on public.decks
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "read_shared" on public.decks
  for select using (visibility in ('public','unlisted'));
```

**RLS policies alone are not sufficient** — Supabase revokes default table
privileges on `public` schema tables, so without explicit `GRANT`s every
query fails with `permission denied for table decks` regardless of what the
policies say:

```sql
grant select, insert, update, delete on public.decks to authenticated;
grant select on public.decks to anon;
```

And since `decks-api.ts`'s `saveDeck()` never sets `owner_id` explicitly,
the column needs `default auth.uid()` (also in the migrations) or every
insert violates the `owner_all` check.

If you add a new table later: pair `enable row level security` + policies
with explicit `GRANT`s, and default any owner-id-style column to
`auth.uid()` unless the app always sets it.

## Auth flow

`src/lib/auth.ts` wraps Supabase's magic-link (`signInWithOtp`) and Google
OAuth (`signInWithOAuth`). Both accept an optional `redirectTo` — when
omitted they default to the site root; `index.html` (the sign-in card /
deck gallery home page) overrides this with a same-origin-validated
`?return=<url>` so the "Save to my account" flow (see
below) can land the user back on the exact deck they started from.

Supabase's `additional_redirect_urls` allow-list must include a wildcard
matching your deployed origin (e.g. `https://your-domain/**`), not just the
bare origin — `?return=` values carry full paths/query strings, and an
exact-URL allow-list entry won't match them. Configure this both in
`supabase/config.toml` (local dev) and the Supabase dashboard's
Authentication → URL Configuration (production) — the CLI's
`supabase config push` does *not* sync this dashboard setting safely (it
would push your local dev `site_url` to production), so set production's
Site URL / Redirect URLs manually.

### Enabling Google sign-in

Unlike magic-link email, Google OAuth needs real credentials before the
"Continue with Google" button does anything — there's no way around the
manual setup below, on both the Google and Supabase sides:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   pick (or create) a project, configure the **OAuth consent screen**
   (Branding/Audience tabs — App name, support email, **External** user
   type), then create an OAuth 2.0 Client ID (Application type: **Web
   application**).
2. Add an **Authorized redirect URI** of
   `https://<project-ref>.supabase.co/auth/v1/callback` (find `<project-ref>`
   in the Supabase dashboard URL or `supabase status`). For local dev, also
   add `http://127.0.0.1:54321/auth/v1/callback`.
3. **Publish the app** (Google Auth Platform → Audience → "Publish app").
   New consent screens start in **Testing**, which caps sign-in to ~100
   manually-added test users and is the #1 cause of "it works for me but not
   for anyone else." Publishing to production needs no Google review as long
   as you only request the default `email`/`profile` scopes (no sensitive
   scopes, no logo, ≤10 domains).
4. In the Supabase dashboard → Authentication → Sign In / Providers →
   Google, enable it and paste the Client ID + Client Secret from step 1.
5. For local dev parity, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` /
   `_SECRET` in your shell (or `set -a; source .env.local; set +a` if you keep
   them there — gitignored, never commit real values) and flip
   `enabled = true` in `supabase/config.toml`'s `[auth.external.google]`
   block, then `npm run db:start` (or `db:stop && db:start` if already
   running) to pick it up. The same two values are also stored as GitHub
   repo secrets (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET`) for any
   future CI job that needs to start the local Supabase stack — the current
   `deploy.yml` doesn't consume them, since production sign-in only needs the
   provider configured in the Supabase dashboard (step 4), not in CI.

### Verifying Google sign-in works

1. On the deployed site, open the sign-in page and click **Continue with
   Google**. You should land on `accounts.google.com` with the URL's
   `client_id` matching the one pasted into Supabase, `redirect_uri` pointing
   at `https://<project-ref>.supabase.co/auth/v1/callback`, and
   `scope=email+profile`.
2. Pick an account. If you don't see Google's "unverified app" warning
   screen, the app is in production (not Testing) — good. If you do see it,
   either add the account as a test user or finish the publish step above.
3. After consent, you should land back on the site's origin, signed in (nav
   shows the account's email + a **Sign out** button). The Supabase session
   JWT's `app_metadata.providers` should include `"google"`.

### Common failure modes

- **Button does nothing / immediate error** — Google provider isn't enabled
  in the Supabase dashboard, or Client ID/Secret are blank/wrong (step 4).
- **`redirect_uri_mismatch` on Google's page** — the exact callback URL
  Supabase used isn't in the GCP client's Authorized redirect URIs (step 2).
  Check both the production project-ref callback and, for local dev, the
  `127.0.0.1:54321` one.
- **Google shows "this app isn't verified" and blocks unlisted users** — the
  consent screen is still in **Testing**; either publish it (step 3) or add
  the user under Audience → Test users.
- **Works for you, fails for other users** — same as above, almost always a
  Testing-mode cap or a missing test-user entry.
- **Works on `https://<your-domain>` but not `127.0.0.1`/local dev** — the
  local callback URI is missing from the GCP client, or
  `supabase/config.toml`'s `[auth.external.google]` is still `enabled =
  false` / the env vars aren't exported before `npm run db:start`.
- **Signed in but redirected to the wrong page, or `?return=` is dropped** —
  check Supabase's URL Configuration → Redirect URLs includes a wildcard for
  your deployed origin (see the `additional_redirect_urls` note above), not
  just the bare origin.

## Sharing & "Save to my account"

Builder UI behavior depends on the viewer's relationship to the loaded deck
(`src/pages/builder.ts`):

- **Owner** (or a brand-new unsaved deck): **Save deck** / **Update deck** +
  **Copy share link**.
- **Non-owner** (including logged-out viewers): **Save to my account**
  instead, which calls `copyDeckToMyAccount()` — fetches the source deck and
  inserts a new `private` row owned by the current user, leaving the
  original untouched.
- **Logged-out** clicking "Save to my account": the target slug is stashed
  in `localStorage` (key `pendingCopySlug` — **not** `sessionStorage`,
  because clicking the magic-link email commonly opens a new browser tab
  that wouldn't share `sessionStorage` with the tab that started sign-in),
  then redirects to `index.html?return=<original deck URL>`. Once signed
  in and back on that URL, `applyPendingCopyIfAny()` in `builder.ts`'s
  `init()` finds the matching pending slug and completes the copy
  automatically.

## Local development

```bash
npm run db:start   # starts the local Supabase Docker stack
npm run db:status  # prints local URLs/keys (also: npx supabase status -o env)
npm run db:reset   # reapplies all migrations from scratch
npm run db:migration <name>  # scaffold a new migration file
npm run db:push    # push pending local migrations to the linked remote project
```

`.env.local` (gitignored) points the dev server at the local stack. Mailpit
(`http://127.0.0.1:54324`) catches magic-link emails sent locally — no real
email provider needed for dev.
