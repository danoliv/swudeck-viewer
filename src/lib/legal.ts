/**
 * src/lib/legal.ts
 * Format legality (Premier / Eternal) for the deck builder.
 *
 * `data/legal.json` (served from public/data/legal.json) is the single
 * source of truth for which sets/cards are legal in each format.
 */

import type { CardData } from './cards';

export type Format = 'premier' | 'eternal';

export interface LegalData {
  premier: { sets: string[]; bannedCards: string[] };
  eternal: { bannedCards: string[] };
}

// ─── Internal cache ───────────────────────────────────────────────────────────

let legalData: LegalData | undefined;
let loadingPromise: Promise<LegalData> | undefined;

/** Clear the in-memory legality cache (pending promise + cached data). */
export function clearLegalCache(): void {
  legalData = undefined;
  loadingPromise = undefined;
}

// ─── loadLegalData ──────────────────────────────────────────────────────────

/**
 * Fetch and cache `data/legal.json`. Subsequent calls return the cached
 * result without a network request.
 */
export async function loadLegalData(): Promise<LegalData> {
  if (legalData) return legalData;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async (): Promise<LegalData> => {
    const response = await fetch('data/legal.json');
    if (!response.ok) {
      throw new Error(`Failed to load legal.json: ${response.status}`);
    }
    legalData = (await response.json()) as LegalData;
    return legalData;
  })();

  return loadingPromise;
}

// ─── filterLegalCards ─────────────────────────────────────────────────────────

/**
 * Restrict a card pool to those legal in the given format.
 * - 'premier': card's Set must be in `legal.premier.sets`, and its id must
 *   not be in `legal.premier.bannedCards`.
 * - 'eternal': every set is legal; only `legal.eternal.bannedCards` are excluded.
 */
export function filterLegalCards(cards: CardData[], format: Format, legal: LegalData): CardData[] {
  if (format === 'premier') {
    const { sets, bannedCards } = legal.premier;
    return cards.filter((card) => sets.includes(String(card.Set ?? '')) && !bannedCards.includes(String(card.id ?? '')));
  }

  const { bannedCards } = legal.eternal;
  return cards.filter((card) => !bannedCards.includes(String(card.id ?? '')));
}
