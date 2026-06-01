import { describe, it, expect } from 'vitest';
import { analyzeDeckDifferences } from './compare';
import type { CardCountMap } from './types';

function makeMap(entries: Record<string, { main: number; sideboard: number }>): CardCountMap {
  return new Map(Object.entries(entries));
}

describe('analyzeDeckDifferences', () => {
  it('identifies cards only in deck 1', () => {
    const d1 = makeMap({
      SOR_001: { main: 2, sideboard: 0 },
      SOR_002: { main: 1, sideboard: 0 },
      SOR_003: { main: 0, sideboard: 1 },
    });
    const d2 = makeMap({ SOR_001: { main: 2, sideboard: 0 } });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.deck1Only).toHaveLength(2);
    expect(result.deck1Only).toContainEqual({ id: 'SOR_002', main: 1, sideboard: 0 });
    expect(result.deck1Only).toContainEqual({ id: 'SOR_003', main: 0, sideboard: 1 });
  });

  it('identifies cards only in deck 2', () => {
    const d1 = makeMap({ SOR_001: { main: 2, sideboard: 0 } });
    const d2 = makeMap({
      SOR_001: { main: 2, sideboard: 0 },
      SOR_004: { main: 3, sideboard: 0 },
      SOR_005: { main: 0, sideboard: 1 },
    });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.deck2Only).toHaveLength(2);
    expect(result.deck2Only).toContainEqual({ id: 'SOR_004', main: 3, sideboard: 0 });
    expect(result.deck2Only).toContainEqual({ id: 'SOR_005', main: 0, sideboard: 1 });
  });

  it('identifies cards with different main counts', () => {
    const d1 = makeMap({ SOR_001: { main: 3, sideboard: 0 } });
    const d2 = makeMap({ SOR_001: { main: 2, sideboard: 0 } });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.differentCounts).toHaveLength(1);
    expect(result.differentCounts[0]).toMatchObject({
      id: 'SOR_001',
      deck1Main: 3,
      deck1Sideboard: 0,
      deck2Main: 2,
      deck2Sideboard: 0,
    });
  });

  it('identifies sideboard differences as differentCounts', () => {
    const d1 = makeMap({ SOR_001: { main: 2, sideboard: 1 } });
    const d2 = makeMap({ SOR_001: { main: 2, sideboard: 0 } });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.differentCounts).toHaveLength(1);
    expect(result.differentCounts[0].deck1Sideboard).toBe(1);
    expect(result.differentCounts[0].deck2Sideboard).toBe(0);
  });

  it('identifies identical cards', () => {
    const d1 = makeMap({
      SOR_001: { main: 2, sideboard: 1 },
      SOR_002: { main: 1, sideboard: 0 },
    });
    const d2 = makeMap({
      SOR_001: { main: 2, sideboard: 1 },
      SOR_002: { main: 1, sideboard: 0 },
    });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.sameCards).toHaveLength(2);
    expect(result.sameCards).toContainEqual({ id: 'SOR_001', main: 2, sideboard: 1 });
    expect(result.sameCards).toContainEqual({ id: 'SOR_002', main: 1, sideboard: 0 });
  });

  it('handles empty decks', () => {
    const result = analyzeDeckDifferences(new Map(), new Map());
    expect(result.deck1Only).toHaveLength(0);
    expect(result.deck2Only).toHaveLength(0);
    expect(result.differentCounts).toHaveLength(0);
    expect(result.sameCards).toHaveLength(0);
  });

  it('handles one empty deck', () => {
    const d1 = makeMap({ SOR_001: { main: 2, sideboard: 0 } });
    const result = analyzeDeckDifferences(d1, new Map());
    expect(result.deck1Only).toHaveLength(1);
    expect(result.deck2Only).toHaveLength(0);
  });

  it('handles a complex mixed comparison', () => {
    const d1 = makeMap({
      SOR_001: { main: 2, sideboard: 0 },
      SOR_002: { main: 1, sideboard: 1 },
      SOR_003: { main: 0, sideboard: 1 },
    });
    const d2 = makeMap({
      SOR_001: { main: 2, sideboard: 0 },
      SOR_002: { main: 1, sideboard: 0 },
      SOR_004: { main: 3, sideboard: 0 },
    });

    const result = analyzeDeckDifferences(d1, d2);
    expect(result.deck1Only).toHaveLength(1);
    expect(result.deck2Only).toHaveLength(1);
    expect(result.differentCounts).toHaveLength(1);
    expect(result.sameCards).toHaveLength(1);
  });

  it('total cards across all buckets equals total unique card IDs', () => {
    const d1 = makeMap({
      SOR_001: { main: 3, sideboard: 0 },
      SOR_002: { main: 1, sideboard: 1 },
      SOR_003: { main: 2, sideboard: 0 },
    });
    const d2 = makeMap({
      SOR_001: { main: 2, sideboard: 0 },
      SOR_002: { main: 1, sideboard: 1 },
      SOR_004: { main: 1, sideboard: 0 },
    });

    const result = analyzeDeckDifferences(d1, d2);
    const total =
      result.deck1Only.length +
      result.deck2Only.length +
      result.differentCounts.length +
      result.sameCards.length;
    expect(total).toBe(4); // SOR_001(diff), SOR_002(same), SOR_003(d1only), SOR_004(d2only)
  });
});

