# SWU Deck Viewer

A web-based viewer for Star Wars Unlimited deck lists from SWUDB.

## Features

- 📋 Load and view decks from SWUDB URLs
- 🎴 Display card images with front/back flip support
- 🔄 Compare two decks side-by-side
- 📊 Multiple sorting options (Set, Cost, Aspect, Type, Trait)
- 💾 Recent decks history
- ⚡ Card data caching for faster loading

## Quick Start

1. **Start the server:**
   ```bash
   npm start
   # Or: python3 -m http.server 8000
   ```

2. **Open in browser:**
   ```
   http://localhost:8000
   ```

3. **Fix CORS issues (if needed):**
   - Go to http://localhost:8000/settings.html
   - Enable "Direct API Fetch"
   - Or install a CORS browser extension

## Usage

### View a Deck
1. Paste a SWUDB deck URL (e.g., `https://swudb.com/deck/YHNqqVcCe`)
2. Click "Load Deck"
3. Browse cards sorted by set, cost, aspect, type, or traits

### Compare Decks
1. Open http://localhost:8000/compare.html
2. Enter two deck URLs
3. View differences and shared cards

## Testing

```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

## Documentation

All documentation is in the [`doc/`](./doc/) folder:

- **[CORS_FIX.md](./doc/CORS_FIX.md)** - CORS issues and quick fixes
- **[SERVER_INFO.md](./doc/SERVER_INFO.md)** - Server setup and management
- **[TEST_COVERAGE_SUMMARY.md](./doc/TEST_COVERAGE_SUMMARY.md)** - Test coverage details
- **[TEST_README.md](./doc/TEST_README.md)** - Testing documentation

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Jest for testing
- Python HTTP server for local development
- SWUDB API for deck data

## License

This project is for educational and personal use.

