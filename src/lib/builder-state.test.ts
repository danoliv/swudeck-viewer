import { describe, it, expect } from 'vitest';
import {
  createEmptyDeck,
  encodeDeckState,
  decodeDeckState,
  setFormat,
  setLeader,
  setBase,
  setCardCount,
  addCard,
  removeCard,
  getTotalCount,
  moveToSideboard,
  moveToDeck,
} from './builder-state';
import type { DeckData } from './types';

// ─── createEmptyDeck ──────────────────────────────────────────────────────────

describe('createEmptyDeck', () => {
  it('returns a deck with an empty card list and no leader/base', () => {
    const deck = createEmptyDeck();
    expect(deck).toEqual({ deck: [] });
  });
});

// ─── encodeDeckState / decodeDeckState ───────────────────────────────────────

describe('encodeDeckState / decodeDeckState', () => {
  it('round-trips an empty deck', () => {
    const deck = createEmptyDeck();
    expect(decodeDeckState(encodeDeckState(deck))).toEqual(deck);
  });

  it('round-trips a full deck with leader, base, sideboard and metadata', () => {
    const deck: DeckData = {
      metadata: { name: 'My Deck', author: 'Han' },
      leader: { id: 'JTL_016', count: 1 },
      base: { id: 'SOR_029', count: 1 },
      deck: [{ id: 'SEC_213', count: 3 }],
      sideboard: [{ id: 'SOR_001', count: 2 }],
    };
    expect(decodeDeckState(encodeDeckState(deck))).toEqual(deck);
  });

  it('round-trips unicode in metadata', () => {
    const deck: DeckData = { deck: [], metadata: { name: 'Déck ⚔️ 名前' } };
    expect(decodeDeckState(encodeDeckState(deck))).toEqual(deck);
  });

  it('produces a URL-safe string (no +, /, =)', () => {
    const deck: DeckData = { deck: [{ id: 'SEC_213', count: 3 }], metadata: { name: 'A/B+C=' } };
    const encoded = encodeDeckState(deck);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('returns an empty deck for null/undefined/empty input', () => {
    expect(decodeDeckState(null)).toEqual(createEmptyDeck());
    expect(decodeDeckState(undefined)).toEqual(createEmptyDeck());
    expect(decodeDeckState('')).toEqual(createEmptyDeck());
  });

  it('returns an empty deck for malformed input without throwing', () => {
    expect(() => decodeDeckState('not-valid-base64!!')).not.toThrow();
    expect(decodeDeckState('not-valid-base64!!')).toEqual(createEmptyDeck());
  });

  it('coerces a non-array deck field to an empty array', () => {
    const encoded = encodeDeckState({ deck: [] });
    // Manually craft a payload where `deck` is missing/invalid
    const malformed = btoa(JSON.stringify({ leader: { id: 'JTL_016', count: 1 } }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeDeckState(malformed)).toEqual({ deck: [], leader: { id: 'JTL_016', count: 1 } });
    expect(encoded).toBeTruthy();
  });
});

// ─── setFormat ────────────────────────────────────────────────────────────────

describe('setFormat', () => {
  it('sets the format on a fresh deck', () => {
    const deck = setFormat(createEmptyDeck(), 'premier');
    expect(deck.metadata?.format).toBe('premier');
    expect(deck.deck).toEqual([]);
  });

  it('resets leader/base/deck/sideboard when changing format', () => {
    let deck = setFormat(createEmptyDeck(), 'premier');
    deck = setLeader(deck, 'JTL_016');
    deck = setBase(deck, 'SOR_029');
    deck = setCardCount(deck, 'SEC_213', 3);
    deck = setCardCount(deck, 'SOR_001', 2, true);

    deck = setFormat(deck, 'eternal');

    expect(deck.metadata?.format).toBe('eternal');
    expect(deck.leader).toBeUndefined();
    expect(deck.base).toBeUndefined();
    expect(deck.deck).toEqual([]);
    expect(deck.sideboard).toBeUndefined();
  });

  it('preserves name/description/author across a format change', () => {
    let deck = createEmptyDeck();
    deck = { ...deck, metadata: { name: 'My Deck', description: 'desc', author: 'Han' } };
    deck = setFormat(deck, 'premier');

    expect(deck.metadata).toEqual({ name: 'My Deck', description: 'desc', author: 'Han', format: 'premier' });
  });

  it('does not mutate the input deck', () => {
    const deck = setLeader(createEmptyDeck(), 'JTL_016');
    setFormat(deck, 'premier');
    expect(deck.leader).toEqual({ id: 'JTL_016', count: 1 });
    expect(deck.metadata).toBeUndefined();
  });
});

// ─── setLeader / setBase ──────────────────────────────────────────────────────

describe('setLeader', () => {
  it('sets the leader without mutating the input deck', () => {
    const deck = createEmptyDeck();
    const next = setLeader(deck, 'JTL_016');

    expect(next.leader).toEqual({ id: 'JTL_016', count: 1 });
    expect(deck.leader).toBeUndefined();
  });

  it('overwrites an existing leader', () => {
    const deck = setLeader(createEmptyDeck(), 'JTL_016');
    const next = setLeader(deck, 'SOR_002');
    expect(next.leader).toEqual({ id: 'SOR_002', count: 1 });
  });
});

describe('setBase', () => {
  it('sets the base without mutating the input deck', () => {
    const deck = createEmptyDeck();
    const next = setBase(deck, 'SOR_029');

    expect(next.base).toEqual({ id: 'SOR_029', count: 1 });
    expect(deck.base).toBeUndefined();
  });
});

// ─── setCardCount ─────────────────────────────────────────────────────────────

describe('setCardCount', () => {
  it('adds a new card to the main deck', () => {
    const deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 2 }]);
  });

  it('updates the count of an existing card', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = setCardCount(deck, 'SEC_213', 3);
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 3 }]);
  });

  it('removes the card when count is 0', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = setCardCount(deck, 'SEC_213', 0);
    expect(deck.deck).toEqual([]);
  });

  it('removes the card when count is negative', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = setCardCount(deck, 'SEC_213', -1);
    expect(deck.deck).toEqual([]);
  });

  it('targets the sideboard when sideboard=true, leaving the main deck untouched', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = setCardCount(deck, 'SOR_001', 1, true);

    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 2 }]);
    expect(deck.sideboard).toEqual([{ id: 'SOR_001', count: 1 }]);
  });

  it('does not mutate the input deck', () => {
    const deck = createEmptyDeck();
    setCardCount(deck, 'SEC_213', 2);
    expect(deck.deck).toEqual([]);
  });
});

// ─── addCard / removeCard ─────────────────────────────────────────────────────

describe('addCard', () => {
  it('adds a new card with count 1', () => {
    const deck = addCard(createEmptyDeck(), 'SEC_213');
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('increments an existing card', () => {
    let deck = addCard(createEmptyDeck(), 'SEC_213');
    deck = addCard(deck, 'SEC_213');
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 2 }]);
  });

  it('adds to the sideboard when requested', () => {
    const deck = addCard(createEmptyDeck(), 'SEC_213', true);
    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.deck).toEqual([]);
  });
});

describe('removeCard', () => {
  it('decrements an existing card', () => {
    let deck = addCard(createEmptyDeck(), 'SEC_213');
    deck = addCard(deck, 'SEC_213');
    deck = removeCard(deck, 'SEC_213');
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('removes the card entirely once count reaches 0', () => {
    let deck = addCard(createEmptyDeck(), 'SEC_213');
    deck = removeCard(deck, 'SEC_213');
    expect(deck.deck).toEqual([]);
  });

  it('is a no-op (stays at 0) when the card is not present', () => {
    const deck = removeCard(createEmptyDeck(), 'SEC_213');
    expect(deck.deck).toEqual([]);
  });
});

// ─── getTotalCount ────────────────────────────────────────────────────────────

describe('getTotalCount', () => {
  it('returns 0 for an empty deck', () => {
    expect(getTotalCount(createEmptyDeck())).toBe(0);
  });

  it('sums counts across all cards', () => {
    let deck = addCard(createEmptyDeck(), 'SEC_213');
    deck = setCardCount(deck, 'SEC_213', 3);
    deck = addCard(deck, 'SOR_001');
    expect(getTotalCount(deck)).toBe(4);
  });

  it('defaults to count 1 for entries with no explicit count', () => {
    const deck: DeckData = { deck: [{ id: 'SEC_213' }] };
    expect(getTotalCount(deck)).toBe(1);
  });

  it('does not include leader/base/sideboard', () => {
    let deck = setLeader(createEmptyDeck(), 'JTL_016');
    deck = setBase(deck, 'SOR_029');
    deck = addCard(deck, 'SOR_001', true);
    deck = addCard(deck, 'SEC_213');
    expect(getTotalCount(deck)).toBe(1);
  });
});

// ─── moveToSideboard / moveToDeck ─────────────────────────────────────────────

describe('moveToSideboard', () => {
  it('moves one copy from the main deck to the sideboard', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = moveToSideboard(deck, 'SEC_213');

    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('removes the card from the main deck once its count reaches 0', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 1);
    deck = moveToSideboard(deck, 'SEC_213');

    expect(deck.deck).toEqual([]);
    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('adds to an existing sideboard count', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    deck = setCardCount(deck, 'SEC_213', 1, true);
    deck = moveToSideboard(deck, 'SEC_213');

    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 2 }]);
  });

  it('is a no-op when the card has no copies in the main deck', () => {
    const deck = createEmptyDeck();
    expect(moveToSideboard(deck, 'SEC_213')).toEqual(deck);
  });

  it('is a no-op when the sideboard is already at the 3-copy cap', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 1);
    deck = setCardCount(deck, 'SEC_213', 3, true);
    expect(moveToSideboard(deck, 'SEC_213')).toEqual(deck);
  });

  it('does not mutate the input deck', () => {
    const deck = setCardCount(createEmptyDeck(), 'SEC_213', 2);
    moveToSideboard(deck, 'SEC_213');
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 2 }]);
    expect(deck.sideboard).toBeUndefined();
  });
});

describe('moveToDeck', () => {
  it('moves one copy from the sideboard to the main deck', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 2, true);
    deck = moveToDeck(deck, 'SEC_213');

    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('removes the card from the sideboard once its count reaches 0', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 1, true);
    deck = moveToDeck(deck, 'SEC_213');

    expect(deck.sideboard).toEqual([]);
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 1 }]);
  });

  it('adds to an existing main-deck count', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 1);
    deck = setCardCount(deck, 'SEC_213', 2, true);
    deck = moveToDeck(deck, 'SEC_213');

    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.deck).toEqual([{ id: 'SEC_213', count: 2 }]);
  });

  it('is a no-op when the card has no copies in the sideboard', () => {
    const deck = createEmptyDeck();
    expect(moveToDeck(deck, 'SEC_213')).toEqual(deck);
  });

  it('is a no-op when the main deck is already at the 3-copy cap', () => {
    let deck = setCardCount(createEmptyDeck(), 'SEC_213', 3);
    deck = setCardCount(deck, 'SEC_213', 1, true);
    expect(moveToDeck(deck, 'SEC_213')).toEqual(deck);
  });

  it('does not mutate the input deck', () => {
    const deck = setCardCount(createEmptyDeck(), 'SEC_213', 1, true);
    moveToDeck(deck, 'SEC_213');
    expect(deck.sideboard).toEqual([{ id: 'SEC_213', count: 1 }]);
    expect(deck.deck).toEqual([]);
  });
});
