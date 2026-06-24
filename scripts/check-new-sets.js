/**
 * scripts/check-new-sets.js — detect newly released SWU sets and add them.
 * Data source: api.swu-db.com (public, no auth required).
 *
 * Fetches the full set catalog from api.swu-db.com, filters out non-expansion
 * products (promos, judge cards, store showdown, conventions, gift boxes,
 * Gamegenic), and appends any set codes missing from src/lib/sets.json,
 * ordered by release date. Does not fetch card data itself — run
 * `npm run fetch-sets` afterward to pull cards for newly added sets.
 *
 * Run: npm run check-new-sets
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const SETS_JSON_PATH = path.join(__dirname, '..', 'src', 'lib', 'sets.json');

// Non-expansion products that share the top-level (no parentSetId) shape
// but aren't real card sets we want to track.
const EXCLUDE_NAME_PATTERN = /promo|judge|showdown|convention|gift box|gamegenic/i;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function isExpansionSet(entry) {
  if (entry.parentSetId) return false;
  if (!entry.releaseDate) return false;
  if (EXCLUDE_NAME_PATTERN.test(entry.fullName ?? '')) return false;
  return true;
}

function parseReleaseDate(dateStr) {
  // Format: "M/D/YY"
  const [m, d, y] = dateStr.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function readSetsJson() {
  return JSON.parse(fs.readFileSync(SETS_JSON_PATH, 'utf8'));
}

function writeSetsJson(setCodes) {
  fs.writeFileSync(SETS_JSON_PATH, JSON.stringify(setCodes, null, 2) + '\n');
}

// Merge newly discovered sets into the existing list, keeping everything
// ordered by release date ascending.
function mergeSets(existingCodes, allEntries) {
  const byCode = new Map(allEntries.map((e) => [e.setId, e]));
  const existingSet = new Set(existingCodes);
  const newCodes = allEntries
    .filter((e) => isExpansionSet(e) && !existingSet.has(e.setId))
    .map((e) => e.setId);

  if (newCodes.length === 0) return { merged: existingCodes, added: [] };

  const merged = [...existingCodes, ...newCodes].sort((a, b) => {
    const da = byCode.get(a)?.releaseDate;
    const db = byCode.get(b)?.releaseDate;
    if (!da || !db) return 0;
    return parseReleaseDate(da) - parseReleaseDate(db);
  });

  return { merged, added: newCodes };
}

async function main() {
  console.log('Fetching set catalog from api.swu-db.com…');
  const allEntries = await fetchJSON('https://api.swu-db.com/sets');

  const existingCodes = readSetsJson();
  const { merged, added } = mergeSets(existingCodes, allEntries);

  if (added.length === 0) {
    console.log('No new sets found.');
    return;
  }

  console.log(`New set(s) found: ${added.join(', ')}`);
  writeSetsJson(merged);
  console.log(`Updated ${SETS_JSON_PATH}`);
  console.log('Run `npm run fetch-sets` to pull card data for the new set(s).');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = { isExpansionSet, mergeSets, parseReleaseDate };
