# SWU Deck Viewer - Test Documentation

## Overview
This project includes comprehensive unit tests for the SWU Deck Viewer application using Jest testing framework.

## Test Structure

### Test Files
- `__tests__/sets.test.js` - Tests for the sets.js module
- `__tests__/card-module.test.js` - Tests for card-module.js functions
- `__tests__/fetch-sets.test.js` - Tests for fetch-sets.js functions  
- `__tests__/html-utils.test.js` - Tests for HTML utilities and deck processing

### Configuration Files
- `package.json` - Project configuration with Jest setup
- `test-setup.js` - Jest setup and global mocks
- `jest.config.js` - Jest configuration (if needed)

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

## Test Coverage

### Sets Module (`sets.test.js`)
- ✅ `loadSets()` function returns correct array
- ✅ Returns expected set names in correct order
- ✅ Returns correct number of sets (7)
- ✅ Includes all expected sets (SOR, SHD, JTL, TWI, LOF, SEC, IBH)
- ✅ Excludes unexpected values
- ✅ Returns consistent results on multiple calls
- ✅ Returns only strings

### Card Module (`card-module.test.js`)
- ✅ Card HTML generation validation
- ✅ Card data structure validation
- ✅ Card ID parsing and validation
- ✅ Card statistics extraction (Cost, Power, HP)
- ✅ Arena handling (Ground, Space, Multi-arena)
- ✅ Aspect and trait processing
- ✅ Error handling for invalid data

### Fetch Sets (`fetch-sets.test.js`)
- ✅ `saveToFile()` function with correct file paths
- ✅ Error handling for save operations
- ✅ `fetchWithRetry()` with successful responses
- ✅ HTTP error handling and retries
- ✅ Network error handling
- ✅ JSON parsing error handling
- ✅ `fetchAllSets()` directory creation
- ✅ Processing all sets from loadSets
- ✅ Graceful handling of individual set failures

### HTML Utilities (`html-utils.test.js`)
- ✅ URL parsing and deck ID extraction
- ✅ Invalid URL handling
- ✅ Card ID parsing and validation
- ✅ Deck data structure validation
- ✅ Card grouping by set
- ✅ Card sorting within sets
- ✅ Aspect and trait processing
- ✅ Card type categorization (Ground/Space Units)
- ✅ Cost sorting logic

## Mocking Strategy

### Global Mocks
- `fetch` - Mocked for API calls
- `localStorage` - Mocked for browser storage
- `window.location` - Mocked for URL handling
- `window.history` - Mocked for navigation
- `console` methods - Mocked to reduce test noise

### Module Mocks
- `fs.promises` - Mocked for file operations
- `https` - Mocked for HTTP requests
- `sets.js` - Mocked for controlled testing

## Test Data

### Mock Card Data
```javascript
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
    }
  ]
};
```

### Mock Deck Data
```javascript
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
```

## Best Practices

### Test Organization
- Each test file focuses on a specific module
- Tests are grouped by functionality
- Clear, descriptive test names
- Proper setup and teardown with `beforeEach`

### Assertions
- Use specific matchers (`toBe`, `toEqual`, `toContain`)
- Test both positive and negative cases
- Validate error conditions
- Test edge cases and boundary conditions

### Mocking
- Mock external dependencies
- Use realistic mock data
- Test both success and failure scenarios
- Clear mock implementations

## Continuous Integration

The tests are designed to run in CI environments:
- No external dependencies required
- All APIs are mocked
- Tests run in Node.js environment
- Coverage reporting available

## Future Enhancements

### Potential Additional Tests
- Integration tests with real API calls
- End-to-end tests with browser automation
- Performance tests for large datasets
- Visual regression tests for UI components

### Test Utilities
- Custom matchers for card data validation
- Test data factories for generating mock data
- Helper functions for common test operations
- Snapshot testing for HTML output
