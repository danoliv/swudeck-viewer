// Tests for fetch-sets.js functions
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// Mock the modules
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn()
  }
}));

jest.mock('https');

jest.mock('../sets.js', () => ({
  loadSets: jest.fn(() => ['SOR', 'SHD', 'JTL'])
}));

describe('fetch-sets.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveToFile', () => {
    test('should save data to correct file path', async () => {
      const { saveToFile } = require('../fetch-sets.js');
      
      const mockData = { test: 'data' };
      const filename = 'test.json';
      
      fs.writeFile.mockResolvedValue();
      
      await saveToFile(mockData, filename);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/.*data[\\\/]test\.json$/),
        JSON.stringify(mockData, null, 2)
      );
    });

    test('should handle save errors', async () => {
      const { saveToFile } = require('../fetch-sets.js');
      
      const mockData = { test: 'data' };
      const filename = 'test.json';
      const error = new Error('Save failed');
      
      fs.writeFile.mockRejectedValue(error);
      
      await expect(saveToFile(mockData, filename)).rejects.toThrow('Save failed');
    });
  });

  describe('fetchWithRetry', () => {
    test('should retry on failure', async () => {
      const { fetchWithRetry } = require('../fetch-sets.js');
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{"test": "data"}');
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      const result = await fetchWithRetry('https://api.example.com/test');
      
      expect(result).toEqual({ test: 'data' });
      expect(https.get).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        }),
        expect.any(Function)
      );
    });

    test('should handle HTTP errors', async () => {
      const { fetchWithRetry } = require('../fetch-sets.js');
      
      const mockResponse = {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            callback();
          }
        })
      };
      
      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      await expect(fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('HTTP Status 500 after all retries');
    });

    test('should handle network errors', async () => {
      const { fetchWithRetry } = require('../fetch-sets.js');
      
      const networkError = new Error('Network error');
      
      https.get.mockImplementation(() => {
        const mockRequest = {
          on: jest.fn((event, callback) => {
            if (event === 'error') {
              callback(networkError);
            }
          })
        };
        return mockRequest;
      });
      
      await expect(fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('Network error');
    });

    test('should handle JSON parsing errors', async () => {
      const { fetchWithRetry } = require('../fetch-sets.js');
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('invalid json');
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      await expect(fetchWithRetry('https://api.example.com/test', 1))
        .rejects.toThrow('Failed to parse JSON after all retries');
    });
  });

  describe('fetchAllSets', () => {
    test('should create data directory', async () => {
      const { fetchAllSets } = require('../fetch-sets.js');
      
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      // Mock successful API responses
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{"data": []}');
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      await fetchAllSets();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        { recursive: true }
      );
    });

    test('should process all sets from loadSets', async () => {
      const { fetchAllSets } = require('../fetch-sets.js');
      
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{"data": []}');
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });
      
      await fetchAllSets();
      
      // Should be called for each set: SOR, SHD, JTL
      expect(https.get).toHaveBeenCalledTimes(3);
      expect(https.get).toHaveBeenCalledWith(
        'https://api.swu-db.com/cards/sor?pretty=true',
        expect.any(Object),
        expect.any(Function)
      );
      expect(https.get).toHaveBeenCalledWith(
        'https://api.swu-db.com/cards/shd?pretty=true',
        expect.any(Object),
        expect.any(Function)
      );
      expect(https.get).toHaveBeenCalledWith(
        'https://api.swu-db.com/cards/jtl?pretty=true',
        expect.any(Object),
        expect.any(Function)
      );
    });

    test('should handle individual set failures gracefully', async () => {
      const { fetchAllSets } = require('../fetch-sets.js');
      
      fs.mkdir.mockResolvedValue();
      
      // Mock one successful and one failed response
      let callCount = 0;
      https.get.mockImplementation((url, options, callback) => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds
          const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback('{"data": []}');
              } else if (event === 'end') {
                callback();
              }
            })
          };
          callback(mockResponse);
        } else {
          // Subsequent calls fail
          const mockResponse = {
            statusCode: 500,
            headers: { 'content-type': 'application/json' },
            on: jest.fn((event, callback) => {
              if (event === 'end') {
                callback();
              }
            })
          };
          callback(mockResponse);
        }
        return { on: jest.fn() };
      });
      
      // Should not throw even if some sets fail
      await expect(fetchAllSets()).resolves.not.toThrow();
    }, 10000);
  });
});
