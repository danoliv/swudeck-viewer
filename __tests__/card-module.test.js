// Tests for card-module.js functions
// Import the actual functions from card-module.js
const {
  loadCardSet,
  fetchCardData,
  buildCardHTML,
  buildComparisonCardHTML,
  clearCardCache
} = require('../card-module.js');

describe('card-module.js', () => {
  // Mock card data matching the real data structure
  const mockCardData = {
    data: [
      {
        Number: "1",
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
        Number: "2",
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
    
    // Clear any existing mocks and cache
    jest.clearAllMocks();
    clearCardCache();
  });

  describe('loadCardSet', () => {
    test('should load and cache card set data', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      const result = await loadCardSet('SOR');

      expect(fetch).toHaveBeenCalledWith('data/sor.json');
      expect(result).toBeDefined();
      expect(result[1]).toBeDefined();
      expect(result[1].Name).toBe('Test Card');
    });

    test('should return cached data on subsequent calls', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      await loadCardSet('SOR');
      const result = await loadCardSet('SOR');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result[1]).toBeDefined();
    });

    test('should handle fetch errors', async () => {
      fetch.mockRejectOnce(new Error('Network error'));

      await expect(loadCardSet('INVALID')).rejects.toThrow();
    });

    test('should handle HTTP errors', async () => {
      fetch.mockResponseOnce('Not found', { status: 404 });

      await expect(loadCardSet('NOTFOUND')).rejects.toThrow('Failed to load NOTFOUND data: 404');
    });

    test('should index cards by number', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      const result = await loadCardSet('SOR');

      expect(result[1]).toBeDefined();
      expect(result[1].Number).toBe("1");
      expect(result[2]).toBeDefined();
      expect(result[2].Number).toBe("2");
    });
  });

  describe('fetchCardData', () => {
    test('should fetch card data by ID', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      const cardData = await fetchCardData('SOR_1');

      expect(cardData).toBeDefined();
      expect(cardData.id).toBe('SOR_1');
      expect(cardData.Name).toBe('Test Card');
      expect(cardData.Type).toBe('Unit');
    });

    test('should add card ID to the data', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      const cardData = await fetchCardData('SOR_1');

      expect(cardData.id).toBe('SOR_1');
    });

    test('should handle missing cards gracefully', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      const cardData = await fetchCardData('SOR_999');

      expect(cardData).toBeDefined();
      expect(cardData.id).toBe('SOR_999');
      expect(cardData.Name).toBe('SOR_999');
      expect(cardData.Type).toBe('Unknown');
    });

    test('should handle fetch errors gracefully', async () => {
      fetch.mockRejectOnce(new Error('Network error'));

      const cardData = await fetchCardData('SOR_1');

      expect(cardData).toBeDefined();
      expect(cardData.id).toBe('SOR_1');
      expect(cardData.Type).toBe('Unknown');
    });

    test('should parse card ID correctly', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      await fetchCardData('SOR_1');

      expect(fetch).toHaveBeenCalledWith('data/sor.json');
    });
  });

  describe('buildCardHTML', () => {
    test('should generate HTML for a basic card', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData, 1);

      expect(html).toContain('SOR 001');
      expect(html).toContain('Test Card');
      expect(html).toContain('Deck: 1');
    });

    test('should handle cards with aspects', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData);

      expect(html).toContain('aspects');
      expect(html).toContain('Command');
    });

    test('should handle cards without aspects', () => {
      const cardData = { ...mockCardData.data[0], Aspects: [] };
      const html = buildCardHTML('SOR_001', cardData);

      expect(html).not.toContain('aspects');
    });

    test('should display card stats', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData);

      expect(html).toContain('Cost');
      expect(html).toContain('Power');
      expect(html).toContain('HP');
      expect(html).toContain('>2<');
    });

    test('should handle sideboard count', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData, 2, 1);

      expect(html).toContain('Deck: 2');
      expect(html).toContain('Side: 1');
    });

    test('should handle only sideboard count', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData, 0, 2);

      expect(html).toContain('Side: 2');
      expect(html).not.toContain('Deck:');
    });

    test('should handle double-sided cards', () => {
      const cardData = { ...mockCardData.data[0], DoubleSided: true, BackArt: 'https://example.com/back.png' };
      const html = buildCardHTML('SOR_001', cardData);

      expect(html).toContain('flip-button');
      expect(html).toContain('Flip Card');
      expect(html).toContain('card-back');
    });

    test('should handle cards without images', () => {
      const cardData = { ...mockCardData.data[0], FrontArt: undefined };
      const html = buildCardHTML('SOR_001', cardData);

      expect(html).toContain('card-placeholder');
      expect(html).toContain('SOR_001');
    });

    test('should include additional CSS classes', () => {
      const cardData = mockCardData.data[0];
      const html = buildCardHTML('SOR_001', cardData, 1, 0, 'highlighted');

      expect(html).toContain('class="card highlighted"');
    });
  });

  describe('buildComparisonCardHTML', () => {
    test('should generate comparison HTML for a card', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 2, 1, 'both');

      expect(html).toContain('Test Card');
      expect(html).toContain('Deck 1: 2');
      expect(html).toContain('Deck 2: 1');
    });

    test('should handle comparison type classes', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 2, 0, 'deck1-only');

      expect(html).toContain('class="card deck1-only"');
    });

    test('should handle custom deck names', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 2, 1, 'both', 'My Deck', 'Other Deck');

      expect(html).toContain('My Deck: 2');
      expect(html).toContain('Other Deck: 1');
    });

    test('should handle sideboard counts in comparison', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 2, 1, 'both', 'Deck 1', 'Deck 2', 1, 1);

      expect(html).toContain('(1 side)');
    });

    test('should handle card in deck 1 only', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 2, 0);

      expect(html).toContain('Deck 1: 2');
      expect(html).not.toContain('Deck 2');
    });

    test('should handle card in deck 2 only', () => {
      const cardData = mockCardData.data[0];
      const html = buildComparisonCardHTML('SOR_001', cardData, 0, 3);

      expect(html).toContain('Deck 2: 3');
      expect(html).not.toContain('Deck 1');
    });
  });

  describe('clearCardCache', () => {
    test('should clear the card cache', async () => {
      fetch.mockResponseOnce(JSON.stringify(mockCardData));

      await loadCardSet('SOR');
      clearCardCache();

      fetch.mockResponseOnce(JSON.stringify(mockCardData));
      await loadCardSet('SOR');

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
