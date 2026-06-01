// Test setup for Vitest
// vi is available as a global because globals: true is set in vite.config.ts

// Alias jest → vi so jest-fetch-mock (which calls jest.fn() internally) works unchanged
global.jest = vi;

const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// Silence console during tests
['log', 'warn', 'error', 'info'].forEach(fn => {
  if (typeof console[fn] === 'function') vi.spyOn(console, fn).mockImplementation(() => {});
});

// In-memory localStorage mock
const _store = Object.create(null);
global.localStorage = {
  getItem: vi.fn((k) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null)),
  setItem: vi.fn((k, v) => { _store[k] = String(v); }),
  removeItem: vi.fn((k) => { delete _store[k]; }),
  clear: vi.fn(() => { Object.keys(_store).forEach(k => delete _store[k]); }),
};

// Reset mocks and storage between tests
beforeEach(() => {
  if (fetchMock && typeof fetchMock.resetMocks === 'function') fetchMock.resetMocks();
  if (global.localStorage && typeof global.localStorage.clear === 'function') global.localStorage.clear();
  vi.clearAllMocks();
});