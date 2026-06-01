import { describe, it, expect } from 'vitest';
import { buildDeckCardCounts, deckInfoHTML } from './deck-info';
import type { DeckData } from './types';

// ─── buildDeckCardCounts ──────────────────────────────────────────────────────

describe('buildDeckCardCounts', () => {
  it('builds card counts from main deck only', () => {
    const deckData: DeckData = {
      deck: [
        { id: 'SOR_001', count: 2 },
        { id: 'SOR_002', count: 1 },
        { id: 'SHD_123', count: 3 },
      ],
    };
    const counts = buildDeckCardCounts(deckData);
    expect(counts.size).toBe(3);
    expect(counts.get('SOR_001')).toEqual({ main: 2, sideboard: 0 });
    expect(counts.get('SOR_002')).toEqual({ main: 1, sideboard: 0 });
    expect(counts.get('SHD_123')).toEqual({ main: 3, sideboard: 0 });
  });

  it('merges sideboard counts for cards that appear in both', () => {
    const deckData: DeckData = {
      deck: [{ id: 'SOR_001', count: 2 }],
      sideboard: [
        { id: 'SOR_001', count: 1 },
        { id: 'SOR_003', count: 2 },
      ],
    };
    const counts = buildDeckCardCounts(deckData);
    expect(counts.size).toBe(2);
    expect(counts.get('SOR_001')).toEqual({ main: 2, sideboard: 1 });
    expect(counts.get('SOR_003')).toEqual({ main: 0, sideboard: 2 });
  });

  it('handles cards only in sideboard', () => {
    const deckData: DeckData = {
      deck: [],
      sideboard: [{ id: 'SOR_005', count: 1 }],
    };
    const counts = buildDeckCardCounts(deckData);
    expect(counts.size).toBe(1);
    expect(counts.get('SOR_005')).toEqual({ main: 0, sideboard: 1 });
  });

  it('returns an empty map for null input', () => {
    expect(buildDeckCardCounts(null).size).toBe(0);
  });

  it('returns an empty map for undefined input', () => {
    expect(buildDeckCardCounts(undefined).size).toBe(0);
  });

  it('returns an empty map for an empty deck', () => {
    expect(buildDeckCardCounts({ deck: [], sideboard: [] }).size).toBe(0);
  });

  it('defaults count to 1 when count is omitted', () => {
    const counts = buildDeckCardCounts({ deck: [{ id: 'SOR_001' }] });
    expect(counts.get('SOR_001')).toEqual({ main: 1, sideboard: 0 });
  });

  it('skips cards without an id', () => {
    const deckData = {
      deck: [
        { id: 'SOR_001', count: 2 },
        { count: 3 } as unknown as { id: string; count: number },
        null as unknown as { id: string },
        { id: 'SOR_002', count: 1 },
      ],
    };
    const counts = buildDeckCardCounts(deckData);
    expect(counts.size).toBe(2);
    expect(counts.has('SOR_001')).toBe(true);
    expect(counts.has('SOR_002')).toBe(true);
  });
});

// ─── deckInfoHTML ─────────────────────────────────────────────────────────────

describe('deckInfoHTML', () => {
  it('generates HTML with deck name and stats', () => {
    const deckData: DeckData = {
      metadata: { name: 'Test Deck' },
      deck: [{ id: 'SOR_001', count: 2 }, { id: 'SOR_002', count: 1 }],
      sideboard: [{ id: 'SOR_003', count: 1 }],
    };
    const html = deckInfoHTML(deckData);
    expect(html).toContain('Test Deck');
    expect(html).toContain('Main Deck: 2 cards');
    expect(html).toContain('Sideboard: 1 cards');
  });

  it('shows "Unnamed Deck" when metadata is missing', () => {
    const html = deckInfoHTML({ deck: [{ id: 'SOR_001', count: 2 }] });
    expect(html).toContain('Unnamed Deck');
  });

  it('handles empty main deck and sideboard', () => {
    const html = deckInfoHTML({ metadata: { name: 'Empty' }, deck: [], sideboard: [] });
    expect(html).toContain('Empty');
    expect(html).toContain('Main Deck: 0 cards');
    expect(html).toContain('Sideboard: 0 cards');
  });

  it('handles missing sideboard', () => {
    const html = deckInfoHTML({
      metadata: { name: 'Main Only' },
      deck: [{ id: 'SOR_001' }, { id: 'SOR_002' }],
    });
    expect(html).toContain('Main Deck: 2 cards');
    expect(html).toContain('Sideboard: 0 cards');
  });

  it('handles null input', () => {
    const html = deckInfoHTML(null);
    expect(html).toContain('Unnamed Deck');
    expect(html).toContain('Main Deck: 0 cards');
    expect(html).toContain('Sideboard: 0 cards');
  });

  it('includes required CSS class elements', () => {
    const html = deckInfoHTML({ metadata: { name: 'T' }, deck: [{ id: 'X' }] });
    expect(html).toContain('class="deck-name"');
    expect(html).toContain('class="deck-stats"');
    expect(html).toContain('<div');
    expect(html).toContain('</div>');
  });
});

