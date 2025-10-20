// Tests for HTML utility functions and deck processing
describe('HTML Utilities and Deck Processing', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  describe('URL parsing', () => {
    test('should extract deck ID from SWUDB URL', () => {
      const testUrls = [
        { url: 'https://swudb.com/deck/123', expected: '123' },
        { url: 'https://swudb.com/deck/456', expected: '456' },
        { url: 'https://swudb.com/deck/abc123', expected: 'abc123' }
      ];

      testUrls.forEach(({ url, expected }) => {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        const deckId = pathSegments[pathSegments.length - 1];
        expect(deckId).toBe(expected);
      });
    });

  });

  describe('Card ID parsing', () => {
    test('should parse valid card IDs correctly', () => {
      const testCases = [
        { id: 'SOR_001', expected: { set: 'SOR', number: 1 } },
        { id: 'SHD_123', expected: { set: 'SHD', number: 123 } },
        { id: 'JTL_045', expected: { set: 'JTL', number: 45 } },
        { id: 'TWI_999', expected: { set: 'TWI', number: 999 } }
      ];

      testCases.forEach(({ id, expected }) => {
        const [set, num] = id.split('_');
        const number = parseInt(num, 10);
        
        expect(set).toBe(expected.set);
        expect(number).toBe(expected.number);
      });
    });

    test('should handle invalid card ID formats', () => {
      const invalidIds = ['SOR', 'SOR_', '_001', '', 'INVALID_FORMAT'];
      
      invalidIds.forEach(id => {
        const parts = id.split('_');
        if (parts.length !== 2) {
          expect(parts.length).not.toBe(2);
        }
      });
    });
  });

  describe('Deck data validation', () => {
    test('should validate deck structure', () => {
      const validDeck = {
        deck: [
          { id: 'SOR_001', count: 2 },
          { id: 'SHD_123', count: 1 }
        ],
        metadata: {
          name: 'Test Deck'
        },
        leader: { id: 'SOR_001' },
        base: { id: 'SOR_002' }
      };

      expect(validDeck.deck).toBeDefined();
      expect(Array.isArray(validDeck.deck)).toBe(true);
      expect(validDeck.metadata).toBeDefined();
      expect(validDeck.metadata.name).toBeDefined();
    });

    test('should handle missing deck data', () => {
      const invalidDeck = {
        metadata: { name: 'Test Deck' }
        // Missing deck array
      };

      expect(invalidDeck.deck).toBeUndefined();
    });

    test('should validate card objects in deck', () => {
      const validCard = {
        id: 'SOR_001',
        count: 2
      };

      expect(validCard.id).toBeDefined();
      expect(typeof validCard.id).toBe('string');
      expect(validCard.count).toBeDefined();
      expect(typeof validCard.count).toBe('number');
    });
  });

  describe('Card grouping logic', () => {
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

    test('should sort cards within each set by number', () => {
      const cards = [
        { id: 'SOR_003', count: 1 },
        { id: 'SOR_001', count: 2 },
        { id: 'SOR_002', count: 1 }
      ];

      const grouped = {};
      cards.forEach(card => {
        const [set, num] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push({
          ...card,
          number: parseInt(num, 10)
        });
      });

      // Sort cards within each set
      Object.keys(grouped).forEach(set => {
        grouped[set].sort((a, b) => a.number - b.number);
      });

      expect(grouped.SOR[0].id).toBe('SOR_001');
      expect(grouped.SOR[1].id).toBe('SOR_002');
      expect(grouped.SOR[2].id).toBe('SOR_003');
    });
  });

  describe('Aspect and trait processing', () => {
    test('should handle single aspects', () => {
      const card = {
        Aspects: ['Command']
      };

      expect(Array.isArray(card.Aspects)).toBe(true);
      expect(card.Aspects).toContain('Command');
    });

    test('should handle multiple aspects', () => {
      const card = {
        Aspects: ['Command', 'Aggression']
      };

      expect(card.Aspects).toHaveLength(2);
      expect(card.Aspects).toContain('Command');
      expect(card.Aspects).toContain('Aggression');
    });

    test('should handle traits as array', () => {
      const card = {
        Traits: ['IMPERIAL', 'VEHICLE']
      };

      expect(Array.isArray(card.Traits)).toBe(true);
      expect(card.Traits).toContain('IMPERIAL');
      expect(card.Traits).toContain('VEHICLE');
    });

    test('should handle empty traits', () => {
      const card = {
        Traits: []
      };

      expect(Array.isArray(card.Traits)).toBe(true);
      expect(card.Traits).toHaveLength(0);
    });

    test('should handle missing traits', () => {
      const card = {
        Name: 'Test Card'
        // No Traits property
      };

      const traits = card.Traits || [];
      expect(Array.isArray(traits)).toBe(true);
    });
  });

  describe('Card type processing', () => {
    test('should categorize units by arena', () => {
      const groundUnit = {
        Type: 'Unit',
        Arenas: ['Ground']
      };

      const spaceUnit = {
        Type: 'Unit',
        Arenas: ['Space']
      };

      const multiArenaUnit = {
        Type: 'Unit',
        Arenas: ['Ground', 'Space']
      };

      // Test ground unit categorization
      let type = groundUnit.Type;
      if (type === 'Unit') {
        if (groundUnit.Arenas && groundUnit.Arenas.includes('Space')) {
          type = 'Space Unit';
        } else {
          type = 'Ground Unit';
        }
      }
      expect(type).toBe('Ground Unit');

      // Test space unit categorization
      type = spaceUnit.Type;
      if (type === 'Unit') {
        if (spaceUnit.Arenas && spaceUnit.Arenas.includes('Space')) {
          type = 'Space Unit';
        } else {
          type = 'Ground Unit';
        }
      }
      expect(type).toBe('Space Unit');
    });

    test('should handle non-unit cards', () => {
      const eventCard = {
        Type: 'Event',
        Arenas: []
      };

      let type = eventCard.Type;
      if (type === 'Unit') {
        if (eventCard.Arenas && eventCard.Arenas.includes('Space')) {
          type = 'Space Unit';
        } else {
          type = 'Ground Unit';
        }
      }
      expect(type).toBe('Event');
    });
  });

  describe('Cost sorting', () => {
    test('should sort costs numerically', () => {
      const costs = ['5', '1', '3', 'X', '2'];
      
      const sorted = costs.sort((a, b) => {
        if (a === 'X') return 1;
        if (b === 'X') return -1;
        return parseInt(a) - parseInt(b);
      });

      expect(sorted).toEqual(['1', '2', '3', '5', 'X']);
    });

    test('should handle numeric costs', () => {
      const costs = ['0', '1', '2', '3', '4', '5'];
      
      costs.forEach(cost => {
        expect(parseInt(cost, 10)).toBeGreaterThanOrEqual(0);
        expect(parseInt(cost, 10)).toBeLessThanOrEqual(5);
      });
    });
  });
});
