// @vitest-environment node
// Tests for fetch-sets.js functions
//
// fetch-sets.js loads its set list from src/lib/sets.json. Built-in modules
// (https, fs) are intercepted with vi.spyOn() since vi.mock() cannot
// intercept CJS built-ins.

const https = require('https');
const fsp = require('fs').promises;

// The expected set list (the same source fetch-sets.js loads from)
const REAL_SETS = require('../src/lib/sets.json');

// Load fetch-sets once (after module object references are captured)
let fetchSets;
beforeAll(() => {
  fetchSets = require('../fetch-sets.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

  describe('fetch-sets.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveToFile', () => {
    test('should save data to correct file path', async () => {
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      const mockData = { test: 'data' };
      await fetchSets.saveToFile(mockData, 'test.json');

      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/.*data[\\\/]test\.json$/),
        JSON.stringify(mockData, null, 2)
      );
    });

    test('should handle save errors', async () => {
      const error = new Error('Save failed');
      vi.spyOn(fsp, 'writeFile').mockRejectedValue(error);

      await expect(fetchSets.saveToFile({ test: 'data' }, 'test.json')).rejects.toThrow('Save failed');
    });
  });

  describe('fetchWithRetry', () => {
    test('should fetch successfully', async () => {
      const mockResponse = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'data') callback('{"test": "data"}');
          else if (event === 'end') callback();
        }),
      };

      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: vi.fn() };
      });

      const result = await fetchSets.fetchWithRetry('https://api.example.com/test');

      expect(result).toEqual({ test: 'data' });
      expect(https.get).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({ headers: { Accept: 'application/json' } }),
        expect.any(Function)
      );
    });

    test('should handle HTTP errors', async () => {
      const mockResponse = {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        on: vi.fn((event, callback) => {
          if (event === 'end') callback();
        }),
      };

      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: vi.fn() };
      });

      await expect(fetchSets.fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('HTTP Status 500 after all retries');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network error');

      vi.spyOn(https, 'get').mockImplementation(() => {
        const mockRequest = {
          on: vi.fn((event, callback) => {
            if (event === 'error') callback(networkError);
          }),
        };
        return mockRequest;
      });

      await expect(fetchSets.fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('Network error');
    });

    test('should handle JSON parsing errors', async () => {
      const mockResponse = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'data') callback('invalid json');
          else if (event === 'end') callback();
        }),
      };

      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: vi.fn() };
      });

      await expect(fetchSets.fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('Failed to parse JSON after all retries');
    });
  });

  describe('fetchAllSets', () => {
    // Use fake timers so the 1-second per-set delay doesn't block tests.
    // Note: loadSets is destructured in fetch-sets.js at module init time so
    // vi.mock() cannot re-intercept it; tests use the real set list from sets.js.
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should create data directory', async () => {
      vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: vi.fn((event, cb) => {
            if (event === 'data') cb('{"data": []}');
            else if (event === 'end') cb();
          }),
        };
        callback(mockResponse);
        return { on: vi.fn() };
      });

      const promise = fetchSets.fetchAllSets();
      await vi.runAllTimersAsync();
      await promise;

      expect(fsp.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        { recursive: true }
      );
    });

    test('should process all sets from loadSets', async () => {
      vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: vi.fn((event, cb) => {
            if (event === 'data') cb('{"data": []}');
            else if (event === 'end') cb();
          }),
        };
        callback(mockResponse);
        return { on: vi.fn() };
      });

      const promise = fetchSets.fetchAllSets();
      await vi.runAllTimersAsync();
      await promise;

      // fetch-sets.js uses its inline SETS array. Verify each set was fetched.
      expect(https.get).toHaveBeenCalledTimes(REAL_SETS.length);
      for (const set of REAL_SETS) {
        expect(https.get).toHaveBeenCalledWith(
          `https://api.swu-db.com/cards/${set.toLowerCase()}?pretty=true`,
          expect.any(Object),
          expect.any(Function)
        );
      }
    });

    test('should handle individual set failures gracefully', async () => {
      vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      let callCount = 0;
      vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        callCount++;
        if (callCount === 1) {
          const mockResponse = {
            statusCode: 200,
            on: vi.fn((event, cb) => {
              if (event === 'data') cb('{"data": []}');
              else if (event === 'end') cb();
            }),
          };
          callback(mockResponse);
        } else {
          const mockResponse = {
            statusCode: 500,
            headers: { 'content-type': 'application/json' },
            on: vi.fn((event, cb) => {
              if (event === 'end') cb();
            }),
          };
          callback(mockResponse);
        }
        return { on: vi.fn() };
      });

      const promise = fetchSets.fetchAllSets();
      await vi.runAllTimersAsync();
      await promise;
      // Reaching here means failures were handled gracefully (no throw)
    });
  });
});
