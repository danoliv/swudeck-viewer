# AGENTS.md

## Architecture at a glance
- This is a static, framework-free web app: `index.html` (deck viewer), `compare.html` (two-deck diff), and `settings.html` (CORS/debug toggles) share `styles.css` and browser globals.
- Runtime wiring depends on script tag order, not imports. Preserve page load order when editing HTML:
  - `index.html`: `sets.js` → `shared.js` → `card-module.js` → `ui.js`
  - `compare.html`: `shared.js` → `sets.js` → `card-module.js` → `compare.js`
- `sets.js` is the single source of truth for set codes/order (`loadSets()`); that order drives sorting in `ui.js`, preloading in `card-module.js`, and data refresh in `fetch-sets.js`.
- `shared.js` is the cross-page boundary for fetch/query/count helpers. `ui.js` and `compare.js` intentionally consume globals such as `window.fetchWithRetry`, `window.getDeckIdFromUrl`, and `window.buildDeckCardCounts`.
- `card-module.js` owns card-set caching from `data/*.json`. It indexes cards by `Number` inside a per-set cache, so lookups assume IDs like `SOR_001` and fetch the set JSON once.
- `ui.js` is an IIFE for the main page. It manages recent decks (`localStorage.recentDecks`), query param sync (`?deck=...`), quick compare, and the sorting registry (`window.cardSortRegistry`).
- `compare.js` keeps deck state in module-level `deck1Data`/`deck2Data` and compares consolidated main+sideboard counts; use `analyzeDeckDifferences()` as the pure comparison shape when adding testable logic.
- `settings.html` is not cosmetic: it writes `localStorage.useDirectFetch`, which changes how both `ui.js` and `compare.js` fetch SWUDB deck JSON.

## Fetching, data, and CORS
- Deck JSON comes from `https://swudb.com/api/getDeckJson/<deckId>`; card catalog data is local under `data/*.json` and refreshed by `npm run fetch-sets`.
- Do not replace the fetch flow casually. On localhost, `shared.js` tries direct fetch first; on static/prod-style usage it falls back to external proxies or `fetchUsingExternalProxy()`.
- The “why”: free CORS proxies are unreliable, so localhost and production-like paths intentionally differ. Read `doc/CORS_FIX.md` before changing fetch behavior.
- `clearSetCache()` in `ui.js` clears both in-memory card cache and recent deck history; that coupling is user-visible.

## Language consistency
- This project's app and tooling are TypeScript/JavaScript (Node scripts, Vitest, GitHub Actions). Don't introduce another language (Python, etc.) for app code, scripts, or CI — including throwaway one-liners run via `curl | python3` for inspecting data. If a task seems to call for a different language or a new tool/dependency, ask first instead of switching.
- `swubase_dump.py` is a pre-existing exception, not a precedent — new scripts should still be Node/TS.

## Code patterns to follow
- New browser-facing behavior should stay compatible with inline handlers in HTML (`onclick="loadDeck()"`, `onclick="reverseDeckOrder()"`). If a page calls a function from markup, expose it on `window`.
- For shared/testable logic, follow the existing dual-export pattern: browser globals for runtime plus `module.exports` for Jest (see `shared.js`, `card-module.js`, `compare.js`, `sets.js`).
- Prefer adding pure helpers near existing pure helpers rather than burying logic inside DOM code. Example: `shared.js` owns URL parsing/count aggregation; `compare.js` exports `analyzeDeckDifferences()`.
- Keep card rendering centralized in `card-module.js` (`buildCardHTML`, `buildComparisonCardHTML`) so `index.html` and `compare.html` stay visually consistent.
- If you add a new sort/group mode, register it through `window.cardSortRegistry` in `ui.js` instead of branching inside `displaySortedCards()`.

## Developer workflows
- Install deps: `npm install`
- Local app server: `npm start` (Python `http.server` on port 8000)
- Update local card data in `data/*.json`: `npm run fetch-sets`
- Unit tests: `npm test`
- Coverage: `npm run test:coverage`
- E2E/visual tests: `npm run test:visual`, `npm run test:visual:headed`, update snapshots with `npm run test:visual:update`
- Playwright already starts/reuses the local Python server via `playwright.config.ts`; visual baselines live in `e2e/visual.spec.ts-snapshots/`.

## Browser verification
- For live UI verification (e.g. checking a deployed page or swudb.com), use the `/chrome-connect` skill to attach to the user's already-open Chrome via the `chrome-devtools` MCP server (remote debugging on `127.0.0.1:9222`). This preserves the user's logins — don't launch a fresh/isolated browser instance.

## Deployment
- Pushes to `main` trigger the "Deploy to GitHub Pages" GitHub Actions workflow (test → build → deploy). After pushing, use `gh run list --branch main --limit 3` (and `gh run watch <id>` if still in progress) to confirm the workflow completes successfully.
- Once deployed, always verify the feature actually works on the live site at `https://danoliv.github.io/swudeck-viewer/` (not just localhost) — use `/chrome-connect` to navigate there and check the change end-to-end.

## Testing conventions
- Jest runs in `jsdom` with `jest-fetch-mock` enabled by `test-setup.js`; browser APIs like `fetch`, `localStorage`, and parts of `window.history` are already mocked.
- Existing tests are module-oriented (`__tests__/shared.test.js`, `card-module.test.js`, `compare.test.js`, etc.); add tests next to the module whose public helpers you changed.
- If you make browser code harder to test, you probably crossed a project convention: extract the logic and export it for Node-based tests instead.

