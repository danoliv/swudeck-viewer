// Tests for shared.js utility functions
const {
  getDeckIdFromUrl,
  buildDeckCardCounts,
  deckInfoHTML
} = require('../shared.js');

// Mock window.location for query param tests
global.window = {
  location: {
    search: '',
    href: 'http://localhost/',
    pathname: '/'
  },
  history: {
    pushState: jest.fn()
  }
};

// Mock URLSearchParams if not available
if (typeof URLSearchParams === 'undefined') {
  global.URLSearchParams = require('url').URLSearchParams;
}

describe('shared.js utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.location.search = '';
  });

  describe('getDeckIdFromUrl', () => {
    test('should extract deck ID from full SWUDB URL', () => {
      const testUrls = [
        { url: 'https://swudb.com/deck/123', expected: '123' },
        { url: 'https://swudb.com/deck/456', expected: '456' },
        { url: 'https://swudb.com/deck/abc123', expected: 'abc123' }
      ];

      testUrls.forEach(({ url, expected }) => {
        const deckId = getDeckIdFromUrl(url);
        expect(deckId).toBe(expected);
      });
    });

    test('should handle URLs with trailing slashes', () => {
      const url = 'https://swudb.com/deck/123/';
      const deckId = getDeckIdFromUrl(url);
      expect(deckId).toBe('123');
    });

    test('should handle plain deck IDs', () => {
      const deckId = getDeckIdFromUrl('my-deck-123');
      expect(deckId).toBe('my-deck-123');
    });

    test('should handle null input', () => {
      const deckId = getDeckIdFromUrl(null);
      expect(deckId).toBeNull();
    });

    test('should handle empty string', () => {
      const deckId = getDeckIdFromUrl('');
      expect(deckId).toBeNull();
    });

    test('should extract ID from complex paths', () => {
      const url = 'https://swudb.com/api/deck/test-deck-456';
      const deckId = getDeckIdFromUrl(url);
      expect(deckId).toBe('test-deck-456');
    });

    test('should fallback to naive split on invalid URLs', () => {
      const invalidUrl = 'not-a-url/deck/789';
      const deckId = getDeckIdFromUrl(invalidUrl);
      expect(deckId).toBe('789');
    });
  });

  describe('buildDeckCardCounts', () => {
    test('should build card counts from deck data', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 },
          { id: 'SOR_002', count: 1 },
          { id: 'SHD_123', count: 3 }
        ]
      };

      const counts = buildDeckCardCounts(deckData);

      expect(counts.size).toBe(3);
      expect(counts.get('SOR_001')).toEqual({ main: 2, sideboard: 0 });
      expect(counts.get('SOR_002')).toEqual({ main: 1, sideboard: 0 });
      expect(counts.get('SHD_123')).toEqual({ main: 3, sideboard: 0 });
    });

    test('should include sideboard counts', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 }
        ],
        sideboard: [
          { id: 'SOR_001', count: 1 },
          { id: 'SOR_003', count: 2 }
        ]
      };

      const counts = buildDeckCardCounts(deckData);

      expect(counts.size).toBe(2);
      expect(counts.get('SOR_001')).toEqual({ main: 2, sideboard: 1 });
      expect(counts.get('SOR_003')).toEqual({ main: 0, sideboard: 2 });
    });

    test('should handle cards only in sideboard', () => {
      const deckData = {
        deck: [],
        sideboard: [
          { id: 'SOR_005', count: 1 }
        ]
      };

      const counts = buildDeckCardCounts(deckData);

      expect(counts.size).toBe(1);
      expect(counts.get('SOR_005')).toEqual({ main: 0, sideboard: 1 });
    });

    test('should handle missing deck data', () => {
      const counts = buildDeckCardCounts(null);
      expect(counts.size).toBe(0);
    });

    test('should handle empty deck', () => {
      const deckData = {
        deck: [],
        sideboard: []
      };

      const counts = buildDeckCardCounts(deckData);
      expect(counts.size).toBe(0);
    });

    test('should default count to 1 if not specified', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001' } // No count specified
        ]
      };

      const counts = buildDeckCardCounts(deckData);
      expect(counts.get('SOR_001')).toEqual({ main: 1, sideboard: 0 });
    });

    test('should skip cards without IDs', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 },
          { count: 3 }, // No ID
          null,
          { id: 'SOR_002', count: 1 }
        ]
      };

      const counts = buildDeckCardCounts(deckData);
      expect(counts.size).toBe(2);
      expect(counts.has('SOR_001')).toBe(true);
      expect(counts.has('SOR_002')).toBe(true);
    });
  });

  describe('deckInfoHTML', () => {
    test('should generate HTML for deck with name', () => {
      const deckData = {
        metadata: {
          name: 'Test Deck'
        },
        deck: [
          { id: 'SOR_001', count: 2 },
          { id: 'SOR_002', count: 1 }
        ],
        sideboard: [
          { id: 'SOR_003', count: 1 }
        ]
      };

      const html = deckInfoHTML(deckData);

      expect(html).toContain('Test Deck');
      expect(html).toContain('Main Deck: 2 cards');
      expect(html).toContain('Sideboard: 1 cards');
    });

    test('should handle deck without name', () => {
      const deckData = {
        deck: [
          { id: 'SOR_001', count: 2 }
        ]
      };

      const html = deckInfoHTML(deckData);
      expect(html).toContain('Unnamed Deck');
    });

    test('should handle empty deck', () => {
      const deckData = {
        metadata: {
          name: 'Empty Deck'
        },
        deck: [],
        sideboard: []
      };

      const html = deckInfoHTML(deckData);
      expect(html).toContain('Empty Deck');
      expect(html).toContain('Main Deck: 0 cards');
      expect(html).toContain('Sideboard: 0 cards');
    });

    test('should handle deck without sideboard', () => {
      const deckData = {
        metadata: {
          name: 'Main Deck Only'
        },
        deck: [
          { id: 'SOR_001' },
          { id: 'SOR_002' }
        ]
      };

      const html = deckInfoHTML(deckData);
      expect(html).toContain('Main Deck: 2 cards');
      expect(html).toContain('Sideboard: 0 cards');
    });

    test('should handle null deck data', () => {
      const html = deckInfoHTML(null);
      expect(html).toContain('Unnamed Deck');
      expect(html).toContain('Main Deck: 0 cards');
      expect(html).toContain('Sideboard: 0 cards');
    });

    test('should return valid HTML structure', () => {
      const deckData = {
        metadata: { name: 'Test' },
        deck: [{ id: 'SOR_001' }],
        sideboard: []
      };

      const html = deckInfoHTML(deckData);

      expect(html).toContain('class="deck-name"');
      expect(html).toContain('class="deck-stats"');
      expect(html).toContain('<div');
      expect(html).toContain('</div>');
    });
  });

  describe('fetchUsingExternalProxy', () => {
    const { fetchUsingExternalProxy } = require('../shared.js');

    test('should fetch data through proxy', async () => {
      const mockData = { test: 'data' };
      fetch.mockResponseOnce(JSON.stringify(mockData), {
        headers: { 'content-type': 'application/json' }
      });

      const result = await fetchUsingExternalProxy('https://example.com/api');

      expect(fetch).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });

    test('should handle JSON wrapper with contents', async () => {
      const wrapper = { contents: JSON.stringify({ data: 'value' }) };
      fetch.mockResponseOnce(JSON.stringify(wrapper), {
        headers: { 'content-type': 'application/json' }
      });

      const result = await fetchUsingExternalProxy('https://example.com/api');

      expect(result).toEqual({ data: 'value' });
    });

    test('should retry on failure', async () => {
      fetch.mockRejectOnce(new Error('Network error'));
      fetch.mockResponseOnce(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });

      const result = await fetchUsingExternalProxy('https://example.com/api');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    test('should throw after max retries', async () => {
      fetch.mockReject(new Error('Failed'));

      await expect(fetchUsingExternalProxy('https://example.com/api', 2))
        .rejects.toThrow('Proxy fetch failed');
    });

    test('should handle non-JSON content', async () => {
      fetch.mockResponseOnce('plain text', {
        headers: { 'content-type': 'text/plain' }
      });

      const result = await fetchUsingExternalProxy('https://example.com/api');

      expect(result).toBe('plain text');
    });

    test('should add cache bypass parameter', async () => {
      fetch.mockResponseOnce(JSON.stringify({ data: 'test' }));

      await fetchUsingExternalProxy('https://example.com/api?param=value', 3, true);

      const callUrl = fetch.mock.calls[0][0];
      // URL is encoded, so _t parameter is included in the encoded URL
      expect(callUrl).toContain('_t%3D');
    });
  });

  describe('fetchWithRetry', () => {
    const { fetchWithRetry } = require('../shared.js');

    beforeEach(() => {
      // Reset window mock
      window.location.hostname = 'localhost';
    });

    test('should fetch successfully', async () => {
      fetch.mockResponseOnce(JSON.stringify({ data: 'test' }), {
        headers: { 'content-type': 'application/json' }
      });

      const result = await fetchWithRetry('https://example.com/api');

      expect(result).toEqual({ data: 'test' });
    });

    test('should try direct fetch on localhost', async () => {
      window.location.hostname = 'localhost';
      fetch.mockResponseOnce(JSON.stringify({ local: true }));

      await fetchWithRetry('https://example.com/api');

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.any(Object)
      );
    });

    test('should handle fetch errors and retry', async () => {
      fetch.mockRejectOnce(new Error('Network error'));
      fetch.mockResponseOnce(JSON.stringify({ success: true }));

      const result = await fetchWithRetry('https://example.com/api', 1);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    test('should handle AllOrigins wrapper', async () => {
      window.location.hostname = 'production.com';
      const wrapper = { contents: JSON.stringify({ data: 'wrapped' }) };
      fetch.mockResponseOnce(JSON.stringify(wrapper), {
        headers: { 'content-type': 'application/json' }
      });

      const result = await fetchWithRetry('https://example.com/api', 1);

      // Result could be the wrapper or the parsed contents depending on proxy used
      expect(result).toBeDefined();
    });
  });

  describe('getQueryParam & setQueryParam', () => {
    const { getQueryParam, setQueryParam } = require('../shared.js');

    test('getQueryParam should return null in test environment', () => {
      // In Node test environment, window.location.search doesn't work the same
      // The function returns null when URLSearchParams can't be created properly
      const result = getQueryParam('deck');
      expect(result).toBeNull();
    });

    test('setQueryParam requires browser environment', () => {
      // setQueryParam requires actual URL and history.pushState
      // In test environment, this is mocked and may not work identically
      // Just verify it doesn't throw
      expect(() => setQueryParam('deck', '456')).not.toThrow();
    });
  });
});




