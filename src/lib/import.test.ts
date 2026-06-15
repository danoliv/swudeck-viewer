import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseSwudbDeckId,
  fetchSwudbDeck,
  mapSwudbToDeckData,
  parseMeleeDecklist,
  detectFormat,
} from './import';
import type { LegalData } from './legal';
import type { CardData } from './cards';

beforeEach(() => {
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    hostname: 'localhost',
    search: '',
    href: 'http://localhost/',
    pathname: '/',
    toString() { return this.href; },
  } as unknown as Location);
});

// ─── parseSwudbDeckId ───────────────────────────────────────────────────────

describe('parseSwudbDeckId', () => {
  it('extracts the deck id from a full SWUDB URL', () => {
    expect(parseSwudbDeckId('https://swudb.com/deck/abc123')).toBe('abc123');
  });

  it('returns a bare id string unchanged', () => {
    expect(parseSwudbDeckId('abc123')).toBe('abc123');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseSwudbDeckId('  abc123  ')).toBe('abc123');
  });

  it('returns null for empty input', () => {
    expect(parseSwudbDeckId('')).toBeNull();
    expect(parseSwudbDeckId('   ')).toBeNull();
  });
});

// ─── fetchSwudbDeck ─────────────────────────────────────────────────────────

describe('fetchSwudbDeck', () => {
  it('fetches and returns deck data on success', async () => {
    const apiData = { deck: [{ id: 'SOR_001', count: 3 }], leader: { id: 'SOR_002' }, base: { id: 'SOR_003' } };
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(apiData));

    const result = await fetchSwudbDeck('abc123');
    expect(fetch).toHaveBeenCalled();
    expect(result).toEqual(apiData);
  });

  it('throws when the API reports an error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ error: 'Deck not found' }));
    await expect(fetchSwudbDeck('missing')).rejects.toThrow('Deck not found');
  });

  it('throws when the response has no deck field', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ metadata: { name: 'X' } }));
    await expect(fetchSwudbDeck('abc123')).rejects.toThrow('Invalid deck data format');
  });
});

// ─── mapSwudbToDeckData ─────────────────────────────────────────────────────

describe('mapSwudbToDeckData', () => {
  it('maps deck, sideboard, leader, base, and metadata.name', () => {
    const result = mapSwudbToDeckData({
      deck: [{ id: 'SOR_001', count: 3 }, { id: 'SOR_004' }],
      sideboard: [{ id: 'SOR_005', count: 2 }],
      leader: { id: 'SOR_002' },
      base: { id: 'SOR_003' },
      metadata: { name: 'My Deck' },
    });

    expect(result).toEqual({
      deck: [{ id: 'SOR_001', count: 3 }, { id: 'SOR_004', count: 1 }],
      sideboard: [{ id: 'SOR_005', count: 2 }],
      leader: { id: 'SOR_002', count: 1 },
      base: { id: 'SOR_003', count: 1 },
      metadata: { name: 'My Deck' },
    });
  });

  it('omits sideboard/leader/base/metadata when absent', () => {
    const result = mapSwudbToDeckData({ deck: [{ id: 'SOR_001', count: 1 }] });
    expect(result).toEqual({ deck: [{ id: 'SOR_001', count: 1 }] });
  });

  it('omits an empty sideboard array', () => {
    const result = mapSwudbToDeckData({ deck: [{ id: 'SOR_001', count: 1 }], sideboard: [] });
    expect(result.sideboard).toBeUndefined();
  });
});

// ─── parseMeleeDecklist ─────────────────────────────────────────────────────

const CARDS: CardData[] = [
  { id: 'SOR_001', Set: 'SOR', Name: 'Leia Organa, Defiant Princess' },
  { id: 'SOR_002', Set: 'SOR', Name: 'Echo Base' },
  { id: 'SOR_003', Set: 'SOR', Name: 'Wampa', Cost: 1 },
  { id: 'SOR_004', Set: 'SOR', Name: 'Vanguard Infiltrator' },
  { id: 'JTL_010', Set: 'JTL', Name: 'Wampa', Cost: 2 }, // reprint, later set
];

describe('parseMeleeDecklist', () => {
  it('parses leader, base, deck, and sideboard sections', () => {
    const text = `
      Leader: Leia Organa, Defiant Princess
      Base: Echo Base

      3 Vanguard Infiltrator
      2x Wampa

      Sideboard:
      1 Vanguard Infiltrator
    `;

    const { deckData, unmatchedLines } = parseMeleeDecklist(text, CARDS);

    expect(unmatchedLines).toEqual([]);
    expect(deckData.leader).toEqual({ id: 'SOR_001', count: 1 });
    expect(deckData.base).toEqual({ id: 'SOR_002', count: 1 });
    expect(deckData.deck).toContainEqual({ id: 'SOR_004', count: 3 });
    // "Wampa" has two printings; the later set (JTL) wins.
    expect(deckData.deck).toContainEqual({ id: 'JTL_010', count: 2 });
    expect(deckData.sideboard).toEqual([{ id: 'SOR_004', count: 1 }]);
  });

  it('matches card names case-insensitively', () => {
    const { deckData } = parseMeleeDecklist('3 vanguard infiltrator', CARDS);
    expect(deckData.deck).toEqual([{ id: 'SOR_004', count: 3 }]);
  });

  it('reports lines that look like cards but do not resolve', () => {
    const { deckData, unmatchedLines } = parseMeleeDecklist('2 Some Unknown Card\n1 Wampa', CARDS);
    expect(unmatchedLines).toEqual(['2 Some Unknown Card']);
    expect(deckData.deck).toEqual([{ id: 'JTL_010', count: 1 }]);
  });

  it('reports an unmatched Leader/Base line', () => {
    const { deckData, unmatchedLines } = parseMeleeDecklist('Leader: Nobody Special', CARDS);
    expect(deckData.leader).toBeUndefined();
    expect(unmatchedLines).toEqual(['Leader: Nobody Special']);
  });

  it('ignores blank lines and lines with no recognizable shape', () => {
    const { deckData, unmatchedLines } = parseMeleeDecklist('\n\n   \nDeck Name: Some Deck\n3 Wampa', CARDS);
    expect(unmatchedLines).toEqual([]);
    expect(deckData.deck).toEqual([{ id: 'JTL_010', count: 3 }]);
  });
});

// ─── detectFormat ───────────────────────────────────────────────────────────

const LEGAL: LegalData = {
  premier: { sets: ['JTL', 'LOF', 'IBH', 'SEC', 'LAW'], bannedCards: [] },
  eternal: { bannedCards: ['JTL_140'] },
};

const LEGAL_CARDS: CardData[] = [
  { id: 'JTL_001', Set: 'JTL', Name: 'Leader' },
  { id: 'JTL_002', Set: 'JTL', Name: 'Base' },
  { id: 'JTL_003', Set: 'JTL', Name: 'Unit' },
  { id: 'SOR_001', Set: 'SOR', Name: 'Old Unit' },
  { id: 'JTL_140', Set: 'JTL', Name: 'Banned Unit' },
];

describe('detectFormat', () => {
  it('returns premier when every card is premier-legal', () => {
    const deckData = {
      deck: [{ id: 'JTL_003', count: 3 }],
      leader: { id: 'JTL_001', count: 1 },
      base: { id: 'JTL_002', count: 1 },
    };
    expect(detectFormat(deckData, LEGAL_CARDS, LEGAL)).toBe('premier');
  });

  it('returns eternal when a card is from a non-premier set', () => {
    const deckData = {
      deck: [{ id: 'JTL_003', count: 1 }, { id: 'SOR_001', count: 1 }],
      leader: { id: 'JTL_001', count: 1 },
      base: { id: 'JTL_002', count: 1 },
    };
    expect(detectFormat(deckData, LEGAL_CARDS, LEGAL)).toBe('eternal');
  });

  it('does not strip an eternal-banned card from a deck detected as eternal', () => {
    const deckData = {
      deck: [{ id: 'SOR_001', count: 1 }, { id: 'JTL_140', count: 1 }],
      leader: { id: 'JTL_001', count: 1 },
      base: { id: 'JTL_002', count: 1 },
    };
    expect(detectFormat(deckData, LEGAL_CARDS, LEGAL)).toBe('eternal');
    expect(deckData.deck).toContainEqual({ id: 'JTL_140', count: 1 });
  });
});
