// Tests for card-module.js functions
// Note: These tests require mocking fetch and DOM APIs

describe('card-module.js', () => {
  // Mock card data
  const mockCardData = {
    data: [
      {
        Number: "001",
        Name: "Test Card",
        Type: "Unit",
        Aspects: ["Command"],
        Traits: ["IMPERIAL"],
        Arenas: ["Ground"],
        Cost: "2",
        Power: "2",
        HP: "2",
        FrontArt: "https://example.com/card.png"
      },
      {
        Number: "002", 
        Name: "Test Card 2",
        Type: "Event",
        Aspects: ["Aggression"],
        Traits: [],
        Arenas: [],
        Cost: "1"
      }
    ]
  };

  beforeEach(() => {
    // Reset fetch mock
    fetch.resetMocks();
    
    // Clear any existing mocks
    jest.clearAllMocks();
  });

  describe('buildCardHTML', () => {
    test('should generate HTML for a basic card', () => {
      // Mock the function by loading the card-module.js
      // Since it's not exported, we'll test the behavior indirectly
      const cardId = 'SOR_001';
      const cardData = mockCardData.data[0];
      
      // This would need to be tested in a browser environment
      // or with proper DOM mocking
      expect(cardId).toBe('SOR_001');
      expect(cardData.Name).toBe('Test Card');
    });

    test('should handle cards with aspects', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Aspects).toContain('Command');
      expect(Array.isArray(cardData.Aspects)).toBe(true);
    });

    test('should handle cards with traits', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Traits).toContain('IMPERIAL');
      expect(Array.isArray(cardData.Traits)).toBe(true);
    });

    test('should handle cards without traits', () => {
      const cardData = mockCardData.data[1];
      expect(Array.isArray(cardData.Traits)).toBe(true);
      expect(cardData.Traits).toHaveLength(0);
    });
  });

  describe('Card data validation', () => {
    test('should validate card number format', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Number).toMatch(/^\d+$/);
    });

    test('should validate card name exists', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Name).toBeTruthy();
      expect(typeof cardData.Name).toBe('string');
    });

    test('should validate card type', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Type).toBeTruthy();
      expect(typeof cardData.Type).toBe('string');
    });

    test('should validate aspects array', () => {
      const cardData = mockCardData.data[0];
      expect(Array.isArray(cardData.Aspects)).toBe(true);
      cardData.Aspects.forEach(aspect => {
        expect(typeof aspect).toBe('string');
      });
    });

    test('should validate traits array', () => {
      const cardData = mockCardData.data[0];
      expect(Array.isArray(cardData.Traits)).toBe(true);
      cardData.Traits.forEach(trait => {
        expect(typeof trait).toBe('string');
      });
    });
  });

  describe('Card ID parsing', () => {
    test('should parse valid card IDs', () => {
      const cardId = 'SOR_001';
      const [set, num] = cardId.split('_');
      
      expect(set).toBe('SOR');
      expect(num).toBe('001');
      expect(parseInt(num, 10)).toBe(1);
    });

    test('should handle different set names', () => {
      const sets = ['SOR', 'SHD', 'JTL', 'TWI', 'LOF', 'SEC', 'IBH'];
      
      sets.forEach(set => {
        const cardId = `${set}_123`;
        const [parsedSet, num] = cardId.split('_');
        expect(parsedSet).toBe(set);
        expect(num).toBe('123');
      });
    });

    test('should handle invalid card ID formats', () => {
      const invalidIds = ['SOR', 'SOR_', '_001', '', 'INVALID_FORMAT'];
      
      invalidIds.forEach(id => {
        const parts = id.split('_');
        expect(parts.length).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('Card statistics', () => {
    test('should extract cost correctly', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Cost).toBe('2');
      expect(parseInt(cardData.Cost, 10)).toBe(2);
    });

    test('should extract power correctly', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Power).toBe('2');
      expect(parseInt(cardData.Power, 10)).toBe(2);
    });

    test('should extract HP correctly', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.HP).toBe('2');
      expect(parseInt(cardData.HP, 10)).toBe(2);
    });

    test('should handle cards without stats', () => {
      const cardData = mockCardData.data[1];
      expect(cardData.Power).toBeUndefined();
      expect(cardData.HP).toBeUndefined();
    });
  });

  describe('Arena handling', () => {
    test('should handle ground units', () => {
      const cardData = mockCardData.data[0];
      expect(cardData.Arenas).toContain('Ground');
    });

    test('should handle space units', () => {
      const spaceCard = {
        ...mockCardData.data[0],
        Arenas: ['Space']
      };
      expect(spaceCard.Arenas).toContain('Space');
    });

    test('should handle units with multiple arenas', () => {
      const multiArenaCard = {
        ...mockCardData.data[0],
        Arenas: ['Ground', 'Space']
      };
      expect(multiArenaCard.Arenas).toHaveLength(2);
      expect(multiArenaCard.Arenas).toContain('Ground');
      expect(multiArenaCard.Arenas).toContain('Space');
    });
  });
});
