/**
 * src/lib/cards.ts
 * Card data loading, caching, and HTML rendering.
 * Centralises all card rendering so index and compare pages stay visually consistent.
 */

import { loadSets } from './sets';
import type { CardStats } from './stats';

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

/**
 * Build a canonical "SET_NNN" card ID from a set code and a raw `Number`
 * field value, zero-padding the numeric portion to 3 digits (e.g. "82" -> "082").
 * Used to assign stable IDs to cards loaded for the deck builder's card pool.
 */
export function formatCardId(set: string, number: string | number): string {
  const raw = String(number).trim();
  const match = raw.match(/^(\d+)([A-Za-z]*)$/);
  if (!match) return `${set}_${raw}`;

  const [, digits, suffix] = match;
  return `${set}_${digits.padStart(3, '0')}${suffix.toUpperCase()}`;
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

// ─── Row helpers ──────────────────────────────────────────────────────────────

function statsBarsHTML(stats: CardStats | null | undefined): string {
  if (!stats) return '';
  const incl = Math.min(100, Math.max(0, stats.inclusionRate));
  const wr = Math.min(100, Math.max(0, stats.winRate));
  // Each bar owns half the row. 100% reaches the center; bars never touch or overlap.
  const blueEnd = (incl * 0.5).toFixed(1);
  const orangeStart = (100 - wr * 0.5).toFixed(1);
  const bg = `linear-gradient(to right,rgba(59,130,246,.15) ${blueEnd}%,transparent ${blueEnd}% ${orangeStart}%,rgba(249,115,22,.15) ${orangeStart}%)`;
  return `<div class="stats-bars" style="background:${bg}" aria-hidden="true"></div>`;
}

function statsLabelsHTML(stats: CardStats | null | undefined): string {
  if (!stats) return '';
  return `<div class="stats-labels" aria-hidden="true"><span class="stats-label-incl" title="Inclusion rate">${Math.round(stats.inclusionRate)}%</span><span class="stats-label-wr" title="Win rate">${Math.round(stats.winRate)}%</span></div>`;
}

/** 0/1/2/3 segmented quantity control, dispatching `data-action` with the chosen count. */
function quantityButtonsHTML(cardId: string, count: number, action: string, label: string): string {
  return `
                <div class="quantity-buttons" role="group" aria-label="${label}">
                    ${[0, 1, 2, 3].map((n) => `
                        <button type="button" data-action="${action}" data-card-id="${cardId}" data-count="${n}" class="quantity-button${count === n ? ' active' : ''}">${n}</button>
                    `).join('')}
                </div>`;
}

/** Shared id/name/aspect-icons/cost markup used by both row layouts. */
function cardRowDetailsHTML(cardId: string, cardData: CardData, zone: string, stats?: CardStats | null): string {
  const aspects: string[] = (cardData.Aspects as string[]) ?? [];
  const formattedId = cardId.replace('_', ' ');

  return `
            <div class="card-row-id">${formattedId}</div>
            <button type="button" class="card-row-name" data-action="toggle-detail" data-card-id="${cardId}" data-zone="${zone}">${cardData.Name ?? cardId}</button>
            ${statsLabelsHTML(stats)}
            ${aspects.length ? `
                <div class="card-row-aspects">
                    ${aspects.map((aspect) => `<span class="aspect-icon-mini aspect-icon-${aspect}" title="${aspect}"></span>`).join('')}
                </div>
            ` : ''}
            ${cardData.Cost !== undefined ? `<span class="stat card-row-cost" data-type="Cost"><span class="stat-value">${cardData.Cost}</span></span>` : ''}`;
}

// ─── buildCardDetailHTML ──────────────────────────────────────────────────────

/**
 * Render an inline card-detail panel: full card image (with a flip button for
 * double-sided cards), stats, aspects, type/arena/traits, ability text, and
 * artist credit. A smaller, integrated version of swudb.com's card-detail page
 * — shown below a card row when its name is clicked.
 */
export function buildCardDetailHTML(cardId: string, cardData: CardData = {}): string {
  const aspects: string[] = (cardData.Aspects as string[]) ?? [];
  const traits: string[] = (cardData.Traits as string[]) ?? [];
  const arenas: string[] = (cardData.Arenas as string[]) ?? [];
  const stats: [string, unknown][] = [];
  if (cardData.Cost !== undefined) stats.push(['Cost', cardData.Cost]);
  if (cardData.Power !== undefined) stats.push(['Power', cardData.Power]);
  if (cardData.HP !== undefined) stats.push(['HP', cardData.HP]);

  const name = cardData.Name ?? cardId;
  const isDoubleSided = cardData.DoubleSided === true;
  const frontArt = resolveCardArtUrl(cardData.FrontArt);
  const backArt = resolveCardArtUrl(cardData.BackArt);

  const metaParts = [cardData.Type, ...arenas].filter(Boolean) as string[];
  const metaLine = [metaParts.join(' • '), traits.join(' • ')].filter(Boolean).join(' — ');

  const textParts: string[] = [];
  if (cardData.FrontText) textParts.push(String(cardData.FrontText));
  if (cardData.EpicAction) textParts.push(String(cardData.EpicAction));
  if (isDoubleSided && cardData.BackText) textParts.push(`Back: ${cardData.BackText}`);

  return `
        <div class="card-detail">
            <div class="card-detail-image">
                <div class="card-images">
                    <div class="card-images-inner">
                        <div class="card-front">
                            ${frontArt
                              ? `<img src="${frontArt}" alt="${name} (Front)">`
                              : `<div class="card-placeholder">${cardId}</div>`}
                        </div>
                        ${isDoubleSided && backArt ? `
                            <div class="card-back">
                                <img src="${backArt}" alt="${name} (Back)">
                            </div>
                        ` : ''}
                    </div>
                </div>
                ${isDoubleSided && backArt
                  ? '<button type="button" class="flip-button" onclick="this.closest(\'.card-detail\').classList.toggle(\'flipped\')">Flip Card</button>'
                  : ''}
            </div>
            <div class="card-detail-info">
                <div class="card-detail-name">${name}${cardData.Subtitle ? `<span class="card-detail-subtitle">${cardData.Subtitle}</span>` : ''}</div>
                ${aspects.length ? `
                    <div class="aspects">
                        ${aspects.map((aspect) => `<span class="aspect ${aspect}">${aspect}</span>`).join('')}
                    </div>
                ` : ''}
                ${stats.length ? `
                    <div class="card-stats">
                        ${stats.map(([label, value]) => `<span class="stat" data-type="${label}">${label}: <span class="stat-value">${value}</span></span>`).join('')}
                    </div>
                ` : ''}
                ${metaLine ? `<div class="card-detail-meta">${metaLine}</div>` : ''}
                ${textParts.length ? `
                    <div class="card-detail-text">
                        ${textParts.map((p) => `<p>${p}</p>`).join('')}
                    </div>
                ` : ''}
                ${cardData.Artist ? `<div class="card-detail-artist">Illustrated by ${cardData.Artist}</div>` : ''}
            </div>
        </div>
    `;
}

// ─── buildBuilderRowHTML ──────────────────────────────────────────────────────

/**
 * Render a card-browser entry as a compact list row: 0/1/2/3 main-deck
 * quantity buttons, a sideboard toggle, the card's ID/name, aspect
 * mini-icons, and a Cost badge. Mirrors swudb.com's card-browser row
 * layout. Uses data-action/data-card-id attributes for event delegation —
 * no inline onclick handlers.
 */
export function buildBuilderRowHTML(
  cardId: string,
  cardData: CardData = {},
  count = 0,
  sideboardCount = 0,
  expanded = false,
  stats?: CardStats | null,
): string {
  return `
        <div class="card-row${expanded ? ' expanded' : ''}" data-card-id="${cardId}">
            ${statsBarsHTML(stats)}
            <div class="card-row-quantity">
                ${quantityButtonsHTML(cardId, count, 'set-count', 'Copies in deck')}
                <button type="button"
                    data-action="toggle-sideboard" data-card-id="${cardId}"
                    class="sideboard-toggle${sideboardCount > 0 ? ' active' : ''}">SB${sideboardCount > 0 ? ` (${sideboardCount})` : ''}</button>
            </div>
            ${cardRowDetailsHTML(cardId, cardData, 'browser', stats)}
        </div>
        ${expanded ? buildCardDetailHTML(cardId, cardData) : ''}
    `;
}

// ─── buildDeckRowHTML ─────────────────────────────────────────────────────────

/**
 * Render a deck-list entry as a compact list row, for either the main-deck
 * (`zone: 'deck'`) or the separate sideboard section (`zone: 'sideboard'`).
 * Shows 0/1/2/3 quantity buttons for that zone's count, plus a button to
 * move one copy to the other zone (disabled at the 3-copy cap or when the
 * source zone is empty) — mirrors swudb.com's "SB"/"MD" move controls.
 */
export function buildDeckRowHTML(
  cardId: string,
  cardData: CardData = {},
  count = 0,
  sideboardCount = 0,
  zone: 'deck' | 'sideboard' = 'deck',
  expanded = false,
  stats?: CardStats | null,
): string {
  const isSideboard = zone === 'sideboard';
  const zoneCount = isSideboard ? sideboardCount : count;
  const setAction = isSideboard ? 'set-sideboard-count' : 'set-count';
  const setLabel = isSideboard ? 'Copies in sideboard' : 'Copies in deck';
  const moveAction = isSideboard ? 'move-to-deck' : 'move-to-sideboard';
  const moveLabel = isSideboard ? 'MD' : 'SB';
  const moveTitle = isSideboard ? 'Move to main deck' : 'Move to sideboard';
  const moveDisabled = isSideboard ? (sideboardCount <= 0 || count >= 3) : (count <= 0 || sideboardCount >= 3);
  const moveArrow = isSideboard ? '&#8593;' : '&#8595;';

  return `
        <div class="card-row${expanded ? ' expanded' : ''}" data-card-id="${cardId}">
            ${statsBarsHTML(stats)}
            <div class="card-row-quantity">
                ${quantityButtonsHTML(cardId, zoneCount, setAction, setLabel)}
                <button type="button"
                    data-action="${moveAction}" data-card-id="${cardId}"
                    class="move-button"${moveDisabled ? ' disabled' : ''} title="${moveTitle}">${moveArrow} ${moveLabel}</button>
            </div>
            ${cardRowDetailsHTML(cardId, cardData, zone, stats)}
        </div>
        ${expanded ? buildCardDetailHTML(cardId, cardData) : ''}
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

