import { describe, it, expect } from 'vitest';
import { filterCards, getLeaders, getBases, categorizeBases, sortCards, combineAspects, cardTypeCategory } from './card-filter';
import type { CardData } from './cards';

const CARDS: CardData[] = [
  {
    id: 'SEC_213', Set: 'SEC', Name: 'A-Wing', Type: 'Unit',
    Aspects: ['Heroism'], Arenas: ['Space'], Traits: ['VEHICLE', 'FIGHTER'], Keywords: ['Restore 1'],
  },
  {
    id: 'SOR_001', Set: 'SOR', Name: '2-1B Surgical Droid', Type: 'Unit',
    Aspects: ['Vigilance'], Arenas: ['Ground'], Traits: ['DROID'], Keywords: [],
  },
  {
    id: 'SOR_002', Set: 'SOR', Name: 'Bright Hope', Type: 'Unit',
    Aspects: ['Vigilance'], Arenas: ['Space'], Traits: ['VEHICLE', 'TRANSPORT'], Keywords: ['Restore 2'],
  },
  {
    id: 'SOR_003', Set: 'SOR', Name: 'Waylay', Type: 'Event',
    Aspects: ['Cunning'], Arenas: [], Traits: ['TRICK'], Keywords: [],
  },
  {
    id: 'JTL_016', Set: 'JTL', Name: 'Admiral Ackbar, It\'s a Trap!', Type: 'Leader',
    Aspects: ['Command', 'Heroism'], Arenas: [], Traits: ['REBEL', 'OFFICER'], Keywords: [],
  },
];

const BASES: CardData[] = [
  // "Random vanilla": no Aspects, no ability text
  { id: 'SOR_029', Set: 'SOR', Name: "Administrator's Tower", Type: 'Base', Aspects: [], FrontText: '' },
  // "Ability" base: has Aspects and ability text
  { id: 'JTL_024', Set: 'JTL', Name: 'Data Vault', Type: 'Base', Aspects: ['Command'], FrontText: 'Your minimum deck size is increased by 1' },
  // "Vanilla" aspect base: has Aspects, no ability text
  { id: 'JTL_022', Set: 'JTL', Name: 'Resistance Headquarters', Type: 'Base', Aspects: ['Command'], FrontText: '' },
  // Vanilla aspect base of a different aspect — still included
  { id: 'IBH_002', Set: 'IBH', Name: 'Echo Caverns', Type: 'Base', Aspects: ['Cunning'], FrontText: '' },
];

// ─── filterCards ──────────────────────────────────────────────────────────────

describe('filterCards', () => {
  it('returns all cards when no filter is set', () => {
    expect(filterCards(CARDS, {})).toEqual(CARDS);
  });

  it('filters by search (case-insensitive substring of Name)', () => {
    expect(filterCards(CARDS, { search: 'a-wing' })).toEqual([CARDS[0]]);
    expect(filterCards(CARDS, { search: 'WAYLAY' })).toEqual([CARDS[3]]);
    expect(filterCards(CARDS, { search: 'nonexistent' })).toEqual([]);
  });

  it('filters by type (OR within the list)', () => {
    const result = filterCards(CARDS, { types: ['Event', 'Leader'] });
    expect(result.map((c) => c.id)).toEqual(['SOR_003', 'JTL_016']);
  });

  it('filters by arena', () => {
    const result = filterCards(CARDS, { arenas: ['Space'] });
    expect(result.map((c) => c.id)).toEqual(['SEC_213', 'SOR_002']);
  });

  it('filters by aspect (OR within the list, overlap on card Aspects)', () => {
    const result = filterCards(CARDS, { aspects: ['Heroism'] });
    expect(result.map((c) => c.id)).toEqual(['SEC_213', 'JTL_016']);
  });

  it('ANDs a resource-cost aspect with an alignment aspect, instead of OR-ing them together', () => {
    // Command alone matches JTL_016; Heroism alone matches SEC_213 and JTL_016.
    // Selecting both should narrow to cards with both, not the union of either.
    const result = filterCards(CARDS, { aspects: ['Command', 'Heroism'] });
    expect(result.map((c) => c.id)).toEqual(['JTL_016']);
  });

  it('still ORs multiple aspects within the same group', () => {
    const result = filterCards(CARDS, { aspects: ['Vigilance', 'Cunning'] });
    expect(result.map((c) => c.id)).toEqual(['SOR_001', 'SOR_002', 'SOR_003']);
  });

  it('filters by keyword', () => {
    const result = filterCards(CARDS, { keywords: ['Restore 1'] });
    expect(result.map((c) => c.id)).toEqual(['SEC_213']);
  });

  it('filters by trait', () => {
    const result = filterCards(CARDS, { traits: ['VEHICLE'] });
    expect(result.map((c) => c.id)).toEqual(['SEC_213', 'SOR_002']);
  });

  it('filters by set', () => {
    const result = filterCards(CARDS, { sets: ['JTL'] });
    expect(result.map((c) => c.id)).toEqual(['JTL_016']);
  });

  it('combines multiple filter dimensions with AND', () => {
    const result = filterCards(CARDS, { types: ['Unit'], aspects: ['Vigilance'], arenas: ['Space'] });
    expect(result.map((c) => c.id)).toEqual(['SOR_002']);
  });

  it('excludes cards missing the array field entirely when a filter is set', () => {
    const result = filterCards(CARDS, { keywords: ['Restore 1'] });
    expect(result.find((c) => c.id === 'JTL_016')).toBeUndefined();
  });
});

// ─── filterCards - noPenaltyAspects ────────────────────────────────────────────

const PENALTY_CARDS: CardData[] = [
  { id: 'N1', Name: 'Neutral Card', Aspects: [] },
  { id: 'C1', Name: 'Command Card', Aspects: ['Command'] },
  { id: 'H1', Name: 'Heroism Card', Aspects: ['Heroism'] },
  { id: 'CH1', Name: 'Command Heroism Card', Aspects: ['Command', 'Heroism'] },
];

describe('filterCards - noPenaltyAspects', () => {
  it('includes only cards whose Aspects are a subset of noPenaltyAspects', () => {
    const result = filterCards(PENALTY_CARDS, { noPenaltyAspects: ['Command', 'Cunning'] });
    expect(result.map((c) => c.id)).toEqual(['N1', 'C1']);
  });

  it('always includes cards with no Aspects, even when noPenaltyAspects is empty', () => {
    const result = filterCards(PENALTY_CARDS, { noPenaltyAspects: [] });
    expect(result.map((c) => c.id)).toEqual(['N1']);
  });

  it('excludes cards with any Aspect outside the allowed set', () => {
    const result = filterCards(PENALTY_CARDS, { noPenaltyAspects: ['Command'] });
    expect(result.map((c) => c.id)).toEqual(['N1', 'C1']);
    expect(result.find((c) => c.id === 'CH1')).toBeUndefined();
  });

  it('combines with other filters using AND', () => {
    const result = filterCards(PENALTY_CARDS, { noPenaltyAspects: ['Command'], aspects: ['Command'] });
    expect(result.map((c) => c.id)).toEqual(['C1']);
  });

  it('applies no restriction when noPenaltyAspects is undefined', () => {
    expect(filterCards(PENALTY_CARDS, {})).toEqual(PENALTY_CARDS);
  });
});

// ─── getLeaders / getBases ────────────────────────────────────────────────────

describe('getLeaders', () => {
  it('returns only Leader-typed cards', () => {
    expect(getLeaders(CARDS).map((c) => c.id)).toEqual(['JTL_016']);
  });
});

describe('getBases', () => {
  it('returns only Base-typed cards', () => {
    expect(getBases(BASES).map((c) => c.id)).toEqual(['SOR_029', 'JTL_024', 'JTL_022', 'IBH_002']);
  });
});

// ─── categorizeBases ──────────────────────────────────────────────────────────

describe('categorizeBases', () => {
  it('puts bases with no Aspects in "random"', () => {
    const groups = categorizeBases(BASES);
    expect(groups.random.map((c) => c.id)).toEqual(['SOR_029']);
  });

  it('puts bases with Aspects and ability text in "ability"', () => {
    const groups = categorizeBases(BASES);
    expect(groups.ability.map((c) => c.id)).toEqual(['JTL_024']);
  });

  it('puts bases with Aspects and no ability text in "vanilla", regardless of which aspect', () => {
    const groups = categorizeBases(BASES);
    expect(groups.vanilla.map((c) => c.id)).toEqual(['JTL_022', 'IBH_002']);
  });

  it('returns empty groups for an empty base list', () => {
    expect(categorizeBases([])).toEqual({ random: [], ability: [], vanilla: [] });
  });
});

// ─── combineAspects ───────────────────────────────────────────────────────────

describe('combineAspects', () => {
  it('returns the union of all given aspect lists', () => {
    expect(combineAspects(['Command', 'Villainy'], ['Cunning'])).toEqual(['Command', 'Villainy', 'Cunning']);
  });

  it('dedupes aspects shared across lists', () => {
    expect(combineAspects(['Command'], ['Command', 'Villainy'])).toEqual(['Command', 'Villainy']);
  });

  it('returns undefined when given no aspects', () => {
    expect(combineAspects()).toBeUndefined();
    expect(combineAspects([], undefined)).toBeUndefined();
  });
});

// ─── sortCards ────────────────────────────────────────────────────────────────

describe('sortCards', () => {
  it('sorts by set using setOrder precedence, then by card number within a set', () => {
    const setOrder = ['SOR', 'SEC', 'JTL'];
    const result = sortCards(CARDS, 'set', setOrder);
    expect(result.map((c) => c.id)).toEqual(['SOR_001', 'SOR_002', 'SOR_003', 'SEC_213', 'JTL_016']);
  });

  it('sorts sets not present in setOrder alphabetically after known sets', () => {
    const cards: CardData[] = [
      { id: 'ZZZ_001', Set: 'ZZZ', Name: 'Unknown Set Card' },
      { id: 'SOR_001', Set: 'SOR', Name: '2-1B Surgical Droid' },
      { id: 'AAA_001', Set: 'AAA', Name: 'Another Unknown Set Card' },
    ];
    const result = sortCards(cards, 'set', ['SOR']);
    expect(result.map((c) => c.id)).toEqual(['SOR_001', 'AAA_001', 'ZZZ_001']);
  });

  it('does not mutate the input array', () => {
    const input = [...CARDS];
    sortCards(CARDS, 'set', ['JTL', 'SEC', 'SOR']);
    expect(CARDS).toEqual(input);
  });

  describe('name', () => {
    const NAME_CARDS: CardData[] = [
      { id: 'A', Name: 'Charlie' },
      { id: 'B', Name: 'alpha' },
      { id: 'C', Name: 'Bravo' },
    ];

    it('sorts alphabetically by Name (case-insensitive)', () => {
      const result = sortCards(NAME_CARDS, 'name');
      expect(result.map((c) => c.id)).toEqual(['B', 'C', 'A']);
    });
  });

  describe('cost', () => {
    const COST_CARDS: CardData[] = [
      { id: 'A', Name: 'Charlie', Cost: 3 },
      { id: 'B', Name: 'Alpha', Cost: 1 },
      { id: 'C', Name: 'Bravo', Cost: 1 },
      { id: 'D', Name: 'Delta' },
      { id: 'E', Name: 'Echo', Cost: '' },
    ];

    it('sorts ascending by numeric Cost, breaking ties by Name', () => {
      const result = sortCards(COST_CARDS, 'cost');
      expect(result.map((c) => c.id)).toEqual(['B', 'C', 'A', 'D', 'E']);
    });

    it('sorts cards with no/blank Cost last', () => {
      const result = sortCards(COST_CARDS, 'cost');
      expect(result.slice(-2).map((c) => c.id)).toEqual(['D', 'E']);
    });
  });

  describe('aspect', () => {
    const ASPECT_CARDS: CardData[] = [
      { id: 'A', Name: 'Zeta', Aspects: ['Vigilance'] },
      { id: 'B', Name: 'Yara', Aspects: ['Aggression'] },
      { id: 'C', Name: 'Xavier', Aspects: ['Vigilance'] },
      { id: 'D', Name: 'Wren' },
    ];

    it('sorts alphabetically by the first Aspect, breaking ties by Name', () => {
      const result = sortCards(ASPECT_CARDS, 'aspect');
      expect(result.map((c) => c.id)).toEqual(['B', 'C', 'A', 'D']);
    });

    it('sorts cards with no Aspects last', () => {
      const result = sortCards(ASPECT_CARDS, 'aspect');
      expect(result[result.length - 1].id).toBe('D');
    });
  });

  describe('popularity / winrate', () => {
    const STATS_CARDS: CardData[] = [
      { id: 'A', Name: 'Zeta' },
      { id: 'B', Name: 'Yara' },
      { id: 'C', Name: 'Xavier' }, // no stats entry — sorts as unranked
    ];
    const statsLookup = (cardId: string): { inclusionRate?: number; winRate?: number } | null => {
      if (cardId === 'A') return { inclusionRate: 80, winRate: 40 };
      if (cardId === 'B') return { inclusionRate: 30, winRate: 90 };
      return null;
    };

    it('sorts ascending by inclusionRate, cards with no stats first', () => {
      const result = sortCards(STATS_CARDS, 'popularity', [], 'asc', statsLookup);
      expect(result.map((c) => c.id)).toEqual(['C', 'B', 'A']);
    });

    it('sorts ascending by winRate, cards with no stats first', () => {
      const result = sortCards(STATS_CARDS, 'winrate', [], 'asc', statsLookup);
      expect(result.map((c) => c.id)).toEqual(['C', 'A', 'B']);
    });

    it('reverses with direction "desc"', () => {
      const result = sortCards(STATS_CARDS, 'popularity', [], 'desc', statsLookup);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    it('treats all cards as unranked when no statsLookup is given', () => {
      const result = sortCards(STATS_CARDS, 'popularity');
      // No stats for anyone → ties broken by Name (Xavier < Yara < Zeta).
      expect(result.map((c) => c.id)).toEqual(['C', 'B', 'A']);
    });
  });

  describe('type', () => {
    const TYPE_CARDS: CardData[] = [
      { id: 'A', Name: 'Upgrade Card', Type: 'Upgrade', Cost: 2 },
      { id: 'B', Name: 'Event Card', Type: 'Event', Cost: 1 },
      { id: 'C', Name: 'Space Unit', Type: 'Unit', Arenas: ['Space'], Cost: 3 },
      { id: 'D', Name: 'Ground Unit', Type: 'Unit', Arenas: ['Ground'], Cost: 4 },
      { id: 'E', Name: 'Both Arenas Unit', Type: 'Unit', Arenas: ['Ground', 'Space'], Cost: 5 },
      { id: 'F', Name: 'Mystery Card' },
    ];

    it('orders Ground Units, Space Units, Event, Upgrade, then other types, "Unknown" last', () => {
      const result = sortCards(TYPE_CARDS, 'type');
      expect(result.map((c) => c.id)).toEqual(['D', 'E', 'C', 'B', 'A', 'F']);
    });

    it('breaks ties within a category by Cost', () => {
      const cards: CardData[] = [
        { id: 'A', Name: 'Pricey Event', Type: 'Event', Cost: 5 },
        { id: 'B', Name: 'Cheap Event', Type: 'Event', Cost: 1 },
      ];
      const result = sortCards(cards, 'type');
      expect(result.map((c) => c.id)).toEqual(['B', 'A']);
    });
  });

  describe('secondary sort priority (cost, name, affinity, type)', () => {
    // All four cards tie on Name ("Same") and Affinity (both "Vigilance"), so
    // sorting by 'name' or 'aspect' falls through to Cost, then Type.
    const PRIORITY_CARDS: CardData[] = [
      { id: 'A', Name: 'Same', Aspects: ['Vigilance'], Cost: 2, Type: 'Upgrade' },
      { id: 'B', Name: 'Same', Aspects: ['Vigilance'], Cost: 1, Type: 'Event' },
      { id: 'C', Name: 'Same', Aspects: ['Vigilance'], Cost: 1, Type: 'Unit', Arenas: ['Ground'] },
    ];

    it('when primary is "name", breaks ties by Cost then Type', () => {
      const result = sortCards(PRIORITY_CARDS, 'name');
      // Cost 1 (C, B) before Cost 2 (A); among Cost-1 cards, Ground Units before Event.
      expect(result.map((c) => c.id)).toEqual(['C', 'B', 'A']);
    });

    it('when primary is "aspect", breaks ties by Cost then Name then Type', () => {
      const result = sortCards(PRIORITY_CARDS, 'aspect');
      expect(result.map((c) => c.id)).toEqual(['C', 'B', 'A']);
    });

    it('when primary is "cost", breaks ties by Name then Affinity then Type', () => {
      const cards: CardData[] = [
        { id: 'A', Name: 'Same', Cost: 1, Aspects: ['Vigilance'] },
        { id: 'B', Name: 'Same', Cost: 1, Aspects: ['Aggression'] },
      ];
      const result = sortCards(cards, 'cost');
      // Cost ties, Name ties, Affinity decides: Aggression < Vigilance.
      expect(result.map((c) => c.id)).toEqual(['B', 'A']);
    });

    it('when primary is "type", breaks ties by Cost then Name then Affinity', () => {
      const cards: CardData[] = [
        { id: 'A', Name: 'Same', Type: 'Event', Cost: 2 },
        { id: 'B', Name: 'Same', Type: 'Event', Cost: 1 },
      ];
      const result = sortCards(cards, 'type');
      expect(result.map((c) => c.id)).toEqual(['B', 'A']);
    });
  });

  describe('direction', () => {
    const NAME_CARDS: CardData[] = [
      { id: 'A', Name: 'Charlie' },
      { id: 'B', Name: 'alpha' },
      { id: 'C', Name: 'Bravo' },
    ];

    it('reverses the order when direction is "desc"', () => {
      const asc = sortCards(NAME_CARDS, 'name', [], 'asc');
      const desc = sortCards(NAME_CARDS, 'name', [], 'desc');
      expect(desc.map((c) => c.id)).toEqual([...asc.map((c) => c.id)].reverse());
    });

    it('defaults to ascending order', () => {
      expect(sortCards(NAME_CARDS, 'name')).toEqual(sortCards(NAME_CARDS, 'name', [], 'asc'));
    });
  });
});

// ─── cardTypeCategory ───────────────────────────────────────────────────────────

describe('cardTypeCategory', () => {
  it('categorizes Ground-only and mixed-arena Units as "Ground Units"', () => {
    expect(cardTypeCategory({ id: 'A', Type: 'Unit', Arenas: ['Ground'] })).toBe('Ground Units');
    expect(cardTypeCategory({ id: 'B', Type: 'Unit', Arenas: ['Ground', 'Space'] })).toBe('Ground Units');
  });

  it('categorizes Space-only Units as "Space Units"', () => {
    expect(cardTypeCategory({ id: 'C', Type: 'Unit', Arenas: ['Space'] })).toBe('Space Units');
  });

  it('returns the Type as-is for non-Unit cards', () => {
    expect(cardTypeCategory({ id: 'D', Type: 'Event' })).toBe('Event');
    expect(cardTypeCategory({ id: 'E', Type: 'Upgrade' })).toBe('Upgrade');
  });

  it('returns "Unknown" when Type is missing', () => {
    expect(cardTypeCategory({ id: 'F' })).toBe('Unknown');
  });
});
