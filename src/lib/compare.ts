/**
 * src/lib/compare.ts
 * Pure deck-comparison logic — zero DOM dependencies.
 */

import type { CardCountMap } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeckOnlyCard {
  id: string;
  main: number;
  sideboard: number;
}

export interface DifferentCountCard {
  id: string;
  deck1Main: number;
  deck1Sideboard: number;
  deck2Main: number;
  deck2Sideboard: number;
}

export interface SameCard {
  id: string;
  main: number;
  sideboard: number;
}

export interface DeckDifferences {
  deck1Only: DeckOnlyCard[];
  deck2Only: DeckOnlyCard[];
  differentCounts: DifferentCountCard[];
  sameCards: SameCard[];
}

// ─── analyzeDeckDifferences ───────────────────────────────────────────────────

/**
 * Compare two card-count maps and categorise every card into one of four buckets:
 * - deck1Only: cards present only in deck 1
 * - deck2Only: cards present only in deck 2
 * - differentCounts: cards in both decks but with different main/sideboard counts
 * - sameCards: cards in both decks with identical counts
 */
export function analyzeDeckDifferences(
  deck1Cards: CardCountMap,
  deck2Cards: CardCountMap,
): DeckDifferences {
  const allCardIds = new Set([...deck1Cards.keys(), ...deck2Cards.keys()]);

  const result: DeckDifferences = {
    deck1Only: [],
    deck2Only: [],
    differentCounts: [],
    sameCards: [],
  };

  for (const cardId of allCardIds) {
    const c1 = deck1Cards.get(cardId) ?? { main: 0, sideboard: 0 };
    const c2 = deck2Cards.get(cardId) ?? { main: 0, sideboard: 0 };

    const total1 = c1.main + c1.sideboard;
    const total2 = c2.main + c2.sideboard;

    if (total1 > 0 && total2 === 0) {
      result.deck1Only.push({ id: cardId, main: c1.main, sideboard: c1.sideboard });
    } else if (total1 === 0 && total2 > 0) {
      result.deck2Only.push({ id: cardId, main: c2.main, sideboard: c2.sideboard });
    } else if (c1.main !== c2.main || c1.sideboard !== c2.sideboard) {
      result.differentCounts.push({
        id: cardId,
        deck1Main: c1.main,
        deck1Sideboard: c1.sideboard,
        deck2Main: c2.main,
        deck2Sideboard: c2.sideboard,
      });
    } else if (total1 > 0 && total2 > 0) {
      result.sameCards.push({ id: cardId, main: c1.main, sideboard: c1.sideboard });
    }
  }

  return result;
}

