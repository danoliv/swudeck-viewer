# Backend Plan: Auth, Saved Decks & Shareable Links (Supabase)

> **For Claude Code.** This is an implementation plan for adding a backend to the
> existing static SWU Deck Viewer app. The frontend stays on GitHub Pages and
> keeps deploying via the current `.github/workflows/deploy.yml`. We add Supabase
> for auth + persistence only. **No framework migration** — keep the existing
> Vite multi-page, vanilla-TS, browser-native-DOM architecture.

## Goal (user stories)

1. A user can **log in** (magic-link email + GitHub OAuth).
2. A logged-in user can **save the current builder deck** to their account and see a list of **"My Decks"**.
3. A user can **share a link**; anyone opening it sees the deck.
4. A viewer (logged in) can **"Save to my account"** — copy a shared deck into their own deck list.

## Hard constraints (do not violate)

- **Keep GitHub Pages.** Frontend stays static. Supabase is reached over HTTPS from the browser via `@supabase/supabase-js`. No server code we host.
- **Keep the existing URL `?d=` sharing.** It is free, instant, and account-less. The backend adds *persistent, owned* sharing alongside it — it does **not** replace `?d=`.
- **Reuse `src/lib/builder-state.ts` and the `DeckData` type** (`src/lib/types.ts`). Saved decks store the same `DeckData` JSON object that is already encoded into the URL. Do not invent a new deck shape.
- **Vanilla TS only.** No React/Vue. Match existing `src/lib/` (pure logic) vs `src/pages/` (page orchestration) split.
- **All secrets are build-time `VITE_` env vars.** The Supabase anon key + URL are public by design; RLS protects data. Never add a service-role key to frontend code.
- Tests: add Vitest unit tests for new pure logic; keep Playwright green. Network calls to Supabase must be mockable/guarded so existing e2e tests don't hit the network.

---

## Phase 0 — Project setup (no app code yet)

1. Create a Supabase project (free tier). Record the **Project URL** and **anon public key**.
2. Add dependency: `npm install @supabase/supabase-js`.
3. Add env vars. Create `.env.local` (gitignored) for dev:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. In the GitHub Actions deploy workflow, inject the same two vars from **GitHub repo secrets** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) into the build step env, so the production build on Pages is configured. (Anon key is safe to expose, but using a secret keeps it out of the committed source.)
5. **Feature flag:** the whole backend is gated behind `import.meta.env.VITE_SUPABASE_URL` being present. If it is absent (e.g. in e2e/CI without secrets), the app silently behaves exactly like today — no login UI, `?d=` sharing only. This keeps existing tests deterministic.

**Acceptance:** app builds and runs unchanged with and without env vars set.

---

## Phase 1 — Database schema & security (Supabase SQL)

Create a single `decks` table. Store the existing `DeckData` object verbatim in a `jsonb` column — do **not** normalize cards.

```sql
create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  slug        text not null unique,                 -- short, URL-safe share id
  name        text not null default 'Untitled deck',
  data        jsonb not null,                       -- the DeckData object
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

-- Anyone (incl. anon) can READ shared decks
create policy "read_shared" on public.decks
  for select using (visibility in ('public','unlisted'));

-- keep updated_at fresh
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger decks_touch before update on public.decks
  for each row execute function public.touch_updated_at();
```

Notes on the visibility model:
- `private` — only owner can see.
- `unlisted` — anyone with the slug link can see (not listed/discoverable). This is the default for "share a link."
- `public` — readable + could be listed in a future browse page.

**Acceptance:** with RLS on, an anon client can `select` an `unlisted`/`public` row by slug but cannot read a `private` row, and cannot insert/update any row.

---

## Phase 2 — Supabase client + auth plumbing (`src/lib/`)

Create `src/lib/supabase.ts`:
- Export a lazily-created singleton client from `createClient(url, anonKey)`.
- Export `isBackendEnabled(): boolean` (true iff env vars present).
- Guard: if not enabled, all backend functions are no-ops / throw a clear error the UI checks for.

Create `src/lib/auth.ts` (thin wrapper, pure-ish, easily mockable):
- `getСurrentUser()` → current session user or null.
- `signInWithEmail(email)` → magic link (`signInWithOtp`).
- `signInWithGitHub()` → OAuth redirect.
- `signOut()`.
- `onAuthChange(cb)` → subscribe to auth state.
- **Redirect URLs:** configure Supabase Auth "Site URL" + "Redirect URLs" to include the GitHub Pages origin (and the custom domain later). Use `window.location.origin + import.meta.env.BASE_URL` so it works under the `/swudeck-viewer/` base path.

Create `src/lib/decks-api.ts` (all DB access in one place, returns plain typed objects):
- `listMyDecks(): Promise<DeckRow[]>`
- `getDeckBySlug(slug): Promise<DeckRow | null>`
- `saveDeck({ name, data, visibility }): Promise<DeckRow>` (insert; generates slug)
- `updateDeck(id, patch): Promise<DeckRow>`
- `deleteDeck(id): Promise<void>`
- `copyDeckToMyAccount(slug): Promise<DeckRow>` — fetch by slug, then insert a new row owned by current user with the same `data` (this is the "save someone else's deck" feature).

Add `src/lib/slug.ts` (pure, unit-tested): generate a short URL-safe slug (e.g. 8–10 chars base62, collision-retry handled by the unique constraint).

**Reuse, don't reinvent:** `saveDeck` takes the exact `DeckData` object that `builder-state.ts` already produces. The builder page reads its current state (already decoded from `?d=`) and passes it straight in.

**Acceptance:** unit tests for `slug.ts` and for the pure transform parts; `decks-api.ts` functions typecheck against `DeckData`.

---

## Phase 3 — Auth UI (minimal, matches existing nav)

- Add an **account control to the shared nav component** (`src/components/`): shows "Sign in" when logged out, and the user's email + "Sign out" when logged in.
- Create `account.html` + `src/pages/account.ts`: a small sign-in page (email input → "Send magic link"; "Continue with GitHub" button) and, when logged in, the **"My Decks"** list (name, visibility badge, "Open in builder", "Copy share link", "Delete").
- Handle the OAuth/magic-link **redirect callback**: on any page load, let supabase-js detect the session from the URL hash and clean it up.

**Acceptance:** can sign in via magic link and GitHub, see email in nav, sign out. State persists across page loads (Supabase stores session in localStorage by default).

---

## Phase 4 — Save & load in the builder (`builder.html`)

In `src/pages/builder.ts` (or wherever builder orchestration lives), add — **only when `isBackendEnabled()` and user is logged in**:

- A **"Save deck"** button:
  - First save → `saveDeck({ name, data: currentDeck, visibility: 'unlisted' })`, store returned `id`/`slug` in page state.
  - Subsequent saves → `updateDeck(id, { data, name })`.
  - `name` comes from `DeckData.metadata.name` (already in your shape), with an inline rename field.
- **Loading a saved deck:** support `builder.html?id=<slug>`:
  - On load, if `?id=` present, `getDeckBySlug(slug)`, take `row.data` (a `DeckData`), and feed it into the existing builder state exactly as if it had been decoded from `?d=`. Then the existing live-encoding into `?d=` continues to work for in-session edits.
  - Precedence: if both `?id=` and `?d=` are present, `?id=` wins (it's the canonical saved version); document this.

**Acceptance:** logged-in user edits a deck, clicks Save, reloads `builder.html?id=<slug>`, sees the same deck. Editing still updates the live `?d=` URL.

---

## Phase 5 — Sharing & "save to my account"

Two share mechanisms coexist; surface both in a **Share** menu:

1. **Instant link (existing):** the current `builder.html?d=<encoded>` URL. No account, no backend. Keep as-is.
2. **Persistent link (new):** `builder.html?id=<slug>` for a saved deck. Short, stable, owned, editable later.

**Viewer experience for a shared `?id=` link:**
- Anyone (even logged out) opening `builder.html?id=<slug>` loads the deck read-only-ish (they can fork/edit locally; edits just go to their own `?d=` and don't touch the owner's saved row — RLS guarantees this).
- If logged in, show a **"Save to my account"** button → `copyDeckToMyAccount(slug)` → creates their own copy, redirect to `builder.html?id=<newSlug>`.
- If logged out, the button prompts sign-in first, then performs the copy (stash the pending slug through the auth redirect).

**Acceptance:** User A saves a deck and copies its share link. User B opens it, sees the deck, clicks "Save to my account," and it appears in User B's "My Decks" as an independent copy. User A's original is unchanged.

---

## Phase 6 — Polish & guardrails

- **Optimistic + error states:** disable Save while in-flight; toast on failure (RLS denial, network).
- **Empty/edge cases:** unknown slug → friendly "deck not found"; private deck opened by non-owner → "not found" (don't leak existence).
- **Rate / size:** reject decks whose `data` exceeds a sane size; validate it parses as `DeckData` before insert.
- **Docs:** add `doc/BACKEND.md` describing the schema, RLS, env vars, and the `?d=` vs `?id=` distinction. Update README's "Deck Builder State Encoding" section to mention persistent saves.
- **Tests:** unit-test `slug.ts`, the `?id=`-vs-`?d=` precedence resolver (make it a pure function), and `copyDeckToMyAccount`'s transform. Keep Playwright running with the backend flag **off** so e2e stays hermetic; optionally add one gated e2e against a Supabase test project later.

---

## Suggested file changes summary

```
new   src/lib/supabase.ts          # client singleton + isBackendEnabled()
new   src/lib/auth.ts              # sign in/out, session, onAuthChange
new   src/lib/decks-api.ts         # list/get/save/update/delete/copy
new   src/lib/slug.ts              # pure slug generator (unit-tested)
new   src/lib/share-target.ts      # pure: resolve ?id= vs ?d= precedence (unit-tested)
new   account.html                 # sign-in + My Decks page
new   src/pages/account.ts
edit  src/components/<nav>          # account control (sign in / email / sign out)
edit  src/pages/builder.ts         # Save button, ?id= loading, Share menu, Save-to-account
edit  .github/workflows/deploy.yml # inject VITE_SUPABASE_* from repo secrets
edit  .gitignore                   # .env.local
new   doc/BACKEND.md               # schema, RLS, env, sharing model
edit  README.md                    # note persistent saves alongside ?d=
```

## Build order for Claude Code (do these as separate commits/PRs)

1. Phase 0 + Phase 2 client plumbing behind the feature flag (no UI yet). Verify build with and without env vars.
2. Phase 1 SQL applied in Supabase; manually verify RLS with the dashboard SQL editor.
3. Phase 3 auth UI.
4. Phase 4 save/load in builder.
5. Phase 5 sharing + save-to-account.
6. Phase 6 polish, docs, tests.

## Cost note

Everything above runs on **Supabase free tier** ($0) using the default
`xxxx.supabase.co URL`, with the frontend on **GitHub Pages free**. A custom
backend domain (`api.swudeck.app`) is a later, optional upgrade: it requires
Supabase Pro ($25/mo) **plus** the Custom Domain add-on ($10/mo). Not needed to
ship any of the features above. A custom *frontend* domain on GitHub Pages is
free (you only pay your registrar for the domain name).
