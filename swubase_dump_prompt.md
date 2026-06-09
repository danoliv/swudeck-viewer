# Claude Code prompt — swubase.com data dumper (Python)

Paste everything below into Claude Code (in an empty project folder).

---

## Task

Build a single, self-contained **Python 3 CLI script** (`swubase_dump.py`) that dumps Star Wars: Unlimited metagame statistics from the public **swubase.com** backend API into local **JSON** files, and for **each dataset it writes a companion Markdown (`.md`) file** that explains what the dataset contains, the meaning of every field, and how to use it for deckbuilding.

swubase.com is the frontend of the open-source project `the-medo/swu-collection` (AGPL-3.0). The frontend talks to a Hono backend at the **same origin**, so the public API base is:

```
https://swubase.com/api
```

I have already reverse-engineered the relevant endpoints from the repo's frontend hooks (`frontend/src/api/...`). Use these as the spec, but **before building the dumper, probe each endpoint once and print the raw JSON** — the API may have changed, may require headers (`Accept: application/json`, a realistic `User-Agent`, maybe `Referer: https://swubase.com/`), or may rate-limit. Adapt to what the probes actually return. Do not assume; confirm first.

### Implementation constraints

- **Python 3.9+**, single file `swubase_dump.py`. Prefer the **standard library only** (`urllib.request`, `json`, `argparse`, `time`, `pathlib`, `datetime`). If you use `requests`, keep it optional with a stdlib fallback so the script runs with zero `pip install`.
- Use `argparse` for the CLI. Native JSON output (pretty-printed, UTF-8, `ensure_ascii=False`).
- No secrets, no auth assumed.

### Endpoints (from the source — verify before relying on them)

1. **List metas** — `GET /api/meta`
   Optional query params: `set` (str), `format` (int), `season` (int), `minSeason` (int), `limit` (int), `offset` (int), `sort` (str), `order` (`asc`|`desc`).
   Response: `{ data: MetaData[], pagination: { limit, offset, hasMore } }`,
   `MetaData = { meta: { id:int, set:str, name:str, format:int, date:str, season:int }, format: { id:int, name:str, description:str } }`.
   `format` is a numeric id — discover the name→id mapping (Premier / Eternal / Twin Suns) empirically by listing metas and reading `format.name`.

2. **Get one meta** — `GET /api/meta/:id` → `{ data: MetaData }`.

3. **Card statistics** — `GET /api/card-stats`
   Query: `meta_id` (int) OR `tournament_id` (str) OR `tournament_group_id` (str) [one required]; optional `leader_card_id` (str), `base_card_id` (str), `leaderAndBase` (bool). If `base_card_id` is set, `leader_card_id` must be too.
   Response: `{ data: CardStatExtended[] }`,
   `CardStat = { cardId:str, countMd:int, countSb:int, deckCount:int, matchWin:int, matchLose:int }`
   (`countMd` = copies in maindecks, `countSb` = sideboards; win rate = `matchWin/(matchWin+matchLose)`).

4. **Top played cards** — `GET /api/card-stats/top-played`
   Query: `meta_id` (int) OR `tournament_id` (str) OR `tournament_group_id` (str) [one required]; optional `leader_ids` (comma-sep), `leader_base_pairs` (comma-sep), `limit` (int).
   Response: `{ data: Record<string, TopPlayedCardStat[]> }` keyed by leader or leader/base,
   `TopPlayedCardStat = CardStat & { leaderCardId?:str, baseCardId?:str, totalCount:int }`.

5. Matchup + tournament endpoints exist too (frontend hooks `useMatchupCardStats`, `useMatchupStatDecks`). If `--matchups` is requested, discover their exact paths first by fetching the hook files from the repo raw base: `https://raw.githubusercontent.com/the-medo/swu-collection/main/frontend/src/api/`.

### CLI behavior

Flags: `--format <name|id>` (default `Eternal`), `--meta <id>` (optional; if omitted, auto-pick the **latest** meta for that format), `--out <dir>` (default `./swubase-dump`), `--limit <n>` (top-played, default 20), `--matchups` (optional), `--no-cache` (force refresh).

Steps: list metas → resolve format → select meta → fetch card-stats and top-played → optionally matchups → write raw JSON + derived summary → print a one-screen summary of the top 5 leader+base combos (meta share + win rate) to stdout.

### Output files (in `--out`)

For **every** JSON dataset below, also write a sibling `.md` with the **same basename** (e.g. `card-stats-<metaId>.json` → `card-stats-<metaId>.md`). Each `.md` must explain: what the dataset is, where it came from (endpoint + params + fetch timestamp), every field and its meaning, gotchas (e.g. small sample sizes inflate win rates), and a short "how to use this for deckbuilding" note.

- `metas.json` / `.md` — meta list for the format.
- `meta-<id>.json` / `.md` — chosen meta detail.
- `card-stats-<metaId>.json` / `.md` — overall card stats for the meta.
- `top-played-<metaId>.json` / `.md` — top-played cards grouped by leader/base pair.
- `matchups-<metaId>.json` / `.md` — only if `--matchups` and the endpoint is confirmed.
- `summary-<metaId>.json` / `.md` — **the key deckbuilding artifact**: leader+base combos **sorted by meta share then win rate**, each with deck count, meta share %, win rate %, and its top-N most-played maindeck cards (cardId + inclusion rate = `countMd / deckCount`). The `.md` version is a readable tier table.
- Also write one top-level `README.md` in `--out` that indexes all datasets, records the run parameters and timestamp, notes the data source, and explains the recommended deckbuilding workflow (read `summary` first → pick a combo → open its `top-played` list → build/tune).

### Engineering requirements

- Polite client: descriptive `User-Agent`, `Accept: application/json`, `Referer: https://swubase.com/`; ~250–500 ms delay between requests; retry transient 5xx/network errors with backoff (max 3); never retry 404.
- Paginate `/api/meta` via `limit`/`offset`/`pagination.hasMore`.
- Cache raw responses to disk; `--no-cache` forces refresh so analysis re-runs don't re-hit the API.
- Validate response shapes against the spec; if a shape differs, fail loudly with a clear message so we catch API drift.
- If a probe shows the API requires auth or blocks the request, **stop and report exactly what you got** (status, headers, body snippet) instead of working around it; then suggest next steps.
- Header comment in the script: data source is swubase.com (unofficial fan project; SWU data © FFG/LFL), read-only personal use, low volume, AGPL-3.0 project.

### Deliverables

1. `swubase_dump.py` and a top-level `README.md` (usage examples: `python swubase_dump.py --format Eternal`, `... --meta 42 --matchups`, `... --no-cache`).
2. A first successful live run (or, if blocked, the exact probe output + explanation).
3. The per-dataset `.md` explainers as specified.

Start by probing `GET https://swubase.com/api/meta?limit=3&order=desc` and showing me the raw JSON before building anything.
