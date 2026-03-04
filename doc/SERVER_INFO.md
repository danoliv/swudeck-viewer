# Server Started Successfully! 🚀

## Your Application is Now Running

**Local URL:** http://localhost:8000

### Available Pages:
- 🏠 **Main Deck Viewer**: http://localhost:8000/ or http://localhost:8000/index.html
- 🔄 **Deck Comparison**: http://localhost:8000/compare.html

## How to Use

### Deck Viewer
1. Open http://localhost:8000 in your browser
2. Paste a SWUDB deck URL (e.g., `https://swudb.com/deck/YOUR_DECK_ID`)
3. Click "Load Deck" to view the deck with card images and details
4. Use sorting options to organize cards by Set, Cost, Aspect, Type, or Traits

### Deck Comparison
1. Open http://localhost:8000/compare.html
2. Enter two SWUDB deck URLs
3. Click "Compare Decks" to see side-by-side comparison
4. View which cards are unique to each deck or shared between them

## Server Management

### Stop the Server
```bash
# Find the process ID
ps aux | grep "python3 -m http.server" | grep -v grep

# Kill the process (replace PID with the actual process ID)
kill <PID>
```

Or simply press `Ctrl+C` in the terminal where the server is running.

### Start the Server Again
```bash
# Using npm script (recommended)
npm start

# Or directly with Python
python3 -m http.server 8000
```

### Check Server Status
```bash
curl http://localhost:8000
```

## Current Server Status
✅ **Running on PID: 18827**
✅ **Port: 8000**
✅ **Directory: /home/andrea/Projects/swudeck-viewer**

## Features Available
- ✅ Card image display with front/back flip for double-sided cards
- ✅ Leader and base card display
- ✅ Main deck and sideboard support
- ✅ Multiple sorting options (Set, Cost, Aspect, Type, Trait)
- ✅ Recent decks history with quick access
- ✅ Quick compare feature from recent decks
- ✅ Deck comparison tool
- ✅ Card caching for faster loading
- ✅ CORS proxy support for fetching deck data

## Troubleshooting

### Port Already in Use
If port 8000 is already taken, use a different port:
```bash
python3 -m http.server 8080
```

### Can't Access from Other Devices
To allow access from other devices on your network:
```bash
python3 -m http.server 8000 --bind 0.0.0.0
```
Then access via: `http://YOUR_IP_ADDRESS:8000`

### CORS Issues
The application uses CORS proxies to fetch deck data. If you experience issues:
1. Check your internet connection
2. Try the "Clear All Cache" button
3. The app will automatically retry with different proxy servers

## Testing
Run the test suite:
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

## Fetching Latest Card Data
Update card set data from the API:
```bash
npm run fetch-sets
```

---

**Enjoy testing your SWU Deck Viewer!** 🎮

