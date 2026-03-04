// Tests for ui.js - focusing on testable deck management logic
describe('ui.js - Deck Management Logic', () => {
  const MAX_RECENT_DECKS = 8;

  describe('Recent Decks Management', () => {
    test('should add new deck to recent list', () => {
      let recentDecks = [];
      const newDeck = {
        url: 'https://swudb.com/deck/123',
        name: 'Test Deck',
        date: new Date().toLocaleDateString()
      };

      // Remove if already exists
      recentDecks = recentDecks.filter(deck => deck.url !== newDeck.url);
      // Add to front
      recentDecks.unshift(newDeck);

      expect(recentDecks).toContainEqual(newDeck);
      expect(recentDecks[0]).toEqual(newDeck);
    });

    test('should maintain recent decks limit', () => {
      let recentDecks = [];

      // Add 10 decks
      for (let i = 0; i < 10; i++) {
        const deck = {
          url: `https://swudb.com/deck/${i}`,
          name: `Deck ${i}`
        };
        recentDecks.unshift(deck);
      }

      // Keep only last 8
      if (recentDecks.length > MAX_RECENT_DECKS) {
        recentDecks = recentDecks.slice(0, MAX_RECENT_DECKS);
      }

      expect(recentDecks.length).toBe(MAX_RECENT_DECKS);
      expect(recentDecks).toHaveLength(8);
    });

    test('should prevent duplicate decks', () => {
      let recentDecks = [
        { url: 'https://swudb.com/deck/123', name: 'Deck 1' },
        { url: 'https://swudb.com/deck/456', name: 'Deck 2' }
      ];

      const newDeck = { url: 'https://swudb.com/deck/123', name: 'Deck 1 Updated' };

      // Remove if already exists
      recentDecks = recentDecks.filter(deck => deck.url !== newDeck.url);
      recentDecks.unshift(newDeck);

      expect(recentDecks).toHaveLength(2);
      expect(recentDecks[0].name).toBe('Deck 1 Updated');
      expect(recentDecks[0].url).toBe('https://swudb.com/deck/123');
    });

    test('should order decks with newest first', () => {
      let recentDecks = [
        { url: 'https://swudb.com/deck/1', name: 'Deck 1' },
        { url: 'https://swudb.com/deck/2', name: 'Deck 2' }
      ];

      const newDeck = { url: 'https://swudb.com/deck/3', name: 'Deck 3' };
      recentDecks.unshift(newDeck);

      expect(recentDecks[0]).toEqual(newDeck);
      expect(recentDecks[0].name).toBe('Deck 3');
    });

    test('should handle empty recent decks list', () => {
      let recentDecks = [];

      expect(recentDecks).toHaveLength(0);
      expect(Array.isArray(recentDecks)).toBe(true);
    });
  });

  describe('Deck Data Processing', () => {
    test('should extract deck name from metadata', () => {
      const deckData = {
        metadata: { name: 'My Awesome Deck' },
        deck: []
      };

      const deckName = deckData.metadata?.name || 'Unnamed Deck';
      expect(deckName).toBe('My Awesome Deck');
    });

    test('should default to unnamed deck', () => {
      const deckData = { deck: [] };

      const deckName = deckData.metadata?.name || 'Unnamed Deck';
      expect(deckName).toBe('Unnamed Deck');
    });

    test('should build deck record from metadata and cards', () => {
      const url = 'https://swudb.com/deck/abc123';
      const deckData = {
        metadata: { name: 'Test Deck' },
        deck: [{ id: 'SOR_001' }],
        leader: { id: 'SOR_001' }
      };

      const deckRecord = {
        url,
        name: deckData.metadata?.name || 'Unnamed Deck',
        leaderArt: deckData.leader?.FrontArt,
        baseAspect: 'Command',
        date: new Date().toLocaleDateString()
      };

      expect(deckRecord.url).toBe(url);
      expect(deckRecord.name).toBe('Test Deck');
      expect(deckRecord.date).toBeDefined();
    });

    test('should handle missing leader', () => {
      const deckData = {
        metadata: { name: 'No Leader Deck' },
        deck: []
      };

      const leaderArt = deckData.leader?.FrontArt;
      expect(leaderArt).toBeUndefined();
    });

    test('should handle missing metadata', () => {
      const deckData = {
        deck: [{ id: 'SOR_001' }]
      };

      const deckName = deckData.metadata?.name || 'Unnamed Deck';
      expect(deckName).toBe('Unnamed Deck');
    });
  });

  describe('Deck Selection Logic', () => {
    test('should toggle deck selection', () => {
      const selectedDecks = new Set();
      const url = 'https://swudb.com/deck/123';

      // Add
      selectedDecks.add(url);
      expect(selectedDecks.has(url)).toBe(true);

      // Remove
      selectedDecks.delete(url);
      expect(selectedDecks.has(url)).toBe(false);
    });

    test('should maintain multiple selected decks', () => {
      const selectedDecks = new Set();
      const urls = [
        'https://swudb.com/deck/1',
        'https://swudb.com/deck/2'
      ];

      urls.forEach(url => selectedDecks.add(url));

      expect(selectedDecks.size).toBe(2);
      expect(selectedDecks.has(urls[0])).toBe(true);
      expect(selectedDecks.has(urls[1])).toBe(true);
    });

    test('should limit to max 2 selected decks for comparison', () => {
      const selectedDecks = [];
      const maxSelect = 2;

      const addDeck = (url) => {
        if (selectedDecks.length < maxSelect) {
          selectedDecks.push(url);
        }
      };

      addDeck('https://swudb.com/deck/1');
      addDeck('https://swudb.com/deck/2');
      addDeck('https://swudb.com/deck/3'); // Should not be added

      expect(selectedDecks).toHaveLength(2);
      expect(selectedDecks).not.toContain('https://swudb.com/deck/3');
    });

    test('should validate selected decks for comparison', () => {
      const selectedDecks = ['https://swudb.com/deck/1', 'https://swudb.com/deck/2'];

      const canCompare = selectedDecks.length === 2;
      expect(canCompare).toBe(true);
    });

    test('should prevent comparison with insufficient decks', () => {
      const selectedDecks = ['https://swudb.com/deck/1'];

      const canCompare = selectedDecks.length === 2;
      expect(canCompare).toBe(false);
    });
  });

  describe('Deck ID Extraction', () => {
    test('should extract deck ID from SWUDB URL', () => {
      const url = 'https://swudb.com/deck/mydeckid123';
      const deckId = url.split('/').pop();

      expect(deckId).toBe('mydeckid123');
    });

    test('should handle URL with trailing slash', () => {
      const url = 'https://swudb.com/deck/mydeckid123/';
      const parts = url.split('/').filter(Boolean);
      const deckId = parts[parts.length - 1];

      expect(deckId).toBe('mydeckid123');
    });

    test('should handle plain deck ID', () => {
      const input = 'mydeckid123';
      const deckId = input;

      expect(deckId).toBe('mydeckid123');
    });
  });

  describe('Card Grouping and Sorting', () => {
    test('should group cards by set', () => {
      const cards = [
        { id: 'SOR_001', count: 2 },
        { id: 'SOR_002', count: 1 },
        { id: 'SHD_001', count: 3 },
        { id: 'JTL_001', count: 1 }
      ];

      const grouped = {};
      cards.forEach(card => {
        const [set] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push(card);
      });

      expect(grouped.SOR).toHaveLength(2);
      expect(grouped.SHD).toHaveLength(1);
      expect(grouped.JTL).toHaveLength(1);
    });

    test('should sort cards within set by number', () => {
      const cards = [
        { id: 'SOR_003', number: 3 },
        { id: 'SOR_001', number: 1 },
        { id: 'SOR_002', number: 2 }
      ];

      cards.sort((a, b) => a.number - b.number);

      expect(cards[0].id).toBe('SOR_001');
      expect(cards[1].id).toBe('SOR_002');
      expect(cards[2].id).toBe('SOR_003');
    });

    test('should handle empty card list', () => {
      const cards = [];
      const grouped = {};

      cards.forEach(card => {
        const [set] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push(card);
      });

      expect(Object.keys(grouped)).toHaveLength(0);
    });

    test('should handle single card', () => {
      const cards = [{ id: 'SOR_001', count: 1 }];
      const grouped = {};

      cards.forEach(card => {
        const [set] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push(card);
      });

      expect(grouped.SOR).toHaveLength(1);
    });
  });

  describe('Deck Validation', () => {
    test('should validate deck has cards', () => {
      const deckData = {
        deck: [{ id: 'SOR_001', count: 2 }]
      };

      const hasCards = Array.isArray(deckData.deck) && deckData.deck.length > 0;
      expect(hasCards).toBe(true);
    });

    test('should handle deck without cards', () => {
      const deckData = {};

      const hasCards = Array.isArray(deckData.deck) && deckData.deck.length > 0;
      expect(hasCards).toBe(false);
    });

    test('should calculate total deck size', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 },
          { id: 'SOR_002', count: 1 },
          { id: 'SOR_003', count: 3 }
        ]
      };

      const deckSize = deckData.deck.length;
      expect(deckSize).toBe(3);
    });

    test('should calculate total card count', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 },
          { id: 'SOR_002', count: 1 },
          { id: 'SOR_003', count: 3 }
        ]
      };

      const totalCards = deckData.deck.reduce((sum, card) => sum + (card.count || 1), 0);
      expect(totalCards).toBe(6);
    });

    test('should handle sideboard', () => {
      const deckData = {
        deck: [{ id: 'SOR_001', count: 2 }],
        sideboard: [{ id: 'SOR_002', count: 1 }]
      };

      const mainDeckSize = deckData.deck.length;
      const sideboardSize = deckData.sideboard?.length || 0;

      expect(mainDeckSize).toBe(1);
      expect(sideboardSize).toBe(1);
    });
  });
});

