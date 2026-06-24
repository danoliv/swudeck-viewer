import { describe, it, expect } from 'vitest';
import { exportToMeleeText, exportToSwudbJson } from './export';
import { parseMeleeDecklist, mapSwudbToDeckData } from './import';
import type { CardData } from './cards';
import type { DeckData } from './types';

const CARDS: CardData[] = [
  { id: 'SOR_001', Set: 'SOR', Name: 'Leia Organa, Defiant Princess' },
  { id: 'SOR_002', Set: 'SOR', Name: 'Echo Base' },
  { id: 'SOR_003', Set: 'SOR', Name: 'Wampa' },
  { id: 'SOR_004', Set: 'SOR', Name: 'Vanguard Infiltrator' },
];

const DECK: DeckData = {
  leader: { id: 'SOR_001', count: 1 },
  base: { id: 'SOR_002', count: 1 },
  deck: [
    { id: 'SOR_003', count: 2 },
    { id: 'SOR_004', count: 3 },
  ],
  sideboard: [{ id: 'SOR_004', count: 1 }],
};

describe('exportToMeleeText', () => {
  it('round-trips through parseMeleeDecklist back to the same deck shape', () => {
    const text = exportToMeleeText(DECK, CARDS);
    const { deckData, unmatchedLines } = parseMeleeDecklist(text, CARDS);

    expect(unmatchedLines).toEqual([]);
    expect(deckData.leader).toEqual(DECK.leader);
    expect(deckData.base).toEqual(DECK.base);
    expect(deckData.deck).toEqual(DECK.deck);
    expect(deckData.sideboard).toEqual(DECK.sideboard);
  });

  it('uses card names, not ids, and includes a Sideboard: header', () => {
    const text = exportToMeleeText(DECK, CARDS);
    expect(text).toContain('Leader: Leia Organa, Defiant Princess');
    expect(text).toContain('Base: Echo Base');
    expect(text).toContain('2 Wampa');
    expect(text).toContain('3 Vanguard Infiltrator');
    expect(text).toContain('Sideboard:');
  });

  it('omits the Sideboard section when there is no sideboard', () => {
    const text = exportToMeleeText({ ...DECK, sideboard: undefined }, CARDS);
    expect(text).not.toContain('Sideboard');
  });

  it('omits leader/base lines when absent', () => {
    const text = exportToMeleeText({ deck: DECK.deck }, CARDS);
    expect(text).not.toContain('Leader:');
    expect(text).not.toContain('Base:');
  });
});

describe('exportToSwudbJson', () => {
  it('round-trips through mapSwudbToDeckData back to the same deck shape', () => {
    const json = exportToSwudbJson(DECK);
    const deckData = mapSwudbToDeckData(JSON.parse(json));

    expect(deckData.leader).toEqual(DECK.leader);
    expect(deckData.base).toEqual(DECK.base);
    expect(deckData.deck).toEqual(DECK.deck);
    expect(deckData.sideboard).toEqual(DECK.sideboard);
  });

  it('includes metadata.name when the deck has one, omits it otherwise', () => {
    const named = JSON.parse(exportToSwudbJson({ ...DECK, metadata: { name: 'My Deck' } }));
    expect(named.metadata).toEqual({ name: 'My Deck' });

    const unnamed = JSON.parse(exportToSwudbJson(DECK));
    expect(unnamed.metadata).toBeUndefined();
  });

  it('omits sideboard/leader/base keys when absent', () => {
    const json = JSON.parse(exportToSwudbJson({ deck: DECK.deck }));
    expect(json.sideboard).toBeUndefined();
    expect(json.leader).toBeUndefined();
    expect(json.base).toBeUndefined();
  });
});
