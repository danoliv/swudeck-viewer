/**
 * scripts/fetch-swubase.js — fetch per-leader card stats from swubase.com
 * Data source: swubase.com (unofficial fan project; SWU data © FFG/LFL)
 * Backend: github.com/the-medo/swu-collection (AGPL-3.0)
 * Read-only, low-volume personal use. No auth required.
 *
 * Writes public/data/stats/{LEADER_ID}.json for each leader with ≥50 decks.
 * Run: npm run fetch-swubase
 */

'use strict';

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://swubase.com/api';
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const TOP_PLAYED_LIMIT = 100;
const MIN_DECK_COUNT = 50;
const LEADER_BATCH_SIZE = 30; // keep URLs well under limits

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(urlPath, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const url = `${BASE_URL}/${urlPath}${qs ? '?' + qs : ''}`;
  console.log(`  GET ${url.substring(0, 120)}${url.length > 120 ? '…' : ''}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'swudeck-viewer/1.0 (github.com/danoliv/swudeck-viewer; weekly stats fetch)',
            Referer: 'https://swubase.com/',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 404) return resolve({ status: 404 });
            if (res.statusCode !== 200)
              return resolve({ status: res.statusCode, retry: res.statusCode >= 500 });
            try {
              resolve({ status: 200, data: JSON.parse(data) });
            } catch (e) {
              reject(new Error(`JSON parse error for ${url}: ${e.message}`));
            }
          });
        },
      );
      req.on('error', (err) => resolve({ status: 0, retry: true, error: err }));
    });

    if (result.status === 200) return result.data;
    if (result.status === 404) return null;
    if (result.retry && attempt < MAX_RETRIES) {
      console.warn(`  [warn] HTTP ${result.status}, retrying (${attempt}/${MAX_RETRIES})…`);
      await delay(1000 * attempt);
      continue;
    }
    throw new Error(`HTTP ${result.status} for ${url} after ${attempt} attempt(s)`);
  }
}

async function listAllMetas() {
  const all = [];
  let offset = 0;
  while (true) {
    const resp = await fetchJSON('meta', { limit: 50, offset, order: 'desc' });
    if (!resp?.data) break;
    all.push(...resp.data);
    if (!resp.pagination?.hasMore) break;
    offset += 50;
    await delay(REQUEST_DELAY_MS);
  }
  return all;
}

function resolveFormatIds(metas) {
  const map = {};
  for (const m of metas) {
    const name = m.format?.name?.toLowerCase();
    const id = m.format?.id;
    if (name && id !== undefined && !(name in map)) map[name] = id;
  }
  console.log(`  Known formats: ${Object.entries(map).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  return { premier: map['premier'], eternal: map['eternal'] };
}

function latestMeta(metas, formatId) {
  return (
    metas
      .filter((m) => m.meta?.format === formatId)
      .sort((a, b) => b.meta.date.localeCompare(a.meta.date))[0] ?? null
  );
}

// swubase slugifies card names with these rules
function slugify(name) {
  let s = name.toLowerCase();
  s = s.replace(/\s*[:/]{1,2}\s*/g, '--'); // : and // → --
  s = s.replace(/[^a-z0-9\s-]/g, '-');     // non-alphanum → -
  s = s.replace(/\s+/g, '-');              // spaces → -
  s = s.replace(/-{3,}/g, '--');           // 3+ hyphens → --
  s = s.replace(/-+$/, '');               // strip trailing hyphens
  return s;
}

// api.swu-db.com has a few card-name typos that don't match swubase's slugs
// (which are derived from the correct name). Override by SET_NUM here rather
// than touching public/data/*.json, since that gets overwritten by `npm run
// fetch-sets`.
const SLUG_OVERRIDES = {
  LAW_014: 'enfys-nest--until-we-can-go-no-higher', // api.swu-db.com: "Enfy Nest" (missing the "s")
};

// Build bidirectional slug ↔ SET_NUM maps from all local card data.
// Leaders are also indexed so we can pass their slugs as leader_ids.
async function buildSlugMaps() {
  const setsJson = require('../src/lib/sets.json');
  const slugToId = {}; // slug → SET_NUM
  const leaderSlugToId = {}; // slug → SET_NUM (leaders only)
  const leaderIdToSlug = {}; // SET_NUM → slug (leaders only)

  for (const setCode of setsJson) {
    const filePath = path.join(__dirname, '..', 'public', 'data', `${setCode.toLowerCase()}.json`);
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
      for (const card of raw.data ?? []) {
        if (card.VariantType && card.VariantType !== 'Normal') continue;

        const num = String(card.Number ?? '').trim();
        const match = num.match(/^(\d+)([A-Za-z]*)$/);
        if (!match) continue;
        const id = `${setCode}_${match[1].padStart(3, '0')}${match[2].toUpperCase()}`;

        const name = card.Name ?? '';
        const subtitle = card.Subtitle ?? '';
        const fullName = subtitle ? `${name} // ${subtitle}` : name;
        const slug = SLUG_OVERRIDES[id] ?? slugify(fullName);

        if (!slugToId[slug]) slugToId[slug] = id;

        if (card.Type === 'Leader') {
          if (!leaderSlugToId[slug]) leaderSlugToId[slug] = id;
          if (!leaderIdToSlug[id]) leaderIdToSlug[id] = slug;
        }
      }
    } catch {
      console.warn(`  [warn] Could not load set ${setCode}`);
    }
  }

  // leaderSlugToId is the fast reverse-lookup needed in processFormat
  return { slugToId, leaderSlugToId, leaderIdToSlug }; // eslint-disable-line no-unused-vars
}

// Fetch top-played for a batch of leader slugs, returning a flat map of
// leaderSlug → { deckCount, cards: { cardSlug → {deckCount,matchWin,matchLose} } }
async function fetchLeaderBatch(metaId, leaderSlugs) {
  const resp = await fetchJSON('card-stats/top-played', {
    meta_id: metaId,
    leader_ids: leaderSlugs.join(','),
    limit: TOP_PLAYED_LIMIT,
  });
  return resp?.data ?? {};
}

async function processFormat(formatKey, meta, leaderIdToSlug, leaderSlugToId, slugToId) {
  const metaId = meta.meta.id;
  const metaName = meta.meta.name;
  console.log(`\n  Format: ${formatKey} — meta "${metaName}" (id ${metaId})`);

  const leaderSlugs = Object.values(leaderIdToSlug);
  const chunks = [];
  for (let i = 0; i < leaderSlugs.length; i += LEADER_BATCH_SIZE) {
    chunks.push(leaderSlugs.slice(i, i + LEADER_BATCH_SIZE));
  }
  console.log(`  Fetching ${leaderSlugs.length} leaders in ${chunks.length} batches…`);

  const results = {}; // leaderId (SET_NUM) → FormatStats

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await delay(REQUEST_DELAY_MS);
    const batchData = await fetchLeaderBatch(metaId, chunks[i]);

    for (const [leaderSlug, cards] of Object.entries(batchData)) {
      if (!Array.isArray(cards) || !cards.length) continue;

      const leaderSetNum = leaderSlugToId[leaderSlug];
      if (!leaderSetNum) continue;

      const leaderDeckCount = Math.max(...cards.map((c) => c.deckCount ?? 0));
      if (leaderDeckCount < 1) continue;

      const cardStats = {};
      for (const card of cards) {
        const { cardId: cardSlug, deckCount, matchWin, matchLose } = card;
        if (!cardSlug) continue;

        const cardSetNum = slugToId[cardSlug];
        if (!cardSetNum) continue; // unmapped card (shouldn't happen)

        const totalMatches = (matchWin ?? 0) + (matchLose ?? 0);
        cardStats[cardSetNum] = {
          deckCount,
          winRate: totalMatches > 0 ? Math.round((matchWin / totalMatches) * 1000) / 10 : 0,
          inclusionRate:
            leaderDeckCount > 0 ? Math.round((deckCount / leaderDeckCount) * 1000) / 10 : 0,
        };
      }

      results[leaderSetNum] = { metaId, metaName, deckCount: leaderDeckCount, cards: cardStats };
    }
  }

  const found = Object.values(results).filter((r) => r.deckCount >= 1).length;
  console.log(`  ${found} leaders with data, ${Object.values(results).filter((r) => r.deckCount >= MIN_DECK_COUNT).length} with ≥${MIN_DECK_COUNT} decks`);
  return results;
}

/**
 * Aggregate leader-level popularity/win rate for a meta from its tournament
 * listing (`/api/tournament`) — one (typically winning) deck per tournament.
 * This is a smaller, top-placement-only sample, not the full decks-submitted
 * dataset behind swubase's own "Meta Analysis" chart (no public endpoint for
 * that was found), but it's a real, representative signal of what's actually
 * being played and winning.
 */
async function fetchLeaderMetaStats(meta, leaderSlugToId) {
  const formatId = meta.format.id;
  const metaId = meta.meta.id;
  const perLeader = {}; // leaderId (SET_NUM) → { deckCount, wins, losses }
  let offset = 0;
  let totalDecks = 0;

  while (true) {
    const resp = await fetchJSON('tournament', {
      minType: 200,
      format: formatId,
      maxDate: new Date().toISOString().slice(0, 10),
      meta: metaId,
      sort: 'tournament.date',
      order: 'desc',
      limit: 250,
      offset,
    });
    if (!resp?.data) break;

    for (const entry of resp.data) {
      for (const { deck, tournamentDeck } of entry.decks ?? []) {
        const leaderId = leaderSlugToId[deck.leaderCardId1];
        if (!leaderId) continue;

        const bucket = (perLeader[leaderId] ??= { deckCount: 0, wins: 0, losses: 0 });
        bucket.deckCount += 1;
        bucket.wins += tournamentDeck.recordWin ?? 0;
        bucket.losses += tournamentDeck.recordLose ?? 0;
        totalDecks += 1;
      }
    }

    if (!resp.pagination?.hasMore) break;
    offset += 250;
    await delay(REQUEST_DELAY_MS);
  }

  const leaders = {};
  for (const [leaderId, { deckCount, wins, losses }] of Object.entries(perLeader)) {
    const totalMatches = wins + losses;
    leaders[leaderId] = {
      deckCount,
      popularity: totalDecks > 0 ? Math.round((deckCount / totalDecks) * 1000) / 10 : 0,
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0,
    };
  }
  return { totalDecks, leaders };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'public', 'data', 'stats');
  await fs.mkdir(outDir, { recursive: true });
  for (const f of await fs.readdir(outDir)) {
    if (f.endsWith('.json')) await fs.unlink(path.join(outDir, f));
  }

  console.log('\n=== fetch-swubase.js ===\n');

  console.log('[1/4] Fetching meta list…');
  const metas = await listAllMetas();
  const formatIds = resolveFormatIds(metas);

  console.log('\n[2/4] Building slug maps from local card data…');
  const { slugToId, leaderSlugToId, leaderIdToSlug } = await buildSlugMaps();
  console.log(`  ${Object.keys(leaderIdToSlug).length} leaders, ${Object.keys(slugToId).length} total cards mapped`);

  console.log('\n[3/5] Fetching top-played data…');
  const allResults = {}; // leaderId → { premier?, eternal? }
  const metaByFormat = {}; // formatKey → meta (reused for leader-meta-stats below)

  for (const [formatKey, formatId] of [
    ['premier', formatIds.premier],
    ['eternal', formatIds.eternal],
  ]) {
    if (!formatId) { console.log(`  [skip] No format ID for ${formatKey}`); continue; }
    const meta = latestMeta(metas, formatId);
    if (!meta) { console.log(`  [skip] No meta for ${formatKey}`); continue; }
    metaByFormat[formatKey] = meta;

    const perLeader = await processFormat(formatKey, meta, leaderIdToSlug, leaderSlugToId, slugToId);
    for (const [leaderId, stats] of Object.entries(perLeader)) {
      if (!allResults[leaderId]) allResults[leaderId] = {};
      allResults[leaderId][formatKey] = stats;
    }
  }

  console.log('\n[4/5] Fetching leader popularity/win rate…');
  const leaderStatsOut = { generatedAt: new Date().toISOString() };
  for (const [formatKey, meta] of Object.entries(metaByFormat)) {
    await delay(REQUEST_DELAY_MS);
    const { totalDecks, leaders } = await fetchLeaderMetaStats(meta, leaderSlugToId);
    console.log(`  ${formatKey}: ${totalDecks} decks, ${Object.keys(leaders).length} leaders`);
    leaderStatsOut[formatKey] = { totalDecks, leaders };
  }
  await fs.writeFile(
    path.join(__dirname, '..', 'public', 'data', 'stats', 'leader-stats.json'),
    JSON.stringify(leaderStatsOut, null, 2),
  );

  console.log('\n[5/5] Writing per-leader files…');
  const generatedAt = new Date().toISOString();
  let written = 0;
  let skipped = 0;

  for (const [leaderId, formats] of Object.entries(allResults)) {
    const output = { generatedAt, leaderId };
    if (formats.premier?.deckCount >= MIN_DECK_COUNT) output.premier = formats.premier;
    if (formats.eternal?.deckCount >= MIN_DECK_COUNT) output.eternal = formats.eternal;

    if (!output.premier && !output.eternal) { skipped++; continue; }

    await fs.writeFile(path.join(outDir, `${leaderId}.json`), JSON.stringify(output, null, 2));
    written++;
  }

  console.log(`  Written: ${written}  Skipped (<${MIN_DECK_COUNT} decks): ${skipped}`);
  console.log(`\nDone! Files in: ${outDir}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
