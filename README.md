# SWU Deck Viewer

A static multi-page web app for viewing and comparing Star Wars Unlimited deck lists from SWUDB.

**🌐 Live Demo:** https://danoliv.github.io/swudeck-viewer/

## Features

- 📋 Load and view decks from SWUDB URLs
- 🎴 Display card images with front/back flip support
- 🔄 Compare two decks side-by-side
- 🛠️ Build decks from scratch, with a shareable URL-encoded deck state
- 📊 Multiple sorting options (Set, Cost, Aspect, Type, Trait)
- 💾 Recent decks history
- ⚡ Card data caching for faster loading
- 🧪 Unit, functional, and visual test coverage

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the local dev server**

   ```bash
   npm run dev
   ```

3. **Open in the browser**

   ```text
   http://localhost:5173
   ```

4. **If SWUDB fetches are blocked locally**

   - Open `http://localhost:5173/settings.html`
   - Enable **Direct API Fetch**
   - Or use a browser setup/extension that relaxes CORS during local testing

## Usage

### View a Deck

1. Paste a SWUDB deck URL such as `https://swudb.com/deck/YHNqqVcCe`
2. Click **Load Deck**
3. Browse cards sorted by set, cost, aspect, type, or traits

### Compare Decks

1. Open `http://localhost:5173/compare.html`
2. Enter two deck URLs
3. Load both decks to view differences and shared cards

### Build a Deck

1. Open `http://localhost:5173/builder.html`
2. Pick a leader, then a base
3. Search and filter the card pool on the right and use the `0`/`1`/`2`/`3` /
   `SB` controls to add cards to your main deck or sideboard
4. The deck list on the left updates live, grouped by card type

The deck builder has no backend — see [Deck Builder State Encoding](#deck-builder-state-encoding)
for how the in-progress deck is persisted and shared.

## Build Instructions

### Development build / local dev server

```bash
npm run dev
```

This serves the app from Vite on `http://localhost:5173`.

### Production build

```bash
npm run build
```

This creates a production-ready `dist/` folder.

### Preview the production build locally

```bash
npm run preview
```

By default Vite preview serves the built app locally; Playwright is configured to use preview on port `4173`.

### GitHub Pages-compatible build

```bash
VITE_BASE=/swudeck-viewer/ npm run build
```

Use a different repository path if your Pages site is hosted under another repo name.

### GitHub Pages branch-publish build (`docs/` fallback)

```bash
npm run build:docs
```

This writes the production site into `docs/` with the correct `/swudeck-viewer/` base path, which works when GitHub Pages is configured to publish from the `main` branch `docs/` folder.

## Test Run Instructions

### Unit tests (Vitest)

```bash
npm test
```

### Unit tests in watch mode

```bash
npm run test:watch
```

### Coverage report

```bash
npm run test:coverage
```

### End-to-end suite (Playwright)

```bash
npm run test:e2e
```

This runs both functional and visual Playwright checks against a production-like `vite preview` server.

### Refresh visual snapshots

```bash
npm run test:e2e:update
```

### Headed end-to-end run

```bash
npm run test:e2e:headed
```

### Refresh local card catalog data

```bash
npm run fetch-sets
```

This updates files in `public/data/`.

## Deploy Instructions

### Automatic GitHub Pages deployment

The repository includes `.github/workflows/deploy.yml`.

On every push to `main`, GitHub Actions will:

1. Install dependencies with `npm ci`
2. Run unit tests with `npm test`
3. Build the site with `npm run build`
4. Set `VITE_BASE` to `/${repo-name}/`
5. Deploy `dist/` to GitHub Pages

### GitHub repository setup checklist

- Enable **GitHub Pages** for the repository
- Preferred: set the Pages source to **GitHub Actions**
- Fallback: set the Pages source to **Deploy from a branch** → `main` / `docs`
- Push to `main`
- Confirm the workflow in `.github/workflows/deploy.yml` succeeds

### Manual pre-deploy verification

```bash
npm test
npm run test:e2e
VITE_BASE=/swudeck-viewer/ npm run build
npm run build:docs
```

## Project Structure

- `src/lib/` — pure TypeScript logic
- `src/pages/` — page orchestration modules
- `src/components/` — reusable UI pieces such as navigation
- `public/data/` — local card catalog JSON files
- `e2e/` — Playwright functional + visual tests
- `doc/` — migration, CORS, and testing documentation

## Deck Builder State Encoding

The deck builder (`builder.html`) has no backend or local storage — the entire
in-progress deck lives in the page's own URL, in the `?d=` query parameter.
Encoding/decoding is implemented in `src/lib/builder-state.ts`.

**Shape** — the deck is a JSON object matching the `DeckData` type
(`src/lib/types.ts`):

```json
{
  "deck": [{ "id": "SOR_031", "count": 2 }],
  "sideboard": [{ "id": "SOR_073", "count": 1 }],
  "leader": { "id": "SOR_001", "count": 1 },
  "base": { "id": "SOR_022", "count": 1 },
  "metadata": { "name": "My Deck" }
}
```

- `deck` / `sideboard` — arrays of `{ id, count }`, one entry per unique card
- `leader` / `base` — single `{ id, count }` entries, omitted until chosen
- `metadata` — optional deck name/description/author/format
- This mirrors the shape of swudb's "Force Table" export

**Encoding** (`encodeDeckState`): `JSON.stringify` the object, UTF-8 encode it,
then base64url-encode it (`+` → `-`, `/` → `_`, `=` padding stripped). The
result is written to the `d` query param via `setQueryParam`.

**Decoding** (`decodeDeckState`): reverses the process — base64url → UTF-8 →
`JSON.parse`. It never throws: missing, empty, or malformed input falls back
to an empty deck (`{ deck: [] }`).

Every mutation (choosing a leader/base, changing a card's count, toggling the
sideboard) goes through a pure `(deck, ...args) -> newDeck` function in
`builder-state.ts`, which the page then re-encodes back into the URL. Because
all state lives in the URL, a builder link is a complete, shareable snapshot
of the deck.

## Documentation

Additional documentation lives in [`doc/`](./doc/):

- **[`doc/CORS_FIX.md`](./doc/CORS_FIX.md)** — CORS behavior and local testing guidance
- **[`doc/MIGRATION_PLAN.md`](./doc/MIGRATION_PLAN.md)** — completed migration plan
- **[`doc/TEST_README.md`](./doc/TEST_README.md)** — testing notes
- **[`doc/TEST_COVERAGE_SUMMARY.md`](./doc/TEST_COVERAGE_SUMMARY.md)** — coverage details

## Tech Stack

- Vite multi-page app
- TypeScript
- Browser-native DOM modules (no framework)
- Vitest + Happy DOM for unit tests
- Playwright for functional and visual tests
- GitHub Pages for deployment
- SWUDB API for deck data

## License

This project is for educational and personal use.

