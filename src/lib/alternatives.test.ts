import { describe, it, expect } from 'vitest';
import { findAlternatives, type StatsLookup } from './alternatives';
import type { CardData } from './cards';
import type { CardStats } from './stats';

const base: CardData = { id: 'SOR_001', Name: 'Base Unit', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };

function statsLookup(map: Record<string, CardStats>): StatsLookup {
  return (id) => map[id] ?? null;
}

describe('findAlternatives', () => {
  it('returns nothing when Cost or Type is missing', () => {
    expect(findAlternatives('SOR_001', { ...base, Cost: undefined }, [base])).toEqual([]);
    expect(findAlternatives('SOR_001', { ...base, Type: undefined }, [base])).toEqual([]);
  });

  it('excludes the card itself and cards of a different cost or type', () => {
    const pool: CardData[] = [
      base,
      { id: 'SOR_002', Name: 'Wrong Cost', Type: 'Unit', Cost: 4, Power: 5, HP: 5 },
      { id: 'SOR_003', Name: 'Wrong Type', Type: 'Event', Cost: 3, Power: 5, HP: 5 },
    ];
    expect(findAlternatives('SOR_001', base, pool)).toEqual([]);
  });

  it('excludes candidates in a different Arena', () => {
    const groundUnit: CardData = { ...base, Arenas: ['Ground'] };
    const spaceUnit: CardData = { id: 'SOR_060', Name: 'Space Unit', Type: 'Unit', Cost: 3, Power: 5, HP: 3, Arenas: ['Space'] };
    const groundMatch: CardData = { id: 'SOR_061', Name: 'Ground Match', Type: 'Unit', Cost: 3, Power: 5, HP: 3, Arenas: ['Ground'] };

    const result = findAlternatives('SOR_001', groundUnit, [groundUnit, spaceUnit, groundMatch]);
    expect(result).toEqual([{ card: groundMatch, reasons: ['More Power (5 vs 3)'] }]);
  });

  it('qualifies a candidate with more Power at the same HP', () => {
    const better: CardData = { id: 'SOR_010', Name: 'Better Power', Type: 'Unit', Cost: 3, Power: 5, HP: 3 };
    const result = findAlternatives('SOR_001', base, [base, better]);
    expect(result).toEqual([{ card: better, reasons: ['More Power (5 vs 3)'] }]);
  });

  it('qualifies a candidate with more HP at the same Power', () => {
    const better: CardData = { id: 'SOR_011', Name: 'Better HP', Type: 'Unit', Cost: 3, Power: 3, HP: 6 };
    const result = findAlternatives('SOR_001', base, [base, better]);
    expect(result).toEqual([{ card: better, reasons: ['More HP (6 vs 3)'] }]);
  });

  it('does not qualify a candidate that is worse in one stat even if better in the other', () => {
    const mixed: CardData = { id: 'SOR_012', Name: 'Mixed', Type: 'Unit', Cost: 3, Power: 5, HP: 2 };
    expect(findAlternatives('SOR_001', base, [base, mixed])).toEqual([]);
  });

  it('qualifies via higher popularity or win rate when stats are available', () => {
    const popular: CardData = { id: 'SOR_020', Name: 'Popular', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };
    const winner: CardData = { id: 'SOR_021', Name: 'Winner', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };
    const lookup = statsLookup({
      SOR_001: { deckCount: 10, winRate: 50, inclusionRate: 20 },
      SOR_020: { deckCount: 10, winRate: 50, inclusionRate: 40 },
      SOR_021: { deckCount: 10, winRate: 70, inclusionRate: 20 },
    });

    const result = findAlternatives('SOR_001', base, [base, popular, winner], lookup);
    expect(result).toEqual([
      { card: popular, reasons: ['Higher popularity (40% vs 20%)'] },
      { card: winner, reasons: ['Higher win rate (70% vs 50%)'] },
    ]);
  });

  it('does not compare stats when either card lacks them', () => {
    const candidate: CardData = { id: 'SOR_030', Name: 'No Stats', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };
    const lookup = statsLookup({ SOR_030: { deckCount: 10, winRate: 90, inclusionRate: 90 } });
    expect(findAlternatives('SOR_001', base, [base, candidate], lookup)).toEqual([]);
  });

  it('excludes candidates missing one of the card\'s Keywords', () => {
    const sentinelPilot: CardData = { ...base, Keywords: ['Piloting', 'Sentinel'] };
    const noKeywords: CardData = { id: 'SOR_050', Name: 'No Keywords', Type: 'Unit', Cost: 3, Power: 5, HP: 3 };
    const partialMatch: CardData = { id: 'SOR_051', Name: 'Partial', Type: 'Unit', Cost: 3, Power: 5, HP: 3, Keywords: ['Sentinel'] };
    const sameKeywordsDifferentOrder: CardData = {
      id: 'SOR_052',
      Name: 'Same Keywords',
      Type: 'Unit',
      Cost: 3,
      Power: 5,
      HP: 3,
      Keywords: ['sentinel', 'PILOTING'],
    };

    const result = findAlternatives('SOR_001', sentinelPilot, [sentinelPilot, noKeywords, partialMatch, sameKeywordsDifferentOrder]);
    expect(result).toEqual([{ card: sameKeywordsDifferentOrder, reasons: ['More Power (5 vs 3)'] }]);
  });

  it('qualifies a candidate that carries extra keywords on top of the card\'s own', () => {
    const sentinelPilot: CardData = { ...base, Keywords: ['Piloting', 'Sentinel'] };
    const superset: CardData = {
      id: 'SOR_053',
      Name: 'Superset',
      Type: 'Unit',
      Cost: 3,
      Power: 5,
      HP: 3,
      Keywords: ['Sentinel', 'Piloting', 'Raid'],
    };

    const result = findAlternatives('SOR_001', sentinelPilot, [sentinelPilot, superset]);
    expect(result).toEqual([{ card: superset, reasons: ['More Power (5 vs 3)'] }]);
  });

  describe('Raid substitution', () => {
    const raidOne: CardData = {
      id: 'LOF_228',
      Name: 'Raid One',
      Type: 'Unit',
      Cost: 1,
      Power: 1,
      HP: 1,
      Keywords: ['Raid'],
      FrontText: 'Raid 1 (This unit gets +1/+0 while attacking.)',
    };

    it('does not require the Raid keyword itself — raw Power can substitute for it', () => {
      const rawPowerThree: CardData = { id: 'LOF_229', Name: 'No Raid', Type: 'Unit', Cost: 1, Power: 3, HP: 1 };
      const result = findAlternatives('LOF_228', raidOne, [raidOne, rawPowerThree]);
      expect(result).toEqual([{ card: rawPowerThree, reasons: ['More effective Power incl. Raid (3 vs 2)'] }]);
    });

    it('is not a valid alternative when it merely matches effective Power without beating it', () => {
      const rawPowerTwo: CardData = { id: 'LOF_229', Name: 'No Raid', Type: 'Unit', Cost: 1, Power: 2, HP: 1 };
      // Same effective Power (2), same HP (1) as raidOne — not "better", so no reasons.
      expect(findAlternatives('LOF_228', rawPowerTwo, [rawPowerTwo, raidOne])).toEqual([]);
    });

    it('qualifies a candidate with a higher Raid value over the same base Power/HP', () => {
      const raidTwo: CardData = {
        id: 'LOF_230',
        Name: 'Raid Two',
        Type: 'Unit',
        Cost: 1,
        Power: 1,
        HP: 1,
        Keywords: ['Raid'],
        FrontText: 'Raid 2 (This unit gets +2/+0 while attacking.)',
      };
      const result = findAlternatives('LOF_228', raidOne, [raidOne, raidTwo]);
      expect(result).toEqual([{ card: raidTwo, reasons: ['More effective Power incl. Raid (3 vs 2)'] }]);
    });
  });

  it('sorts candidates with more qualifying reasons first, then alphabetically', () => {
    const oneReason: CardData = { id: 'SOR_040', Name: 'Zeta One Reason', Type: 'Unit', Cost: 3, Power: 5, HP: 3 };
    const twoReasonsA: CardData = { id: 'SOR_041', Name: 'B Two Reasons', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };
    const twoReasonsB: CardData = { id: 'SOR_042', Name: 'A Two Reasons', Type: 'Unit', Cost: 3, Power: 3, HP: 3 };
    const lookup = statsLookup({
      SOR_001: { deckCount: 10, winRate: 50, inclusionRate: 20 },
      SOR_041: { deckCount: 10, winRate: 70, inclusionRate: 40 },
      SOR_042: { deckCount: 10, winRate: 70, inclusionRate: 40 },
    });

    const result = findAlternatives('SOR_001', base, [base, oneReason, twoReasonsA, twoReasonsB], lookup);
    expect(result.map((r) => r.card.id)).toEqual(['SOR_042', 'SOR_041', 'SOR_040']);
  });
});
