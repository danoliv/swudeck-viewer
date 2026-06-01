/**
 * src/lib/deck-info.ts
 * Pure helpers for aggregating and displaying deck metadata.
 */

import type { DeckData, CardCountMap } from './types';

/**
 * Build a consolidated card-count map from deck data (main + sideboard).
 * Returns a `Map<id, { main, sideboard }>`.
 */
export function buildDeckCardCounts(deckData: DeckData | null | undefined): CardCountMap {
  const map: CardCountMap = new Map();
  if (!deckData) return map;

  if (Array.isArray(deckData.deck)) {
    for (const card of deckData.deck) {
      if (card?.id) {
        map.set(card.id, { main: card.count ?? 1, sideboard: 0 });
      }
    }
  }

  if (Array.isArray(deckData.sideboard)) {
    for (const card of deckData.sideboard) {
      if (card?.id) {
        const cnt = card.count ?? 1;
        const existing = map.get(card.id);
        if (existing) {
          existing.sideboard = cnt;
        } else {
          map.set(card.id, { main: 0, sideboard: cnt });
        }
      }
    }
  }

  return map;
}

/**
 * Generate the HTML snippet shown in a deck info panel.
 */
export function deckInfoHTML(deckData: DeckData | null | undefined): string {
  const deckName = deckData?.metadata?.name ?? 'Unnamed Deck';
  const deckSize = Array.isArray(deckData?.deck) ? deckData!.deck.length : 0;
  const sideboardSize = Array.isArray(deckData?.sideboard) ? deckData!.sideboard!.length : 0;
  return `
      <div class="deck-name">${deckName}</div>
      <div class="deck-stats">
        Main Deck: ${deckSize} cards<br>
        Sideboard: ${sideboardSize} cards
      </div>
    `;
}

