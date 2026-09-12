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

const COUNT_LINE = /^(\d+)x?(?:\s*\|\s*|\s+)(.+)$/i;
const LEADER_LINE = /^leader:\s*(.+)$/i;
const BASE_LINE = /^base:\s*(.+)$/i;
/** Section headers, e.g. "Sideboard:" or Melee's bare "Leader" / "Base" / "MainDeck" / "Sideboard". */
const SECTION_LINE = /^(leader|base|main\s*deck|deck|sideboard)\s*:?\s*(?:\(\d+\))?$/i;

type Section = 'leader' | 'base' | 'deck' | 'sideboard';

/** Case-insensitive Name -> printings lookup, in set order (newest last). */
function buildNameIndex(cards: CardData[]): Map<string, CardData[]> {
  const index = new Map<string, CardData[]>();
  for (const card of cards) {
    if (!card.Name) continue;
    const key = card.Name.toLowerCase();
    const list = index.get(key);
    if (list) list.push(card);
    else index.set(key, [card]);
  }
  return index;
}

function isType(card: CardData, type: string): boolean {
  return String(card.Type ?? '').toLowerCase() === type;
}

/**
 * Resolve "Name" or "Name | Subtitle" to a card. Narrows by subtitle (when
 * given) and by the section's expected type (Leader / Base / neither), but
 * falls back to looser matches rather than failing. Newest printing wins.
 */
function resolveCard(index: Map<string, CardData[]>, rawName: string, section: Section): CardData | undefined {
  const [name, ...rest] = rawName.split('|').map((part) => part.trim());
  let candidates = index.get(name.toLowerCase()) ?? [];
  if (!candidates.length) return undefined;

  const subtitle = rest.join(' | ').toLowerCase();
  if (subtitle) {
    const bySubtitle = candidates.filter((c) => String(c.Subtitle ?? '').toLowerCase() === subtitle);
    if (bySubtitle.length) candidates = bySubtitle;
  }

  const byType = candidates.filter((c) => {
    if (section === 'leader') return isType(c, 'leader');
    if (section === 'base') return isType(c, 'base');
    return !isType(c, 'leader') && !isType(c, 'base');
  });
  if (byType.length) candidates = byType;

  return candidates[candidates.length - 1];
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
 * Parse a pasted decklist. Two shapes are accepted (and may be mixed):
 *
 * Melee.gg export:            Legacy inline shape:
 *   Leader                      Leader: <name>
 *   1 | <name> | <subtitle>     Base: <name>
 *   Base                        <count> <card name>
 *   1 | <name>                  Sideboard:
 *   MainDeck                    <count> <card name>
 *   3 | <name> | <subtitle>
 *   Sideboard
 *   2 | <name>
 *
 * Names match case-insensitively against `cards` (the full, unfiltered pool),
 * narrowed by subtitle and by section type (Leader/Base sections prefer those
 * types; deck sections exclude them). Among remaining printings the latest set
 * wins. Unresolved card lines are returned in `unmatchedLines`.
 */
export function parseMeleeDecklist(text: string, cards: CardData[]): MeleeParseResult {
  const nameIndex = buildNameIndex(cards);
  const deck: DeckCard[] = [];
  const sideboard: DeckCard[] = [];
  const unmatchedLines: string[] = [];
  let leader: DeckCard | undefined;
  let base: DeckCard | undefined;
  let section: Section = 'deck';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(SECTION_LINE);
    if (sectionMatch) {
      const header = sectionMatch[1].toLowerCase().replace(/\s+/g, '');
      section = header === 'leader' || header === 'base' || header === 'sideboard' ? header : 'deck';
      continue;
    }

    const inlineMatch = line.match(LEADER_LINE) ?? line.match(BASE_LINE);
    if (inlineMatch) {
      const target: Section = LEADER_LINE.test(line) ? 'leader' : 'base';
      const card = resolveCard(nameIndex, inlineMatch[1], target);
      if (card?.id) {
        if (target === 'leader') leader = { id: card.id, count: 1 };
        else base = { id: card.id, count: 1 };
      } else {
        unmatchedLines.push(line);
      }
      continue;
    }

    const countMatch = line.match(COUNT_LINE);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      const card = resolveCard(nameIndex, countMatch[2], section);
      if (!card?.id) {
        unmatchedLines.push(line);
      } else if (section === 'leader') {
        leader = { id: card.id, count: 1 };
      } else if (section === 'base') {
        base = { id: card.id, count: 1 };
      } else {
        addCard(section === 'sideboard' ? sideboard : deck, card.id, count);
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
