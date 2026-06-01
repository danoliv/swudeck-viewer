import { describe, it, expect } from 'vitest';
import {
  groupCards,
  CardSortRegistry,
  SetSortStrategy,
  CostSortStrategy,
  AspectSortStrategy,
  TypeSortStrategy,
  TraitSortStrategy,
  createDefaultRegistry,
  type CardEntry,
} from './deck';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(
  id: string,
  overrides: Partial<CardEntry['data']> = {},
  count = 1,
  sideboardCount = 0,
): CardEntry {
  return {
    id,
    count,
    sideboardCount,
    data: {
      Type: 'Unit',
      Aspects: ['Command'],
      Traits: ['IMPERIAL'],
      Cost: '2',
      ...overrides,
    },
  };
}

const SET_ORDER = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC', 'LAW', 'TS26'];

// ─── groupCards ───────────────────────────────────────────────────────────────

describe('groupCards', () => {
  it('groups cards by their set prefix', () => {
    const result = groupCards([
      { id: 'SOR_001', count: 2 },
      { id: 'SOR_002', count: 1 },
      { id: 'SHD_001', count: 3 },
    ]);
    expect(result['SOR']).toHaveLength(2);
    expect(result['SHD']).toHaveLength(1);
  });

  it('sorts cards within a set by number', () => {
    const result = groupCards([
      { id: 'SOR_003', count: 1 },
      { id: 'SOR_001', count: 1 },
      { id: 'SOR_002', count: 1 },
    ]);
    expect(result['SOR'][0].number).toBe(1);
    expect(result['SOR'][1].number).toBe(2);
    expect(result['SOR'][2].number).toBe(3);
  });

  it('preserves canonical set order', () => {
    const result = groupCards(
      [
        { id: 'JTL_001' },
        { id: 'SOR_001' },
        { id: 'SHD_001' },
      ],
      SET_ORDER,
    );
    const keys = Object.keys(result);
    expect(keys.indexOf('SOR')).toBeLessThan(keys.indexOf('SHD'));
    expect(keys.indexOf('SHD')).toBeLessThan(keys.indexOf('JTL'));
  });

  it('defaults count to 1 when not provided', () => {
    const result = groupCards([{ id: 'SOR_001' }]);
    expect(result['SOR'][0].count).toBe(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupCards([])).toEqual({});
  });

  it('skips cards with no id', () => {
    const result = groupCards([
      { id: 'SOR_001' },
      { id: '' },
      {} as { id: string },
    ]);
    expect(Object.keys(result)).toHaveLength(1);
  });
});

// ─── CardSortRegistry ─────────────────────────────────────────────────────────

describe('CardSortRegistry', () => {
  it('registers and retrieves strategies', () => {
    const registry = new CardSortRegistry();
    const strategy = new SetSortStrategy();
    registry.register('set', strategy);
    expect(registry.get('set')).toBe(strategy);
  });

  it('returns null for unregistered strategy', () => {
    expect(new CardSortRegistry().get('nonexistent')).toBeNull();
  });

  it('has() returns correct boolean', () => {
    const registry = new CardSortRegistry();
    registry.register('set', new SetSortStrategy());
    expect(registry.has('set')).toBe(true);
    expect(registry.has('cost')).toBe(false);
  });

  it('getAll() returns all registered names', () => {
    const registry = createDefaultRegistry(SET_ORDER);
    expect(registry.getAll()).toEqual(
      expect.arrayContaining(['set', 'cost', 'aspect', 'type', 'trait']),
    );
  });
});

// ─── SetSortStrategy ──────────────────────────────────────────────────────────

describe('SetSortStrategy', () => {
  const strategy = new SetSortStrategy(SET_ORDER);

  it('groupBy returns the set code', () => {
    expect(strategy.groupBy(makeCard('SOR_001'))).toBe('SOR');
    expect(strategy.groupBy(makeCard('SHD_042'))).toBe('SHD');
  });

  it('groupBy returns UNKNOWN for cards without set', () => {
    expect(strategy.groupBy(makeCard(''))).toBe('UNKNOWN');
  });

  it('sortGroups respects canonical set order', () => {
    const sorted = strategy.sortGroups(['JTL', 'SOR', 'SHD'], {});
    expect(sorted.indexOf('SOR')).toBeLessThan(sorted.indexOf('SHD'));
    expect(sorted.indexOf('SHD')).toBeLessThan(sorted.indexOf('JTL'));
  });

  it('sortWithinGroup sorts by card number', () => {
    const cards = [makeCard('SOR_003'), makeCard('SOR_001'), makeCard('SOR_002')];
    const sorted = strategy.sortWithinGroup(cards, SET_ORDER);
    expect(sorted.map((c) => c.id)).toEqual(['SOR_001', 'SOR_002', 'SOR_003']);
  });
});

// ─── CostSortStrategy ─────────────────────────────────────────────────────────

describe('CostSortStrategy', () => {
  const strategy = new CostSortStrategy();

  it('groupBy returns "Cost: <n>" for numeric costs', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Cost: '3' }))).toBe('Cost: 3');
  });

  it('groupBy returns "Cost: Unknown" for missing cost', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Cost: undefined }))).toBe('Cost: Unknown');
  });

  it('sortGroups puts numeric costs in ascending order', () => {
    const sorted = strategy.sortGroups(['Cost: 5', 'Cost: 1', 'Cost: 3'], {});
    expect(sorted).toEqual(['Cost: 1', 'Cost: 3', 'Cost: 5']);
  });

  it('sortGroups places Unknown at the end', () => {
    const sorted = strategy.sortGroups(['Cost: Unknown', 'Cost: 1'], {});
    expect(sorted[sorted.length - 1]).toBe('Cost: Unknown');
  });
});

// ─── AspectSortStrategy ───────────────────────────────────────────────────────

describe('AspectSortStrategy', () => {
  const strategy = new AspectSortStrategy();

  it('groupBy returns first aspect', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Aspects: ['Cunning', 'Aggression'] }))).toBe('Cunning');
  });

  it('groupBy returns Unknown for no aspects', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Aspects: [] }))).toBe('Unknown');
  });

  it('sortGroups places Unknown at the end', () => {
    const sorted = strategy.sortGroups(['Unknown', 'Aggression', 'Command'], {});
    expect(sorted[sorted.length - 1]).toBe('Unknown');
  });

  it('sortGroups alphabetically sorts known aspects', () => {
    const sorted = strategy.sortGroups(['Villainy', 'Aggression', 'Command'], {});
    expect(sorted).toEqual(['Aggression', 'Command', 'Villainy']);
  });
});

// ─── TypeSortStrategy ─────────────────────────────────────────────────────────

describe('TypeSortStrategy', () => {
  const strategy = new TypeSortStrategy();

  it('groupBy returns card type', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Type: 'Event' }))).toBe('Event');
  });

  it('groupBy returns Unknown for missing type', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Type: undefined }))).toBe('Unknown');
  });

  it('sortGroups alphabetically sorts types with Unknown last', () => {
    const sorted = strategy.sortGroups(['Unknown', 'Unit', 'Event'], {});
    expect(sorted).toEqual(['Event', 'Unit', 'Unknown']);
  });
});

// ─── TraitSortStrategy ────────────────────────────────────────────────────────

describe('TraitSortStrategy', () => {
  const strategy = new TraitSortStrategy();

  it('groupBy returns first trait', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Traits: ['REBEL', 'PILOT'] }))).toBe('REBEL');
  });

  it('groupBy returns Unknown for no traits', () => {
    expect(strategy.groupBy(makeCard('SOR_001', { Traits: [] }))).toBe('Unknown');
  });

  it('sortGroups alphabetically with Unknown last', () => {
    const sorted = strategy.sortGroups(['Unknown', 'REBEL', 'IMPERIAL'], {});
    expect(sorted).toEqual(['IMPERIAL', 'REBEL', 'Unknown']);
  });
});

// ─── createDefaultRegistry ────────────────────────────────────────────────────

describe('createDefaultRegistry', () => {
  it('registers all 5 default strategies', () => {
    const registry = createDefaultRegistry(SET_ORDER);
    for (const name of ['set', 'cost', 'aspect', 'type', 'trait']) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it('set strategy respects given set order', () => {
    const registry = createDefaultRegistry(SET_ORDER);
    const set = registry.get('set') as SetSortStrategy;
    const sorted = set.sortGroups(['JTL', 'SOR', 'SHD'], {});
    expect(sorted[0]).toBe('SOR');
    expect(sorted[1]).toBe('SHD');
    expect(sorted[2]).toBe('JTL');
  });
});

