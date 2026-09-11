/**
 * src/lib/cards.ts
 * Card data loading, caching, and HTML rendering.
 * Centralises all card rendering so index and compare pages stay visually consistent.
 */

import { loadSets } from './sets';
import type { CardStats } from './stats';
import type { CardAlternative } from './alternatives';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One raw list-field entry as it actually appears across data sources for
 * fields like `Aspects` and `Traits`: a plain string (the `api.swu-db.com`
 * shape, e.g. `"Cunning"`/`"IMPERIAL"`) or a `{ S: "Cunning" }` wrapper
 * object (the shape used by the local `public/data/*.json` set files). See
 * `normalizeStringList`.
 */
export type StringListEntry = string | { S?: string } | null | undefined;

export interface CardData {
  id?: string;
  Number?: string | number;
  Name?: string;
  Type?: string;
  Aspects?: StringListEntry[];
  Traits?: StringListEntry[];
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

/**
 * Normalize a card list field to a flat `string[]`, regardless of which
 * upstream shape it arrived in: local `public/data/*.json` set files wrap
 * each entry as `{ S: "..." }` (used by both `Aspects` and `Traits`), while
 * `api.swu-db.com` returns plain strings. Anything else (missing field,
 * nulls, empty wrapper objects) is dropped rather than stringified, so
 * callers never see a literal `"[object Object]"` in rendered HTML or
 * filter/dropdown/sort comparisons. `Arenas` and `Keywords` are already
 * plain strings in both sources, but passing them through here is harmless
 * (they pass through unchanged) should that ever change.
 */
export function normalizeStringList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && typeof (entry as { S?: unknown }).S === 'string') {
        return (entry as { S: string }).S;
      }
      return undefined;
    })
    .filter((a): a is string => Boolean(a));
}

/** Normalize a card's `Aspects` field. See `normalizeStringList`. */
export function normalizeAspects(aspects: unknown): string[] {
  return normalizeStringList(aspects);
}

/** Normalize a card's `Traits` field. See `normalizeStringList`. */
export function normalizeTraits(traits: unknown): string[] {
  return normalizeStringList(traits);
}

export function resolveCardArtUrl(artUrl: string | undefined | null): string | undefined {
  if (!artUrl) return undefined;

  return artUrl.replace(/\/(\d+)F(\.[a-z0-9]+(?:\?.*)?)$/i, '/$1$2');
}

/**
 * One card face (front or back): an `<img>` plus a placeholder div that's
 * normally hidden. If `art` is missing the placeholder shows immediately;
 * if `art` is set but the request fails (e.g. a pre-release set whose
 * images aren't live on the CDN yet), `onerror` swaps to the placeholder
 * at runtime so a broken image never falls outside the card's rounded
 * frame.
 */
function cardFaceHTML(art: string | undefined, alt: string, cardId: string, faceClass: 'card-front' | 'card-back'): string {
  return `
                    <div class="${faceClass}">
                        ${art ? `<img src="${art}" alt="${alt}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` : ''}
                        <div class="card-placeholder"${art ? ' style="display:none"' : ''}>${cardId}</div>
                    </div>`;
}

/** Shared front/back image markup used by every card-rendering function, so a CDN image gap looks the same everywhere. */
export function cardImagesHTML(cardId: string, name: string, frontArt: string | undefined, backArt: string | undefined, isDoubleSided: boolean): string {
  return `
            <div class="card-images">
                <div class="card-images-inner">
                    ${cardFaceHTML(frontArt, `${name} (Front)`, cardId, 'card-front')}
                    ${isDoubleSided && backArt ? cardFaceHTML(backArt, `${name} (Back)`, cardId, 'card-back') : ''}
                </div>
            </div>`;
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

// ─── loadAllCards ─────────────────────────────────────────────────────────────

/** Load every set, dedupe variants, and assign canonical "SET_NNN" IDs. */
export async function loadAllCards(): Promise<CardData[]> {
  const cardsById = new Map<string, CardData>();

  for (const set of loadSets()) {
    const index = await loadCardSet(set);
    for (const card of Object.values(index)) {
      if (card.VariantType && card.VariantType !== 'Normal') continue;

      const id = formatCardId(set, card.Number ?? '');
      if (!cardsById.has(id)) cardsById.set(id, { ...card, id });
    }
  }

  return Array.from(cardsById.values());
}

/** Look up a card by ID within an already-loaded pool (e.g. from `loadAllCards`). Falls back to a stub so callers can render unconditionally. */
export function findCardById(cards: CardData[], cardId: string | undefined): CardData {
  return (cardId && cards.find((c) => c.id === cardId)) || { id: cardId, Name: cardId };
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
  const aspects: string[] = normalizeAspects(cardData.Aspects);
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
            ${cardImagesHTML(cardId, String(cardData.Name ?? cardId), frontArt, backArt, isDoubleSided)}
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

/**
 * Compact Main/Side count badge for a card row: a single button showing both
 * zone counts that toggles the quantity popup. `zone` namespaces the popup's
 * open/expanded state the same way `cardRowDetailsHTML`'s `toggle-detail`
 * does, so browser/deck/sideboard rows for the same card don't share state.
 */
function quantityControlHTML(
  cardId: string,
  count: number,
  sideboardCount: number,
  zone: string,
  popupOpen: boolean,
): string {
  return `
        <div class="card-row-quantity">
            <button type="button"
                data-action="toggle-qty-popup" data-card-id="${cardId}" data-zone="${zone}"
                class="qty-badge${popupOpen ? ' active' : ''}"
                aria-haspopup="true" aria-expanded="${popupOpen}">
                <span class="qty-badge-item"><span class="qty-badge-label">Main</span><span class="qty-badge-value">${count}</span></span>
                <span class="qty-badge-item"><span class="qty-badge-label">Side</span><span class="qty-badge-value">${sideboardCount}</span></span>
            </button>
        </div>`;
}

/** Popup with independent 0/1/2/3 controls for main-deck and sideboard counts. */
function quantityPopupHTML(cardId: string, count: number, sideboardCount: number): string {
  return `
        <div class="qty-popup" role="dialog" aria-label="Set copies">
            <div class="qty-popup-row">
                <span class="qty-popup-label">Main deck</span>
                ${quantityButtonsHTML(cardId, count, 'set-main-count', 'Main deck copies')}
            </div>
            <div class="qty-popup-row">
                <span class="qty-popup-label">Sideboard</span>
                ${quantityButtonsHTML(cardId, sideboardCount, 'set-side-count', 'Sideboard copies')}
            </div>
        </div>`;
}

/** Shared id/name/aspect-icons/cost markup used by both row layouts. */
function cardRowDetailsHTML(cardId: string, cardData: CardData, zone: string, stats?: CardStats | null): string {
  const aspects: string[] = normalizeAspects(cardData.Aspects);
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

const ALTERNATIVES_VISIBLE_COUNT = 4;

/** Current main/sideboard counts + quantity-popup state for one alternative card, in the card-browser zone. */
export interface AltQtyInfo {
  count: number;
  sideboardCount: number;
  popupOpen: boolean;
}

export type AltQtyLookup = (altId: string) => AltQtyInfo;

/**
 * One alternative in the "Best alternatives" list: a thumbnail, name, its own
 * cost/power/hp, and why it qualified. In the card browser (`zone: 'browser'`),
 * where the alternative isn't necessarily already in the deck, it gets the
 * same Main/Side quantity control as any other browser row (via
 * `altQtyLookup`) so it can be added directly; elsewhere it gets a "Swap in"
 * button that replaces the card being viewed in-place.
 */
function alternativeCardHTML(alt: CardAlternative, cardId: string, zone: string, altQtyLookup?: AltQtyLookup): string {
  const c = alt.card;
  const id = String(c.id ?? '');
  const name = String(c.Name ?? id);
  const art = resolveCardArtUrl(c.FrontArt);
  const statParts: string[] = [];
  if (c.Cost !== undefined) statParts.push(`Cost ${c.Cost}`);
  if (c.Power !== undefined) statParts.push(`Power ${c.Power}`);
  if (c.HP !== undefined) statParts.push(`HP ${c.HP}`);

  const qty = zone === 'browser' ? altQtyLookup?.(id) : undefined;
  const actionHTML = qty
    ? `<div class="alternative-card-qty">
                                    ${quantityControlHTML(id, qty.count, qty.sideboardCount, 'browser', qty.popupOpen)}
                                    ${qty.popupOpen ? quantityPopupHTML(id, qty.count, qty.sideboardCount) : ''}
                                </div>`
    : `<button type="button" class="alternative-card-swap" data-action="swap-alternative" data-card-id="${cardId}" data-alt-id="${id}" data-zone="${zone}">Swap in</button>`;

  return `
                        <div class="alternative-card">
                            <div class="alternative-card-image">
                                ${art ? `<img src="${art}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                                <div class="alternative-card-placeholder"${art ? ' style="display:none"' : ''}>${id}</div>
                            </div>
                            <div class="alternative-card-info">
                                <div class="alternative-card-name">${name}</div>
                                ${statParts.length ? `<div class="alternative-card-stats">${statParts.join(' • ')}</div>` : ''}
                                <div class="alternative-card-reasons">${alt.reasons.join(' • ')}</div>
                                ${actionHTML}
                            </div>
                        </div>`;
}

/**
 * "Best alternatives" section: up to ${ALTERNATIVES_VISIBLE_COUNT} qualifying
 * alternatives (see findAlternatives in src/lib/alternatives.ts), each with a
 * way to act on it (see alternativeCardHTML), plus a "Show N more" toggle
 * when there are more.
 */
function alternativesHTML(
  cardId: string,
  zone: string,
  alternatives: CardAlternative[],
  showAll: boolean,
  altQtyLookup?: AltQtyLookup,
): string {
  if (!alternatives.length) return '';

  const visible = showAll ? alternatives : alternatives.slice(0, ALTERNATIVES_VISIBLE_COUNT);
  const remaining = alternatives.length - visible.length;

  return `
            <div class="card-detail-alternatives">
                <div class="card-detail-alternatives-title">Best alternatives</div>
                <div class="alternatives-list">
                    ${visible.map((alt) => alternativeCardHTML(alt, cardId, zone, altQtyLookup)).join('')}
                </div>
                ${alternatives.length > ALTERNATIVES_VISIBLE_COUNT ? `
                    <button type="button" class="alternatives-toggle" data-action="toggle-alternatives" data-card-id="${cardId}" data-zone="${zone}">
                        ${showAll ? 'Show fewer' : `Show ${remaining} more`}
                    </button>
                ` : ''}
            </div>`;
}

// ─── buildCardDetailHTML ──────────────────────────────────────────────────────

/**
 * Render an inline card-detail panel: full card image (with a flip button for
 * double-sided cards), stats, aspects, type/arena/traits, ability text, and
 * artist credit. A smaller, integrated version of swudb.com's card-detail page
 * — shown below a card row when its name is clicked. `alternatives` (if any)
 * render as their own block below the image+text, per findAlternatives.
 */
export function buildCardDetailHTML(
  cardId: string,
  cardData: CardData = {},
  zone = 'detail',
  alternatives: CardAlternative[] = [],
  showAllAlternatives = false,
  altQtyLookup?: AltQtyLookup,
): string {
  const aspects: string[] = normalizeAspects(cardData.Aspects);
  const traits: string[] = normalizeTraits(cardData.Traits);
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
                ${cardImagesHTML(cardId, String(name), frontArt, backArt, isDoubleSided)}
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
        ${alternativesHTML(cardId, zone, alternatives, showAllAlternatives, altQtyLookup)}
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
  popupOpen = false,
  alternatives: CardAlternative[] = [],
  showAllAlternatives = false,
  altQtyLookup?: AltQtyLookup,
): string {
  return `
        <div class="card-row-wrap">
            <div class="card-row${expanded ? ' expanded' : ''}" data-card-id="${cardId}">
                ${statsBarsHTML(stats)}
                ${quantityControlHTML(cardId, count, sideboardCount, 'browser', popupOpen)}
                ${cardRowDetailsHTML(cardId, cardData, 'browser', stats)}
            </div>
            ${popupOpen ? quantityPopupHTML(cardId, count, sideboardCount) : ''}
        </div>
        ${expanded ? buildCardDetailHTML(cardId, cardData, 'browser', alternatives, showAllAlternatives, altQtyLookup) : ''}
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
  popupOpen = false,
  alternatives: CardAlternative[] = [],
  showAllAlternatives = false,
): string {
  return `
        <div class="card-row-wrap">
            <div class="card-row${expanded ? ' expanded' : ''}" data-card-id="${cardId}">
                ${statsBarsHTML(stats)}
                ${quantityControlHTML(cardId, count, sideboardCount, zone, popupOpen)}
                ${cardRowDetailsHTML(cardId, cardData, zone, stats)}
            </div>
            ${popupOpen ? quantityPopupHTML(cardId, count, sideboardCount) : ''}
        </div>
        ${expanded ? buildCardDetailHTML(cardId, cardData, zone, alternatives, showAllAlternatives) : ''}
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
  const aspects: string[] = normalizeAspects(cardData.Aspects);
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
            ${cardImagesHTML(cardId, String(cardData.Name ?? cardId), frontArt, backArt, isDoubleSided)}
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

