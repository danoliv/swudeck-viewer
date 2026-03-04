// Tests for compare.js - testing deck comparison logic
const { analyzeDeckDifferences } = require('../compare.js');

describe('compare.js - Deck Comparison Logic', () => {
  describe('analyzeDeckDifferences', () => {
    test('should identify cards only in deck 1', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 0 }],
        ['SOR_003', { main: 0, sideboard: 1 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.deck1Only).toHaveLength(2);
      expect(result.deck1Only).toContainEqual({ id: 'SOR_002', main: 1, sideboard: 0 });
      expect(result.deck1Only).toContainEqual({ id: 'SOR_003', main: 0, sideboard: 1 });
    });

    test('should identify cards only in deck 2', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_004', { main: 3, sideboard: 0 }],
        ['SOR_005', { main: 0, sideboard: 1 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.deck2Only).toHaveLength(2);
      expect(result.deck2Only).toContainEqual({ id: 'SOR_004', main: 3, sideboard: 0 });
      expect(result.deck2Only).toContainEqual({ id: 'SOR_005', main: 0, sideboard: 1 });
    });

    test('should identify cards with different counts', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 3, sideboard: 0 }],
        ['SOR_002', { main: 2, sideboard: 1 }],
        ['SOR_003', { main: 1, sideboard: 0 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 2, sideboard: 1 }],
        ['SOR_003', { main: 2, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.differentCounts).toHaveLength(2);
      expect(result.differentCounts).toContainEqual({
        id: 'SOR_001',
        deck1Main: 3,
        deck1Sideboard: 0,
        deck2Main: 2,
        deck2Sideboard: 0
      });
    });

    test('should identify identical cards', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 1 }],
        ['SOR_002', { main: 1, sideboard: 0 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 1 }],
        ['SOR_002', { main: 1, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.sameCards).toHaveLength(2);
      expect(result.sameCards).toContainEqual({ id: 'SOR_001', main: 2, sideboard: 1 });
      expect(result.sameCards).toContainEqual({ id: 'SOR_002', main: 1, sideboard: 0 });
    });

    test('should handle empty decks', () => {
      const deck1Cards = new Map();
      const deck2Cards = new Map();

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.deck1Only).toHaveLength(0);
      expect(result.deck2Only).toHaveLength(0);
      expect(result.differentCounts).toHaveLength(0);
      expect(result.sameCards).toHaveLength(0);
    });

    test('should handle one empty deck', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }]
      ]);
      const deck2Cards = new Map();

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.deck1Only).toHaveLength(1);
      expect(result.deck2Only).toHaveLength(0);
    });

    test('should handle complex comparison', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 1 }],
        ['SOR_003', { main: 0, sideboard: 1 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 0 }],
        ['SOR_004', { main: 3, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.deck1Only).toHaveLength(1);
      expect(result.deck2Only).toHaveLength(1);
      expect(result.differentCounts).toHaveLength(1);
      expect(result.sameCards).toHaveLength(1);
    });

    test('should handle sideboard differences', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 1 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      expect(result.differentCounts).toHaveLength(1);
      expect(result.differentCounts[0].deck1Sideboard).toBe(1);
      expect(result.differentCounts[0].deck2Sideboard).toBe(0);
    });
  });

  describe('Deck Data Validation', () => {
    test('should validate deck has required structure', () => {
      const validDeck = {
        metadata: { name: 'Test Deck' },
        deck: [{ id: 'SOR_001', count: 2 }],
        leader: { id: 'SOR_001' }
      };

      expect(validDeck.deck).toBeDefined();
      expect(validDeck.metadata).toBeDefined();
      expect(Array.isArray(validDeck.deck)).toBe(true);
    });

    test('should handle missing metadata', () => {
      const deck = {
        deck: [{ id: 'SOR_001' }]
      };

      const deckName = deck.metadata?.name || 'Unnamed Deck';
      expect(deckName).toBe('Unnamed Deck');
    });

    test('should handle empty sideboard', () => {
      const deck = {
        deck: [{ id: 'SOR_001' }],
        sideboard: []
      };

      const sideboardSize = deck.sideboard?.length || 0;
      expect(sideboardSize).toBe(0);
    });
  });

  describe('Comparison Statistics', () => {
    test('should calculate total unique cards', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 1 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_003', { main: 1, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      const totalUnique = result.deck1Only.length + result.deck2Only.length;
      expect(totalUnique).toBe(2);
    });

    test('should count cards in multiple categories', () => {
      const deck1Cards = new Map([
        ['SOR_001', { main: 3, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 1 }],
        ['SOR_003', { main: 2, sideboard: 0 }]
      ]);

      const deck2Cards = new Map([
        ['SOR_001', { main: 2, sideboard: 0 }],
        ['SOR_002', { main: 1, sideboard: 1 }],
        ['SOR_004', { main: 1, sideboard: 0 }]
      ]);

      const result = analyzeDeckDifferences(deck1Cards, deck2Cards);

      const totalDifferences =
        result.deck1Only.length +
        result.deck2Only.length +
        result.differentCounts.length +
        result.sameCards.length;

      expect(totalDifferences).toBe(4);
    });
  });
});

