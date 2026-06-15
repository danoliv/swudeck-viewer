import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadLegalData, filterLegalCards, clearLegalCache } from './legal';
import type { LegalData } from './legal';
import type { CardData } from './cards';

const mockLegalData: LegalData = {
  premier: { sets: ['JTL', 'LOF', 'IBH', 'SEC', 'LAW'], bannedCards: [] },
  eternal: { bannedCards: ['JTL_140', 'JTL_170'] },
};

const CARDS: CardData[] = [
  { id: 'SOR_001', Set: 'SOR', Name: 'Rotated Out' },
  { id: 'JTL_016', Set: 'JTL', Name: 'Legal Leader' },
  { id: 'JTL_140', Set: 'JTL', Name: 'IG-2000' },
  { id: 'JTL_170', Set: 'JTL', Name: 'War Juggernaut' },
  { id: 'SEC_213', Set: 'SEC', Name: 'A-Wing' },
];

beforeEach(() => {
  (fetch as ReturnType<typeof vi.fn>).resetMocks();
  vi.clearAllMocks();
  clearLegalCache();
});

// ─── loadLegalData ──────────────────────────────────────────────────────────

describe('loadLegalData', () => {
  it('fetches and parses legal.json', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockLegalData));
    const result = await loadLegalData();
    expect(fetch).toHaveBeenCalledWith('data/legal.json');
    expect(result).toEqual(mockLegalData);
  });

  it('returns cached data on subsequent calls without extra fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockLegalData));
    await loadLegalData();
    await loadLegalData();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── filterLegalCards ─────────────────────────────────────────────────────────

describe('filterLegalCards', () => {
  it('premier: keeps only cards whose set is in the legal set list', () => {
    const result = filterLegalCards(CARDS, 'premier', mockLegalData);
    expect(result.map((c) => c.id)).toEqual(['JTL_016', 'JTL_140', 'JTL_170', 'SEC_213']);
  });

  it('premier: also excludes any premier-banned card ids', () => {
    const legal: LegalData = { ...mockLegalData, premier: { sets: ['JTL'], bannedCards: ['JTL_016'] } };
    const result = filterLegalCards(CARDS, 'premier', legal);
    expect(result.map((c) => c.id)).toEqual(['JTL_140', 'JTL_170']);
  });

  it('eternal: keeps cards from every set', () => {
    const result = filterLegalCards(CARDS, 'eternal', mockLegalData);
    expect(result.map((c) => c.id)).toEqual(['SOR_001', 'JTL_016', 'SEC_213']);
  });

  it('eternal: excludes suspended/banned card ids', () => {
    const result = filterLegalCards(CARDS, 'eternal', mockLegalData);
    expect(result).not.toContainEqual(expect.objectContaining({ id: 'JTL_140' }));
    expect(result).not.toContainEqual(expect.objectContaining({ id: 'JTL_170' }));
  });
});
