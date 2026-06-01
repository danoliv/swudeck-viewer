# Migration Plan: Vanilla JS → Vite + TypeScript

## Goal

Replace the current vanilla HTML+JS setup with a **Vite multi-page app** using TypeScript.  
No framework. The HTML files stay as HTML files.  
Every phase leaves a working, testable app. The user validates each phase before the next begins.

---

## Why Vite (not Astro, not Eleventy)

| Criterion | Current (Python+HTML) | Astro | **Vite** |
|---|---|---|---|
| Build step required | no | always | for prod only |
| GitHub Pages deploy | push files | needs CI | push `dist/` |
| Framework opinions | none | heavy | **none** |
| ES modules / real imports | no | yes | **yes** |
| TypeScript | no | yes | **yes** |
| HTML templating | no (copy-paste) | Astro syntax | **plain HTML** |
| 3-page multi-entry build | — | overkill | **built-in** |
| Test runner | Jest + jsdom | Vitest | **Vitest** |

Vite is literally just the tool that bundles this app for prod — no component model, no routing, no template language imposed.

---

## Architecture principles

1. **`src/lib/`** — pure functions, zero DOM, 100% unit-testable with Vitest
2. **`src/pages/`** — DOM orchestration only; thin layer; integration-tested
3. **`src/components/`** — reusable DOM fragments (nav, card rendering)
4. **TypeScript everywhere** — types document data shapes; compiler catches regressions
5. **No `window.*` globals** — use real ES `import/export`
6. **No inline `onclick=`** — use `addEventListener` in page scripts
7. **Vitest** replaces Jest (same API, works natively with Vite + TS)

---

## Phases

### ✅ Phase 0 — Vite scaffold + cleanup
**Goal:** `npm run dev` replaces Python server. Existing app works unchanged at `:5173`.

**Done:**
- Deleted `astro/` folder
- Installed `vite` + `typescript`
- Created `vite.config.ts` (multi-page: `index.html`, `compare.html`, `settings.html`)
- Moved `data/` → `public/data/`, `styles.css` → `public/styles.css`
- Updated `<link href="/styles.css">` in all 3 HTML files
- Updated `fetch-sets.js` to write to `public/data/`
- Updated `package.json` scripts: `dev` → vite, `build` → vite build
- Updated `playwright.config.ts` base URL → `:5173`
- Saved `doc/MIGRATION_PLAN.md` (this file)

**Test gate:**
```bash
npm run dev      # http://localhost:5173 — all 3 pages work
npm test         # all tests pass (still Jest at this stage)
npm run build    # dist/ produced
npm run preview  # dist/ served at :4173
```

---

### Phase 1 — Jest → Vitest
**Goal:** Replace Jest with Vitest. All tests pass under Vitest. Delete Jest.

**Steps:**
- Add `vitest` + `@vitest/coverage-v8` + `happy-dom` to devDependencies
- Add `test` block to `vite.config.ts` (`environment: 'happy-dom'`)
- Port `test-setup.js` — replace `jest-fetch-mock` with Vitest equivalents
- Update test files: `jest.fn()` → `vi.fn()`, `jest.mock()` → `vi.mock()`
- Remove `jest`, `babel-jest`, `jest-environment-jsdom`, `@babel/preset-env` from deps
- Update `npm test` → `vitest run`

**Test gate:**
```bash
npm test         # all tests pass under Vitest
npm run build    # still produces dist/
```

---

### Phase 2 — Shared navigation module
**Goal:** Nav defined once in `src/components/navigation.ts`. Zero HTML duplication.

**Steps:**
- Create `src/components/navigation.ts` — `renderNavigation(currentPage)` builds + injects nav DOM
- Create `src/components/navigation.test.ts` — unit tests: renders 3 links, active class, correct hrefs
- Add `<script type="module" src="/src/components/navigation.ts" data-page="viewer">` to each HTML
- Remove duplicated `<div class="navigation">` from all 3 HTML files

**Test gate:**
```bash
npm test              # navigation unit tests pass
npm run dev           # nav visible on all 3 pages, correct link highlighted
```

---

### Phase 3 — `shared.js` → typed modules
**Goal:** `shared.js` split into 3 focused typed files. No more `window.*` for these helpers.

**Creates:**
- `src/lib/url.ts` — `getDeckIdFromUrl`, `getQueryParam`, `setQueryParam`, `setQueryParams`
- `src/lib/api.ts` — `fetchWithRetry`, `fetchUsingExternalProxy`, CORS proxy logic
- `src/lib/deck-info.ts` — `buildDeckCardCounts`, `deckInfoHTML`

**Steps:**
- Define TypeScript interfaces: `DeckData`, `CardCounts`
- Implement each file with `export function` (no `module.exports`, no `window.*`)
- Port `shared.test.js` → `src/lib/*.test.ts` (one file per module)
- Update HTML pages to import from `src/lib/` instead of `<script src="shared.js">`
- Delete `shared.js`

**Test gate:**
```bash
npm test         # all url/api/deck-info tests pass
npm run dev      # app works, network requests succeed
```

---

### Phase 4 — `sets.js` → `src/lib/sets.ts`
**Goal:** Type-safe set definitions. Remove global dependency.

**Steps:**
- `src/lib/sets.ts` — `export const SETS: string[]`, `export function loadSets(): string[]`
- Port `sets.test.js` → `src/lib/sets.test.ts`
- Update `card-module.js` + `ui.js` to `import { loadSets } from './sets'`
- Delete `sets.js`

**Test gate:**
```bash
npm test         # sets tests pass
npm run dev      # card preloading still works
```

---

### Phase 5 — `card-module.js` → `src/lib/cards.ts`
**Goal:** Type-safe card data loading and rendering.

**Steps:**
- Define `Card` interface matching actual JSON shape
- `src/lib/cards.ts` — `loadCardSet`, `fetchCardData`, `clearCardCache`, `buildCardHTML`, `buildComparisonCardHTML`
- `src/lib/cards.test.ts` — test HTML output (CSS classes, count text, aspect spans), fetch mocking
- Delete `card-module.js`

**Test gate:**
```bash
npm test              # card module tests pass
npm run dev           # cards render correctly with images
```

---

### Phase 6 — `ui.js` → `src/lib/deck.ts` + `src/pages/index.ts`
**Goal:** 724-line IIFE → testable library + thin DOM layer.

**Split:**
- `src/lib/deck.ts` — `groupCards`, `CardSortRegistry`, all sort strategies (pure, no DOM)
- `src/pages/index.ts` — `loadDeck`, recent decks, URL sync (DOM orchestration, imports from lib)

**Steps:**
- Extract sort strategies and grouping to `deck.ts` with TypeScript types
- `src/lib/deck.test.ts` — test each sort strategy + `groupCards` with fixture data
- Thin DOM layer in `index.ts` imports from `deck.ts`, `cards.ts`, `api.ts`, `url.ts`
- `index.html` loads `<script type="module" src="/src/pages/index.ts">`
- Replace `onclick=` inline handlers with `addEventListener` in `index.ts`
- Delete `ui.js`

**Test gate:**
```bash
npm test              # deck sort strategies + groupCards tested
npm run dev           # load a real deck, all sort buttons work, recent decks work
npm run build         # open dist/index.html and verify
```

---

### Phase 7 — `compare.js` → `src/lib/compare.ts` + `src/pages/compare.ts`
**Goal:** Comparison page uses typed lib modules.

**Steps:**
- Port `analyzeDeckDifferences` to `src/lib/compare.ts`
- `src/pages/compare.ts` — DOM orchestration only
- Port `compare.test.js` → `src/lib/compare.test.ts`
- Replace `onclick=` inline handlers with `addEventListener`
- Delete `compare.js`

**Test gate:**
```bash
npm test              # compare tests pass
npm run dev           # load two decks, comparison renders, reverse works
```

---

### Phase 8 — Settings page + cleanup
**Goal:** All legacy files gone. Full typed codebase.

**Steps:**
- `src/pages/settings.ts` — typed localStorage helpers, event listeners bound
- Remove inline `<script>` from `settings.html`
- Remove `test.js` (old test runner), update `test-setup.js` → Vitest setup file
- Final `npm run build` passes cleanly

**Test gate:**
```bash
npm test              # full suite passes
npm run build         # clean dist/
npm run preview       # all 3 pages work at :4173
```

---

### Phase 9 — GitHub Pages CI/CD
**Goal:** Push to `main` → site live on GitHub Pages.

**Steps:**
- `.github/workflows/deploy.yml`: `install → npm test → vite build → deploy dist/`
- `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`
- All hrefs in `navigation.ts` use `import.meta.env.BASE_URL`
- Playwright e2e runs against `dist/` via `vite preview`

**Test gate:**
```bash
VITE_BASE=/swudeck-viewer npm run build   # dist/ with correct paths
# push to main → GitHub Actions deploys → pages live
```

---

## Summary checklist

- [x] Phase 0 — Vite scaffold, `astro/` deleted
- [x] Phase 1 — Vitest replaces Jest
- [x] Phase 2 — Navigation component
- [x] Phase 3 — `shared.js` → typed modules
- [x] Phase 4 — `sets.ts`
- [x] Phase 5 — `cards.ts`
- [x] Phase 6 — `deck.ts` + `index.ts`
- [x] Phase 7 — `compare.ts`
- [x] Phase 8 — Settings + cleanup
- [x] Phase 9 — GitHub Pages CI/CD

---

## Dev workflow (during migration)

```bash
npm run dev          # Vite dev server → http://localhost:5173
npm test             # Vitest unit tests (after Phase 1)
npm run build        # production build → dist/
npm run preview      # serve dist/ → http://localhost:4173
npm run fetch-sets   # update card data in public/data/
npm run test:visual  # Playwright e2e
```

