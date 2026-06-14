// @vitest-environment node
// Tests for fetch-aspect-icons.js
//
// fetch-aspect-icons.js is a Node CLI tool that downloads aspect icon webp
// images from swudb.com into public/images/aspects/. Built-in modules
// (https, fs) are intercepted with vi.spyOn() since vi.mock() cannot
// intercept CJS built-ins.

const https = require('https');
const fsp = require('fs').promises;

let fetchAspectIcons;
beforeAll(() => {
  fetchAspectIcons = require('../fetch-aspect-icons.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetch-aspect-icons.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ASPECTS', () => {
    test('lists the six SWU aspects', () => {
      expect(fetchAspectIcons.ASPECTS).toEqual([
        'Vigilance',
        'Command',
        'Aggression',
        'Cunning',
        'Villainy',
        'Heroism',
      ]);
    });
  });

  describe('saveImage', () => {
    test('saves buffer to the aspects image directory', async () => {
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      const buffer = Buffer.from('fake-webp-bytes');
      await fetchAspectIcons.saveImage(buffer, 'Cunning.webp');

      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/images[\\/]aspects[\\/]Cunning\.webp$/),
        buffer
      );
    });

    test('handles save errors', async () => {
      const error = new Error('Save failed');
      vi.spyOn(fsp, 'writeFile').mockRejectedValue(error);

      await expect(fetchAspectIcons.saveImage(Buffer.from(''), 'Cunning.webp'))
        .rejects.toThrow('Save failed');
    });
  });

  describe('fetchImageWithRetry', () => {
    test('resolves with the response body as a Buffer', async () => {
      const mockResponse = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from('abc'));
          else if (event === 'end') callback();
        }),
      };

      vi.spyOn(https, 'get').mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: vi.fn() };
      });

      const result = await fetchAspectIcons.fetchImageWithRetry('https://swudb.com/images/Cunning.webp');

      expect(result).toEqual(Buffer.from('abc'));
      expect(https.get).toHaveBeenCalledWith('https://swudb.com/images/Cunning.webp', expect.any(Function));
    });

    test('retries on non-200 status then rejects', async () => {
      const mockResponse = {
        statusCode: 404,
        resume: vi.fn(),
        on: vi.fn(),
      };

      vi.spyOn(https, 'get').mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: vi.fn() };
      });

      await expect(fetchAspectIcons.fetchImageWithRetry('https://swudb.com/images/Missing.webp', 1))
        .rejects.toThrow('HTTP Status 404 after all retries');
    });

    test('retries on network error then rejects', async () => {
      const networkError = new Error('Network error');

      vi.spyOn(https, 'get').mockImplementation(() => ({
        on: vi.fn((event, callback) => {
          if (event === 'error') callback(networkError);
        }),
      }));

      await expect(fetchAspectIcons.fetchImageWithRetry('https://swudb.com/images/Cunning.webp', 1))
        .rejects.toThrow('Network error');
    });
  });

  describe('fetchAllIcons', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('creates the aspects image directory and fetches each aspect icon', async () => {
      vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      vi.spyOn(https, 'get').mockImplementation((url, callback) => {
        const mockResponse = {
          statusCode: 200,
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('img'));
            else if (event === 'end') cb();
          }),
        };
        callback(mockResponse);
        return { on: vi.fn() };
      });

      const promise = fetchAspectIcons.fetchAllIcons();
      await vi.runAllTimersAsync();
      await promise;

      expect(fsp.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(`images${require('path').sep}aspects`),
        { recursive: true }
      );
      expect(https.get).toHaveBeenCalledTimes(fetchAspectIcons.ASPECTS.length);
      for (const aspect of fetchAspectIcons.ASPECTS) {
        expect(https.get).toHaveBeenCalledWith(`https://swudb.com/images/${aspect}.webp`, expect.any(Function));
      }
    });

    test('handles individual icon failures gracefully', async () => {
      vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);

      let callCount = 0;
      vi.spyOn(https, 'get').mockImplementation((url, callback) => {
        callCount++;
        if (callCount === 1) {
          const mockResponse = {
            statusCode: 404,
            resume: vi.fn(),
            on: vi.fn(),
          };
          callback(mockResponse);
        } else {
          const mockResponse = {
            statusCode: 200,
            on: vi.fn((event, cb) => {
              if (event === 'data') cb(Buffer.from('img'));
              else if (event === 'end') cb();
            }),
          };
          callback(mockResponse);
        }
        return { on: vi.fn() };
      });

      const promise = fetchAspectIcons.fetchAllIcons();
      await vi.runAllTimersAsync();
      await promise;
      // Reaching here means the first failure was handled gracefully (no throw)
    });
  });
});
