# SWU Deck Viewer

A static multi-page web app for viewing and comparing Star Wars Unlimited deck lists from SWUDB.

**🌐 Live Demo:** https://danoliv.github.io/swudeck-viewer/

## Features

- 📋 Load and view decks from SWUDB URLs
- 🎴 Display card images with front/back flip support
- 🔄 Compare two decks side-by-side
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

### GitHub Pages branch-root build (`main` / root fallback)

```bash
npm run build:pages-root
```

This writes the hashed production bundles to the repository-root `assets/` directory and updates `.vite/manifest.json`. The source HTML pages then boot those built files automatically on static hosts such as GitHub Pages when the repo is still published from `main` / root.

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
- Branch-root fallback: keep Pages on **Deploy from a branch** → `main` / `/ (root)` and run `npm run build:pages-root` before pushing
- Fallback: set the Pages source to **Deploy from a branch** → `main` / `docs`
- Push to `main`
- Confirm the workflow in `.github/workflows/deploy.yml` succeeds

### Manual pre-deploy verification

```bash
npm test
npm run build:pages-root
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

