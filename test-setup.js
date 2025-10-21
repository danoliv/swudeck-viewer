// Minimal test setup for Jest
const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// Silence common console methods without replacing the whole console object
['log', 'warn', 'error'].forEach(fn => {
  if (typeof console[fn] === 'function') jest.spyOn(console, fn).mockImplementation(() => {});
});

// Small in-memory localStorage mock
const _store = Object.create(null);
global.localStorage = {
  getItem: jest.fn((k) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null)),
  setItem: jest.fn((k, v) => { _store[k] = String(v); }),
  removeItem: jest.fn((k) => { delete _store[k]; }),
  clear: jest.fn(() => { Object.keys(_store).forEach(k => delete _store[k]); }),
};

// Reset mocks and storage between tests
beforeEach(() => {
  if (fetchMock && typeof fetchMock.resetMocks === 'function') fetchMock.resetMocks();
  if (global.localStorage && typeof global.localStorage.clear === 'function') global.localStorage.clear();
  jest.clearAllMocks();
});
