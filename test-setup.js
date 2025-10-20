// Test setup for Jest
const fetchMock = require('jest-fetch-mock');

// Mock fetch globally
global.fetch = fetchMock;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock window.location
delete window.location;
window.location = {
  href: 'http://localhost:3000',
  pathname: '/',
  search: '',
  hash: '',
  assign: jest.fn(),
  reload: jest.fn(),
  replace: jest.fn(),
};

// Mock window.history
window.history = {
  pushState: jest.fn(),
  replaceState: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
};

// Mock URL constructor
global.URL = class URL {
  constructor(url, base) {
    this.href = url;
    this.pathname = url.split('/').slice(3).join('/');
    this.search = '';
    this.hash = '';
  }
};

// Mock URLSearchParams
global.URLSearchParams = class URLSearchParams {
  constructor(search) {
    this.params = new Map();
    if (search) {
      search.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key) this.params.set(key, value);
      });
    }
  }
  
  get(name) {
    return this.params.get(name);
  }
  
  set(name, value) {
    this.params.set(name, value);
  }
};
