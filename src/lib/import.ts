/**
 * src/lib/import.ts
 * Import an existing deck into the builder from SWUDB or a pasted Melee.gg
 * decklist.
 *
 * Pure helpers (mapping, parsing, format detection) plus one fetch wrapper
 * for the SWUDB API, following the dual-export style used across src/lib.
 */

import type { CardData } from './cards';
import type { DeckCard, DeckData } from './types';
import type { Format, LegalData } from './legal';
import { getDeckIdFromUrl } from './url';
import { fetchWithRetry } from './api';

interface SwudbDeckResponse {
  deck: Array<{ id: string; count?: number }>;
  sideboard?: Array<{ id: string; count?: number }>;
  metadata?: { name?: string };
  leader?: { id: string };
  base?: { id: string };
  error?: string;
}

export function parseSwudbDeckId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return getDeckIdFromUrl(trimmed);
}

export async function fetchSwudbDeck(deckId: string): Promise<SwudbDeckResponse> {
  const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
  const deckData = (await fetchWithRetry(targetUrl, 3)) as SwudbDeckResponse;

  if (!deckData) throw new Error('Server returned empty response');
  if (deckData.error) throw new Error(`API Error: ${deckData.error}`);
  if (!deckData.deck) throw new Error('Invalid deck data format received from server');

  return deckData;
}

export function mapSwudbToDeckData(api: SwudbDeckResponse): DeckData {
  const result: DeckData = { deck: api.deck.map((c) => ({ id: c.id, count: c.count ?? 1 })) };

  if (api.sideboard?.length) {
    result.sideboard = api.sideboard.map((c) => ({ id: c.id, count: c.count ?? 1 }));
  }
  if (api.leader) result.leader = { id: api.leader.id, count: 1 };
  if (api.base) result.base = { id: api.base.id, count: 1 };
  if (api.metadata?.name) result.metadata = { name: api.metadata.name };

  return result;
}

export interface MeleeParseResult {
  deckData: DeckData;
  unmatchedLines: string[];
}

const COUNT_LINE = /^(\d+)x?\s+(.+)$/i;
const LEADER_LINE = /^leader:\s*(.+)$/i;
const BASE_LINE = /^base:\s*(.+)$/i;
const SIDEBOARD_LINE = /^sideboard:?\s*$/i;

/** Case-insensitive Name -> CardData lookup; later entries (newer sets) win. */
function buildNameIndex(cards: CardData[]): Map<string, CardData> {
  const index = new Map<string, CardData>();
  for (const card of cards) {
    if (!card.Name) continue;
    index.set(card.Name.toLowerCase(), card);
  }
  return index;
}

function addCard(list: DeckCard[], id: string, count: number): void {
  const existing = list.find((c) => c.id === id);
  if (existing) {
    existing.count = (existing.count ?? 1) + count;
  } else {
    list.push({ id, count });
  }
}

/**
 * Parse a pasted Melee-style decklist:
 *   Leader: <name>
 *   Base: <name>
 *   <count> <card name>     (repeatable, main deck)
 *   Sideboard:
 *   <count> <card name>     (repeatable, after a "Sideboard:" line)
 *
 * Card names are matched case-insensitively against `cards` (the full,
 * unfiltered card pool). If a name matches multiple printings, the printing
 * from the latest set (last in set order) wins, since `cards` is iterated in
 * set order and later matches overwrite earlier ones in the name index.
 * Count+name lines whose name doesn't resolve to any card are returned in
 * `unmatchedLines` (original line text).
 */
export function parseMeleeDecklist(text: string, cards: CardData[]): MeleeParseResult {
  const nameIndex = buildNameIndex(cards);
  const deck: DeckCard[] = [];
  const sideboard: DeckCard[] = [];
  const unmatchedLines: string[] = [];
  let leader: DeckCard | undefined;
  let base: DeckCard | undefined;
  let inSideboard = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (SIDEBOARD_LINE.test(line)) {
      inSideboard = true;
      continue;
    }

    const leaderMatch = line.match(LEADER_LINE);
    if (leaderMatch) {
      const card = nameIndex.get(leaderMatch[1].trim().toLowerCase());
      if (card?.id) leader = { id: card.id, count: 1 };
      else unmatchedLines.push(line);
      continue;
    }

    const baseMatch = line.match(BASE_LINE);
    if (baseMatch) {
      const card = nameIndex.get(baseMatch[1].trim().toLowerCase());
      if (card?.id) base = { id: card.id, count: 1 };
      else unmatchedLines.push(line);
      continue;
    }

    const countMatch = line.match(COUNT_LINE);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      const name = countMatch[2].trim();
      const card = nameIndex.get(name.toLowerCase());
      if (card?.id) {
        addCard(inSideboard ? sideboard : deck, card.id, count);
      } else {
        unmatchedLines.push(line);
      }
      continue;
    }
  }

  const deckData: DeckData = { deck };
  if (sideboard.length) deckData.sideboard = sideboard;
  if (leader) deckData.leader = leader;
  if (base) deckData.base = base;

  return { deckData, unmatchedLines };
}

/**
 * Inspect every card id referenced by `deckData` (deck, sideboard, leader,
 * base) against `cards` + `legal`. Returns 'premier' only if every card's
 * set is premier-legal and not premier-banned; otherwise 'eternal'. Never
 * strips cards regardless of the result (including eternal-banned cards).
 */
export function detectFormat(deckData: DeckData, cards: CardData[], legal: LegalData): Format {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const ids = [
    ...deckData.deck.map((c) => c.id),
    ...(deckData.sideboard ?? []).map((c) => c.id),
    ...(deckData.leader ? [deckData.leader.id] : []),
    ...(deckData.base ? [deckData.base.id] : []),
  ];

  const allPremierLegal = ids.every((id) => {
    const card = cardsById.get(id);
    if (!card) return false;
    return legal.premier.sets.includes(String(card.Set ?? '')) && !legal.premier.bannedCards.includes(id);
  });

  return allPremierLegal ? 'premier' : 'eternal';
}
