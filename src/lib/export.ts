/**
 * src/lib/export.ts
 * Export a deck to the two formats src/lib/import.ts already knows how to
 * read back in: a pasted Melee.gg decklist, and SWUDB's deck JSON shape.
 * Each function here is the exact inverse of its import.ts counterpart
 * (parseMeleeDecklist / mapSwudbToDeckData) — round-tripping either output
 * back through that parser reproduces the same DeckData.
 */

import type { CardData } from './cards';
import type { DeckCard, DeckData } from './types';

function cardName(cards: CardData[], id: string): string {
  return cards.find((c) => c.id === id)?.Name ?? id;
}

function countLines(cards: CardData[], entries: DeckCard[]): string[] {
  return entries.map((e) => `${e.count ?? 1} ${cardName(cards, e.id)}`);
}

/**
 * Mirrors parseMeleeDecklist's expected shape:
 *   Leader: <name>
 *   Base: <name>
 *   <count> <card name>
 *   Sideboard:
 *   <count> <card name>
 */
export function exportToMeleeText(deckData: DeckData, cards: CardData[]): string {
  const lines: string[] = [];

  if (deckData.leader) lines.push(`Leader: ${cardName(cards, deckData.leader.id)}`);
  if (deckData.base) lines.push(`Base: ${cardName(cards, deckData.base.id)}`);
  if (lines.length) lines.push('');

  lines.push(...countLines(cards, deckData.deck));

  if (deckData.sideboard?.length) {
    lines.push('', 'Sideboard:');
    lines.push(...countLines(cards, deckData.sideboard));
  }

  return lines.join('\n');
}

/** Mirrors mapSwudbToDeckData's source shape (SwudbDeckResponse) — the inverse mapping. */
export function exportToSwudbJson(deckData: DeckData): string {
  const output: Record<string, unknown> = {
    deck: deckData.deck.map((c) => ({ id: c.id, count: c.count ?? 1 })),
  };

  if (deckData.sideboard?.length) {
    output.sideboard = deckData.sideboard.map((c) => ({ id: c.id, count: c.count ?? 1 }));
  }
  if (deckData.leader) output.leader = { id: deckData.leader.id };
  if (deckData.base) output.base = { id: deckData.base.id };
  if (deckData.metadata?.name) output.metadata = { name: deckData.metadata.name };

  return JSON.stringify(output, null, 2);
}
