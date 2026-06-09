"""
swubase_dump.py — Star Wars: Unlimited metagame data dumper
Data source: swubase.com (unofficial fan project; SWU data © FFG/LFL)
API: https://swubase.com/api  (open-source backend: the-medo/swu-collection, AGPL-3.0)
Read-only personal use, low volume. No auth required.
"""

import argparse
import json
import time
import sys
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

BASE_URL = "https://swubase.com/api"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://swubase.com/",
}
REQUEST_DELAY = 0.4   # seconds between requests
MAX_RETRIES = 3


def _fetch_raw(url: str) -> bytes:
    """Fetch URL with retry/backoff. Returns raw bytes."""
    req = urllib.request.Request(url, headers=HEADERS)
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last_err = e
            print(f"  [warn] HTTP {e.code} on attempt {attempt+1}, retrying…", file=sys.stderr)
            time.sleep(2 ** attempt)
        except urllib.error.URLError as e:
            last_err = e
            print(f"  [warn] Network error on attempt {attempt+1}: {e.reason}, retrying…", file=sys.stderr)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts: {last_err}") from last_err


def fetch_json(path: str, params: dict | None = None) -> dict:
    """GET /api/<path>?params and return parsed JSON. Raises on bad shape."""
    qs = ("?" + urllib.parse.urlencode(params)) if params else ""
    url = f"{BASE_URL}/{path.lstrip('/')}{qs}"
    print(f"  GET {url}")
    raw = _fetch_raw(url)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Non-JSON response from {url}: {raw[:200]}") from e
    time.sleep(REQUEST_DELAY)
    return data


# ---------------------------------------------------------------------------
# Disk cache
# ---------------------------------------------------------------------------

def cache_path(out_dir: Path, key: str) -> Path:
    return out_dir / "_cache" / f"{key}.json"


def load_cache(out_dir: Path, key: str):
    p = cache_path(out_dir, key)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


def save_cache(out_dir: Path, key: str, data):
    p = cache_path(out_dir, key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def cached_fetch(out_dir: Path, key: str, path: str, params: dict | None, no_cache: bool) -> dict:
    if not no_cache:
        hit = load_cache(out_dir, key)
        if hit is not None:
            print(f"  [cache] {key}")
            return hit
    data = fetch_json(path, params)
    save_cache(out_dir, key, data)
    return data


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def expect_keys(obj: dict, keys: list[str], context: str):
    missing = [k for k in keys if k not in obj]
    if missing:
        raise RuntimeError(f"API shape mismatch at {context}: missing keys {missing}. Got: {list(obj.keys())}")


# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------

def list_all_metas(out_dir: Path, no_cache: bool) -> list[dict]:
    """Paginate /api/meta and return all records."""
    all_data = []
    offset = 0
    limit = 50
    while True:
        key = f"meta_page_{offset}"
        resp = cached_fetch(out_dir, key, "meta", {"limit": limit, "offset": offset, "order": "desc"}, no_cache)
        expect_keys(resp, ["data", "pagination"], "GET /api/meta")
        all_data.extend(resp["data"])
        if not resp["pagination"].get("hasMore"):
            break
        offset += limit
    return all_data


def get_meta(out_dir: Path, meta_id: int, no_cache: bool) -> dict:
    resp = cached_fetch(out_dir, f"meta_{meta_id}", f"meta/{meta_id}", None, no_cache)
    expect_keys(resp, ["data"], f"GET /api/meta/{meta_id}")
    return resp["data"]


def get_card_stats(out_dir: Path, meta_id: int, no_cache: bool) -> list[dict]:
    resp = cached_fetch(out_dir, f"card_stats_{meta_id}", "card-stats", {"meta_id": meta_id}, no_cache)
    expect_keys(resp, ["data"], "GET /api/card-stats")
    return resp["data"]


def get_top_played(out_dir: Path, meta_id: int, limit: int, no_cache: bool) -> dict:
    resp = cached_fetch(
        out_dir, f"top_played_{meta_id}_{limit}",
        "card-stats/top-played", {"meta_id": meta_id, "limit": limit}, no_cache
    )
    expect_keys(resp, ["data"], "GET /api/card-stats/top-played")
    return resp["data"]


# ---------------------------------------------------------------------------
# Resolve format
# ---------------------------------------------------------------------------

def resolve_format(metas: list[dict], format_arg: str) -> tuple[int, str]:
    """Return (format_id, format_name) for the given --format argument."""
    # Build a mapping from name→id and id→name
    name_to_id: dict[str, int] = {}
    id_to_name: dict[int, str] = {}
    for entry in metas:
        fmt = entry.get("format", {})
        fid = fmt.get("id")
        fname = fmt.get("name", "")
        if fid and fname:
            name_to_id[fname.lower()] = fid
            id_to_name[fid] = fname

    # Try numeric
    try:
        fid = int(format_arg)
        if fid not in id_to_name:
            raise RuntimeError(f"Format id {fid} not found in meta list. Known ids: {list(id_to_name.keys())}")
        return fid, id_to_name[fid]
    except ValueError:
        pass

    # Try name (case-insensitive prefix match)
    lower = format_arg.lower()
    matches = [(k, v) for k, v in name_to_id.items() if k.startswith(lower)]
    if len(matches) == 1:
        return matches[0][1], next(n for n, i in name_to_id.items() if i == matches[0][1]).title()
    if len(matches) > 1:
        names = [m[0] for m in matches]
        raise RuntimeError(f"Ambiguous --format '{format_arg}': matches {names}")
    raise RuntimeError(
        f"Format '{format_arg}' not found. Known formats: {list(name_to_id.keys())}"
    )


def pick_meta(metas: list[dict], format_id: int, meta_id_arg: int | None) -> dict:
    """Return the chosen meta entry."""
    format_metas = [e for e in metas if e.get("meta", {}).get("format") == format_id]
    if not format_metas:
        raise RuntimeError(f"No metas found for format id {format_id}")
    if meta_id_arg is not None:
        matches = [e for e in format_metas if e["meta"]["id"] == meta_id_arg]
        if not matches:
            available = [e["meta"]["id"] for e in format_metas]
            raise RuntimeError(f"Meta id {meta_id_arg} not in format. Available: {available}")
        return matches[0]
    # Latest by date
    return max(format_metas, key=lambda e: e["meta"]["date"])


# ---------------------------------------------------------------------------
# Summary builder
# ---------------------------------------------------------------------------

def build_summary(meta_entry: dict, card_stats: list[dict], top_played: dict, top_n: int) -> dict:
    """Build the deckbuilding summary: leader+base combos sorted by meta share then win rate."""
    meta_id = meta_entry["meta"]["id"]

    # Gather per-combo deck counts from top_played keys
    # Keys are like "leader_id" or "leader_id/base_id"
    combos = []
    total_decks_seen = set()

    for combo_key, cards in top_played.items():
        if not cards:
            continue
        # Infer deck count and win stats from the first card's deckCount (representative)
        # We pick the card with the highest deckCount as the anchor
        anchor = max(cards, key=lambda c: c.get("deckCount", 0))
        deck_count = anchor.get("deckCount", 0)
        match_win = anchor.get("matchWin", 0)
        match_lose = anchor.get("matchLose", 0)
        total_matches = match_win + match_lose
        win_rate = round(match_win / total_matches * 100, 1) if total_matches > 0 else None

        # Top-N maindeck cards sorted by inclusion rate
        top_cards = sorted(
            [c for c in cards if c.get("countMd", 0) > 0],
            key=lambda c: c.get("totalCount", c.get("countMd", 0)),
            reverse=True
        )[:top_n]

        top_cards_out = []
        for c in top_cards:
            count_md = c.get("countMd", 0) or c.get("totalCount", 0)
            inc_rate = round(count_md / deck_count * 100, 1) if deck_count > 0 else None
            top_cards_out.append({
                "cardId": c.get("cardId"),
                "inclusionRate": inc_rate,
                "countMd": count_md,
            })

        combos.append({
            "comboKey": combo_key,
            "leaderCardId": anchor.get("leaderCardId"),
            "baseCardId": anchor.get("baseCardId"),
            "deckCount": deck_count,
            "winRate": win_rate,
            "topCards": top_cards_out,
        })

    # Total decks = sum of deck counts (approximation; combos may overlap)
    total_decks = sum(c["deckCount"] for c in combos) if combos else 1
    if total_decks == 0:
        total_decks = 1

    for c in combos:
        c["metaShare"] = round(c["deckCount"] / total_decks * 100, 1)

    combos.sort(key=lambda c: (-c["deckCount"], -(c["winRate"] or 0)))

    return {
        "metaId": meta_id,
        "metaName": meta_entry["meta"]["name"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalDecks": total_decks,
        "combos": combos,
    }


# ---------------------------------------------------------------------------
# File writers
# ---------------------------------------------------------------------------

NOW_STR = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_json(out_dir: Path, name: str, data):
    p = out_dir / name
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {p}")
    return p


def write_md(out_dir: Path, name: str, content: str):
    p = out_dir / name
    p.write_text(content, encoding="utf-8")
    print(f"  wrote {p}")


# ---------------------------------------------------------------------------
# Markdown explainers
# ---------------------------------------------------------------------------

def md_metas(format_name: str, format_id: int, metas: list[dict], fetched_at: str) -> str:
    rows = "\n".join(
        f"| {e['meta']['id']} | {e['meta']['name']} | {e['meta']['set']} | {e['meta']['date']} | {e['meta']['season']} |"
        for e in metas
    )
    return f"""# metas.json — Meta List for {format_name}

## What this dataset is
A list of all recorded competitive metas for the **{format_name}** format (format id {format_id}) in the swubase.com database.

## Source
- **Endpoint:** `GET https://swubase.com/api/meta` (paginated)
- **Fetched at:** {fetched_at}

## Fields
| Field | Type | Meaning |
|---|---|---|
| `meta.id` | int | Unique meta identifier — used as `meta_id` in all other endpoints |
| `meta.set` | str | Set code (e.g. `law` = A Lawless Time) |
| `meta.name` | str | Human-readable meta label |
| `meta.format` | int | Format id (matches `format.id`) |
| `meta.date` | str | Date the meta was recorded (YYYY-MM-DD) |
| `meta.season` | int | Competitive season number |
| `format.id` | int | Format identifier |
| `format.name` | str | Format name (Premier / Eternal / Twin Suns / Sealed play …) |
| `format.description` | str | Short description of the format rules |

## Metas in this dataset
| id | name | set | date | season |
|---|---|---|---|---|
{rows}

## How to use for deckbuilding
Pick the **most recent** meta id (highest `meta.id` or latest `meta.date`) and use it as `meta_id` for `card-stats` and `top-played` queries. Older metas are useful for tracking meta evolution over time.
"""


def md_meta_detail(meta_entry: dict, fetched_at: str) -> str:
    m = meta_entry["meta"]
    f = meta_entry["format"]
    return f"""# meta-{m['id']}.json — Chosen Meta Detail

## What this dataset is
Detailed record for a single meta snapshot: **{m['name']}**.

## Source
- **Endpoint:** `GET https://swubase.com/api/meta/{m['id']}`
- **Fetched at:** {fetched_at}

## Fields
Same schema as individual entries in `metas.json` — see that file's explainer.

| Field | Value |
|---|---|
| `meta.id` | {m['id']} |
| `meta.name` | {m['name']} |
| `meta.set` | {m['set']} |
| `meta.date` | {m['date']} |
| `meta.season` | {m['season']} |
| `meta.format` | {m['format']} |
| `format.name` | {f['name']} |
| `format.description` | {f['description']} |
"""


def md_card_stats(meta_id: int, meta_name: str, fetched_at: str) -> str:
    return f"""# card-stats-{meta_id}.json — Overall Card Statistics

## What this dataset is
Per-card aggregate statistics across **all decks** recorded in meta **{meta_name}** (id {meta_id}).

## Source
- **Endpoint:** `GET https://swubase.com/api/card-stats?meta_id={meta_id}`
- **Fetched at:** {fetched_at}

## Fields
| Field | Type | Meaning |
|---|---|---|
| `cardId` | str | Unique card identifier (e.g. `SOR_001`) |
| `countMd` | int | Total copies of this card appearing in **maindecks** across all recorded decks |
| `countSb` | int | Total copies appearing in **sideboards** |
| `deckCount` | int | Number of distinct decks that include this card in the maindeck |
| `matchWin` | int | Total match wins recorded for decks containing this card |
| `matchLose` | int | Total match losses recorded for decks containing this card |

## Derived metrics
- **Win rate** = `matchWin / (matchWin + matchLose)` — express as percentage.
- **Average copies** = `countMd / deckCount` — how many copies per deck that plays the card.
- **Inclusion rate** (meta-wide) = `deckCount / <total decks in meta>`.

## Gotchas
- **Small sample size inflates win rates.** A card in only 3 decks that went 9-0 shows 100% — ignore win rates for `deckCount < 20`.
- This dataset covers ALL leader/base combinations. For archetype-specific analysis, prefer `top-played`.
- `countMd` and `countSb` count individual *copies*, not decks. A 4-of in 100 decks = `countMd = 400`.

## How to use for deckbuilding
1. Filter to `deckCount >= 20` to get statistically meaningful data.
2. Sort by `deckCount` descending for the most-played cards in the format.
3. Cross-reference win rate to identify cards correlated with winning.
"""


def md_top_played(meta_id: int, meta_name: str, limit: int, fetched_at: str) -> str:
    return f"""# top-played-{meta_id}.json — Top Played Cards by Leader/Base Combo

## What this dataset is
The top {limit} most-played maindeck cards for each leader (or leader+base) combination in meta **{meta_name}** (id {meta_id}).

## Source
- **Endpoint:** `GET https://swubase.com/api/card-stats/top-played?meta_id={meta_id}&limit={limit}`
- **Fetched at:** {fetched_at}

## Structure
The dataset is a **dictionary keyed by combo identifier** (e.g. a leader card id, or `"leaderId/baseId"`).
Each value is a list of card stat objects.

## Fields (per card entry)
| Field | Type | Meaning |
|---|---|---|
| `cardId` | str | Card identifier |
| `countMd` | int | Total maindeck copies across all decks in this combo |
| `countSb` | int | Total sideboard copies |
| `deckCount` | int | Decks in this combo that include this card |
| `matchWin` | int | Match wins for decks in this combo containing this card |
| `matchLose` | int | Match losses |
| `totalCount` | int | `countMd + countSb` total |
| `leaderCardId` | str? | Leader card id for this combo |
| `baseCardId` | str? | Base card id for this combo (may be absent) |

## Gotchas
- Same small-sample warning as `card-stats`: ignore win rates when `deckCount` is very low.
- `deckCount` here refers to decks within *this combo*, not the whole meta.

## How to use for deckbuilding
1. Look up your chosen leader/base combo key in this file.
2. Sort entries by `countMd / deckCount` (inclusion rate) to find the core cards.
3. Cards with inclusion rate ≥ 60% are near-staples for that archetype.
4. Cards with high inclusion AND high win rate are your priority pickups.
"""


def md_summary(meta_id: int, meta_name: str, summary: dict, fetched_at: str) -> str:
    # Tier table
    rows = []
    for i, c in enumerate(summary["combos"][:20], 1):
        wr = f"{c['winRate']}%" if c['winRate'] is not None else "N/A"
        leader = c.get("leaderCardId") or c["comboKey"]
        base = c.get("baseCardId") or ""
        rows.append(f"| {i} | {leader} | {base} | {c['deckCount']} | {c['metaShare']}% | {wr} |")

    table = "\n".join(rows)
    return f"""# summary-{meta_id}.json — Deckbuilding Summary

## What this dataset is
**The primary deckbuilding artifact.** Leader+base combos ranked by meta share, then win rate, for meta **{meta_name}** (id {meta_id}). Each combo includes its top played maindeck cards with inclusion rates.

## Source
- Derived from `card-stats-{meta_id}.json` and `top-played-{meta_id}.json`
- **Generated at:** {fetched_at}

## Fields
| Field | Type | Meaning |
|---|---|---|
| `metaId` | int | Meta identifier |
| `metaName` | str | Meta label |
| `generatedAt` | str | ISO timestamp of when this summary was built |
| `totalDecks` | int | Approximate total decks (sum of per-combo deck counts) |
| `combos[].comboKey` | str | The key used in the top-played API |
| `combos[].leaderCardId` | str? | Leader card id |
| `combos[].baseCardId` | str? | Base card id |
| `combos[].deckCount` | int | Number of recorded decks for this combo |
| `combos[].metaShare` | float | % of total decks this combo represents |
| `combos[].winRate` | float? | Win rate % (null if no match data) |
| `combos[].topCards[].cardId` | str | Card identifier |
| `combos[].topCards[].inclusionRate` | float? | % of decks in this combo playing this card |
| `combos[].topCards[].countMd` | int | Total maindeck copies |

## Tier table (top 20 combos)
| # | Leader | Base | Decks | Meta Share | Win Rate |
|---|---|---|---|---|---|
{table}

## Recommended deckbuilding workflow
1. **Read this summary first** — pick a combo from the tier table that fits your playstyle.
2. Open `top-played-{meta_id}.json` → find your combo key → sort cards by inclusion rate.
3. Cards with ≥ 60% inclusion are near-staples; ≥ 80% are almost certainly 3-4 ofs.
4. Cross-reference win rate: high inclusion + high win rate = prioritize in your build.
5. For budget or alternative lines, look at cards with moderate inclusion (30–60%) — these are flex slots.
"""


def md_readme(run_params: dict, out_dir_name: str, fetched_at: str) -> str:
    return f"""# swubase-dump — Star Wars: Unlimited Metagame Data

## Run parameters
| Parameter | Value |
|---|---|
| Format | {run_params['format']} (id {run_params['format_id']}) |
| Meta id | {run_params['meta_id']} |
| Meta name | {run_params['meta_name']} |
| Top-N limit | {run_params['limit']} |
| Fetched at | {fetched_at} |
| Output dir | {out_dir_name} |

## Data source
- **swubase.com** — open-source metagame tracker for Star Wars: Unlimited
- Backend repo: [the-medo/swu-collection](https://github.com/the-medo/swu-collection) (AGPL-3.0)
- SWU card data © Fantasy Flight Games / Lucasfilm Ltd.
- This dump is for **personal, read-only use** at low volume.

## Datasets
| File | Description |
|---|---|
| `metas.json` / `.md` | All metas for the chosen format |
| `meta-{run_params['meta_id']}.json` / `.md` | Detail for the selected meta |
| `card-stats-{run_params['meta_id']}.json` / `.md` | Per-card aggregate stats (all archetypes) |
| `top-played-{run_params['meta_id']}.json` / `.md` | Top cards per leader/base combo |
| `summary-{run_params['meta_id']}.json` / `.md` | **Start here** — combos ranked by meta share + win rate |

## Recommended deckbuilding workflow
1. Open **`summary-{run_params['meta_id']}.md`** — read the tier table to pick your archetype.
2. Open **`top-played-{run_params['meta_id']}.md`** — find your combo and read inclusion rates.
3. Cards with ≥ 60% inclusion are near-staples; high inclusion + high win rate = priority crafts.
4. Use **`card-stats-{run_params['meta_id']}.json`** for format-wide card power rankings.

## Usage examples
```bash
# Dump latest Eternal meta (default)
python swubase_dump.py --format Eternal

# Specific meta id
python swubase_dump.py --format Eternal --meta 14

# Premier format, custom output dir
python swubase_dump.py --format Premier --out ./swubase-premier

# Force refresh (ignore cache)
python swubase_dump.py --format Eternal --no-cache

# Include matchup data (fetches additional endpoints)
python swubase_dump.py --format Eternal --matchups

# Top 30 cards per combo
python swubase_dump.py --format Eternal --limit 30
```
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Dump Star Wars: Unlimited metagame data from swubase.com"
    )
    parser.add_argument("--format", default="Eternal", help="Format name or id (default: Eternal)")
    parser.add_argument("--meta", type=int, default=None, help="Meta id (default: latest for format)")
    parser.add_argument("--out", default="./swubase-dump", help="Output directory (default: ./swubase-dump)")
    parser.add_argument("--limit", type=int, default=20, help="Top-played cards per combo (default: 20)")
    parser.add_argument("--matchups", action="store_true", help="Also fetch matchup data (experimental)")
    parser.add_argument("--no-cache", action="store_true", help="Force refresh, ignore cached responses")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    fetched_at = NOW_STR

    print(f"\n=== swubase_dump.py  [{fetched_at}] ===\n")

    # 1. List all metas
    print("[1/5] Fetching meta list…")
    all_metas = list_all_metas(out_dir, args.no_cache)

    # 2. Resolve format + pick meta
    format_id, format_name = resolve_format(all_metas, args.format)
    print(f"      Format: {format_name} (id {format_id})")
    chosen = pick_meta(all_metas, format_id, args.meta)
    meta_id = chosen["meta"]["id"]
    meta_name = chosen["meta"]["name"]
    print(f"      Meta:   {meta_name} (id {meta_id})\n")

    # 3. Filter metas to chosen format and write
    format_metas = [e for e in all_metas if e.get("meta", {}).get("format") == format_id]
    print("[2/5] Writing metas…")
    write_json(out_dir, "metas.json", format_metas)
    write_md(out_dir, "metas.md", md_metas(format_name, format_id, format_metas, fetched_at))

    # 4. Write chosen meta detail
    print("[3/5] Fetching meta detail…")
    meta_detail = get_meta(out_dir, meta_id, args.no_cache)
    write_json(out_dir, f"meta-{meta_id}.json", meta_detail)
    write_md(out_dir, f"meta-{meta_id}.md", md_meta_detail(meta_detail, fetched_at))

    # 5. Card stats
    print("[4/5] Fetching card stats…")
    card_stats = get_card_stats(out_dir, meta_id, args.no_cache)
    write_json(out_dir, f"card-stats-{meta_id}.json", card_stats)
    write_md(out_dir, f"card-stats-{meta_id}.md", md_card_stats(meta_id, meta_name, fetched_at))

    # 6. Top played
    print("[5/5] Fetching top-played cards…")
    top_played = get_top_played(out_dir, meta_id, args.limit, args.no_cache)
    write_json(out_dir, f"top-played-{meta_id}.json", top_played)
    write_md(out_dir, f"top-played-{meta_id}.md", md_top_played(meta_id, meta_name, args.limit, fetched_at))

    # 7. Matchups (optional)
    if args.matchups:
        print("[+] Fetching matchup data…")
        try:
            matchup_resp = cached_fetch(
                out_dir, f"matchups_{meta_id}",
                "matchup-stats", {"meta_id": meta_id}, args.no_cache
            )
            write_json(out_dir, f"matchups-{meta_id}.json", matchup_resp)
            write_md(out_dir, f"matchups-{meta_id}.md",
                f"# matchups-{meta_id}.json\n\nMatchup statistics for meta {meta_name} (id {meta_id}).\nFetched at: {fetched_at}\n\nSee the swubase.com documentation for field definitions.\n")
        except urllib.error.HTTPError as e:
            print(f"  [warn] Matchup endpoint returned {e.code} — skipping. "
                  "The endpoint path may differ; check the repo hooks at "
                  "https://raw.githubusercontent.com/the-medo/swu-collection/main/frontend/src/api/")

    # 8. Summary
    print("\n[+] Building deckbuilding summary…")
    summary = build_summary(meta_detail, card_stats, top_played, args.limit)
    write_json(out_dir, f"summary-{meta_id}.json", summary)
    run_params = {
        "format": format_name, "format_id": format_id,
        "meta_id": meta_id, "meta_name": meta_name, "limit": args.limit,
    }
    write_md(out_dir, f"summary-{meta_id}.md", md_summary(meta_id, meta_name, summary, fetched_at))

    # 9. README
    write_md(out_dir, "README.md", md_readme(run_params, out_dir.name, fetched_at))

    # 10. Stdout summary: top 5 combos
    print(f"\n{'='*60}")
    print(f"  Meta: {meta_name}  |  Format: {format_name}")
    print(f"{'='*60}")
    print(f"  {'#':<3} {'Leader/Base':<40} {'Decks':>6} {'Share':>7} {'WR':>7}")
    print(f"  {'-'*3} {'-'*40} {'-'*6} {'-'*7} {'-'*7}")
    for i, c in enumerate(summary["combos"][:5], 1):
        label = c.get("leaderCardId") or c["comboKey"]
        if c.get("baseCardId"):
            label += f" / {c['baseCardId']}"
        wr = f"{c['winRate']}%" if c['winRate'] is not None else "N/A"
        print(f"  {i:<3} {label:<40} {c['deckCount']:>6} {c['metaShare']:>6}% {wr:>7}")
    print(f"\n  Full summary -> {out_dir / f'summary-{meta_id}.md'}")
    print(f"  All files    -> {out_dir}\n")


if __name__ == "__main__":
    main()
