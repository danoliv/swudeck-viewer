/**
 * src/lib/cards.ts
 * Card data loading, caching, and HTML rendering.
 * Centralises all card rendering so index and compare pages stay visually consistent.
 */

import { loadSets } from './sets';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardData {
  id?: string;
  Number?: string | number;
  Name?: string;
  Type?: string;
  Aspects?: string[];
  Traits?: string[];
  Arenas?: string[];
  Cost?: string | number;
  Power?: string | number;
  HP?: string | number;
  FrontArt?: string;
  BackArt?: string;
  DoubleSided?: boolean;
  Set?: string;
  [key: string]: unknown;
}

type SetIndex = Record<string, CardData>;

function normalizeCardNumberToken(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const match = raw.match(/^(0*)(\d+)([A-Z]+)?$/i);
  if (!match) return raw;

  const [, , digits, suffix = ''] = match;
  return `${String(parseInt(digits, 10))}${suffix.toUpperCase()}`;
}

function buildLookupKeys(value: string | number | undefined): string[] {
  if (value === undefined || value === null) return [];

  const raw = String(value).trim();
  if (!raw) return [];

  const normalized = normalizeCardNumberToken(raw);
  const baseRaw = raw.replace(/[A-Z]+$/i, '');
  const normalizedBase = normalizeCardNumberToken(baseRaw);

  return [...new Set([raw, normalized, normalizedBase].filter((key): key is string => Boolean(key)))];
}

export function resolveCardArtUrl(artUrl: string | undefined | null): string | undefined {
  if (!artUrl) return undefined;

  return artUrl.replace(/\/(\d+)F(\.[a-z0-9]+(?:\?.*)?)$/i, '/$1$2');
}

// ─── Internal cache ───────────────────────────────────────────────────────────

const cardSets: Partial<Record<string, SetIndex>> = {};
const loadingPromises: Partial<Record<string, Promise<SetIndex>>> = {};

// ─── loadCardSet ──────────────────────────────────────────────────────────────

/**
 * Fetch and cache a set's card JSON. Returns an object indexed by card number.
 * Subsequent calls with the same set return the cached result without a network request.
 */
export async function loadCardSet(set: string): Promise<SetIndex> {
  if (cardSets[set]) return cardSets[set];
  if (loadingPromises[set]) return loadingPromises[set];

  loadingPromises[set] = (async (): Promise<SetIndex> => {
    try {
      console.log(`Loading set ${set}...`);
      const response = await fetch(`data/${set.toLowerCase()}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${set} data: ${response.status}`);
      }
      const data = (await response.json()) as { data: CardData[] };
      const cards = data.data;
      if (!Array.isArray(cards)) {
        throw new Error(`Invalid data format for set ${set}: expected array in data property`);
      }

      console.log(`Successfully loaded set ${set} with ${cards.length} cards`);

      const index: SetIndex = {};
      for (const card of cards) {
        if (card.Number !== undefined) {
          const exactNumber = String(card.Number).trim();
          if (!exactNumber) continue;

          index[exactNumber] = card;

          const normalizedNumber = normalizeCardNumberToken(exactNumber);
          if (normalizedNumber && !(normalizedNumber in index)) {
            index[normalizedNumber] = card;
          }
        }
      }
      cardSets[set] = index;
      return index;
    } catch (error) {
      console.error(`Error loading set ${set}:`, error);
      delete cardSets[set];
      throw error;
    } finally {
      delete loadingPromises[set];
    }
  })();

  return loadingPromises[set];
}

// ─── preloadSets ──────────────────────────────────────────────────────────────

/** Preload all known sets in parallel. */
export async function preloadSets(): Promise<void> {
  try {
    await Promise.all(loadSets().map((set) => loadCardSet(set)));
    console.log('All sets preloaded successfully');
  } catch (error) {
    console.error('Error preloading sets:', error);
  }
}

// ─── fetchCardData ────────────────────────────────────────────────────────────

/**
 * Look up a card by its compound ID (e.g. `SOR_001`).
 * Returns a stub object if the card is not found or on fetch errors.
 */
export async function fetchCardData(cardId: string): Promise<CardData> {
  const [set, num] = cardId.split('_');
  const lookupKeys = buildLookupKeys(num);

  try {
    const setData = await loadCardSet(set);
    if (!setData) throw new Error(`Set ${set} not found`);

    const cardData = lookupKeys.map((key) => setData[key]).find(Boolean);
    if (!cardData) {
      console.warn(`Card ${cardId} not found in set ${set}`);
      return { id: cardId, Name: cardId, Set: set, Number: num, Type: 'Unknown' };
    }

    cardData.id = cardId;
    if (!cardData.Type) cardData.Type = 'Unknown';
    return cardData;
  } catch (error) {
    console.error(`Error fetching card ${cardId}:`, error);
    return { id: cardId, Name: cardId, Set: set, Number: num, Type: 'Unknown' };
  }
}

// ─── clearCardCache ───────────────────────────────────────────────────────────

/** Clear all in-memory card caches (sets data + pending promises). */
export function clearCardCache(): void {
  for (const k of Object.keys(cardSets)) delete cardSets[k];
  for (const k of Object.keys(loadingPromises)) delete loadingPromises[k];
}

// ─── buildCardHTML ────────────────────────────────────────────────────────────

/**
 * Render a deck-viewer card as an HTML string.
 */
export function buildCardHTML(
  cardId: string,
  cardData: CardData = {},
  count = 1,
  sideboardCount = 0,
  additionalClasses = '',
): string {
  const aspects: string[] = (cardData.Aspects as string[]) ?? [];
  const stats: [string, unknown][] = [];
  if (cardData.Cost !== undefined) stats.push(['Cost', cardData.Cost]);
  if (cardData.Power !== undefined) stats.push(['Power', cardData.Power]);
  if (cardData.HP !== undefined) stats.push(['HP', cardData.HP]);

  const formattedId = cardId.replace('_', ' ');
  const isDoubleSided = cardData.DoubleSided === true;
  const frontArt = resolveCardArtUrl(cardData.FrontArt);
  const backArt = resolveCardArtUrl(cardData.BackArt);

  let countText = '';
  if (count > 0 && sideboardCount > 0) {
    countText = `Deck: ${count} | Side: ${sideboardCount}`;
  } else if (count > 0) {
    countText = `Deck: ${count}`;
  } else if (sideboardCount > 0) {
    countText = `Side: ${sideboardCount}`;
  }

  return `
        <div class="card ${additionalClasses}" 
            onclick="this.classList.toggle('selected')" 
            data-card-id="${formattedId}">
            <div class="card-id">
                <span>${formattedId}</span>
                ${isDoubleSided ? '<button class="flip-button" onclick="event.stopPropagation(); this.closest(\'.card\').classList.toggle(\'flipped\')">Flip Card</button>' : ''}
            </div>
            ${countText ? `<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${countText}</div>` : ''}
            <div class="card-name">${cardData.Name ?? cardId}</div>
            ${aspects.length ? `
                <div class="aspects">
                    ${aspects.map((aspect) => `
                        <span class="aspect ${aspect}">${aspect}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${frontArt
                          ? `<img src="${frontArt}" alt="${cardData.Name ?? cardId} (Front)">`
                          : `<div class="card-placeholder">${cardId}</div>`}
                    </div>
                    ${isDoubleSided && backArt ? `
                        <div class="card-back">
                            <img src="${backArt}" alt="${cardData.Name ?? cardId} (Back)">
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="card-content">
                ${stats.length ? `
                    <div class="card-stats">
                        ${stats.map(([label, value]) => `
                            <span class="stat" data-type="${label}">${label}: <span class="stat-value">${value}</span></span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ─── buildComparisonCardHTML ──────────────────────────────────────────────────

/**
 * Render a comparison-page card as an HTML string showing counts from both decks.
 */
export function buildComparisonCardHTML(
  cardId: string,
  cardData: CardData = {},
  count1 = 0,
  count2 = 0,
  comparisonType = '',
  deck1Name = 'Deck 1',
  deck2Name = 'Deck 2',
  sideboard1 = 0,
  sideboard2 = 0,
): string {
  const aspects: string[] = (cardData.Aspects as string[]) ?? [];
  const stats: [string, unknown][] = [];
  if (cardData.Cost !== undefined) stats.push(['Cost', cardData.Cost]);
  if (cardData.Power !== undefined) stats.push(['Power', cardData.Power]);
  if (cardData.HP !== undefined) stats.push(['HP', cardData.HP]);

  const formattedId = cardId.replace('_', ' ');
  const isDoubleSided = cardData.DoubleSided === true;
  const frontArt = resolveCardArtUrl(cardData.FrontArt);
  const backArt = resolveCardArtUrl(cardData.BackArt);

  const total1 = count1 + sideboard1;
  const total2 = count2 + sideboard2;
  let countText = '';

  if (total1 > 0 && total2 > 0) {
    let d1 = `${deck1Name}: ${count1}`;
    if (sideboard1 > 0) d1 += ` (${sideboard1} side)`;
    let d2 = `${deck2Name}: ${count2}`;
    if (sideboard2 > 0) d2 += ` (${sideboard2} side)`;
    countText = `${d1} | ${d2}`;
  } else if (total1 > 0) {
    countText = `${deck1Name}: ${count1}`;
    if (sideboard1 > 0) countText += ` (${sideboard1} side)`;
  } else if (total2 > 0) {
    countText = `${deck2Name}: ${count2}`;
    if (sideboard2 > 0) countText += ` (${sideboard2} side)`;
  }

  return `
        <div class="card ${comparisonType}">
            <div class="card-id">
                <span>${formattedId}</span>
                ${isDoubleSided ? '<button class="flip-button" onclick="event.stopPropagation(); this.closest(\'.card\').classList.toggle(\'flipped\')">Flip Card</button>' : ''}
            </div>
            ${countText ? `<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${countText}</div>` : ''}
            <div class="card-name">${cardData.Name ?? cardId}</div>
            ${aspects.length ? `
                <div class="aspects">
                    ${aspects.map((aspect) => `
                        <span class="aspect ${aspect}">${aspect}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${frontArt
                          ? `<img src="${frontArt}" alt="${cardData.Name ?? cardId} (Front)">`
                          : `<div class="card-placeholder">${cardId}</div>`}
                    </div>
                    ${isDoubleSided && backArt ? `
                        <div class="card-back">
                            <img src="${backArt}" alt="${cardData.Name ?? cardId} (Back)">
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="card-content">
                ${stats.length ? `
                    <div class="card-stats">
                        ${stats.map(([label, value]) => `
                            <span class="stat" data-type="${label}">${label}: <span class="stat-value">${value}</span></span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ─── Auto-preload in browser ──────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  preloadSets();
}

