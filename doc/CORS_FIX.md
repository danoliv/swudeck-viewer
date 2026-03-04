# CORS Error Fix

## 🚨 Quick Fix (30 seconds)

**Error:** `"All requests failed on shared.js line 84"`

**Solution:**
1. Open http://localhost:8000/settings.html
2. Check **"Enable Direct API Fetch"**
3. Go to http://localhost:8000
4. Paste: `https://swudb.com/deck/YHNqqVcCe`
5. Click "Load Deck" → Should work! ✅

---

## Problem

The application fails to load decks because:
1. AllOrigins proxy service is down (520/522 errors)
2. Free CORS proxies are rate-limited or unavailable
3. Browsers block cross-origin requests from localhost to HTTPS APIs

## Solutions

### Option 1: Enable Direct Fetch (Recommended for localhost)

1. Go to http://localhost:8000/settings.html
2. Enable **"Direct API Fetch"**
3. Click **"Test SWUDB API Connection"** to verify
4. Reload and try loading a deck

### Option 2: Install CORS Browser Extension

**Chrome/Edge:**
- Search "CORS Unblock" in Chrome Web Store
- Or search "Allow CORS: Access-Control-Allow-Origin"

**Firefox:**
- Search "CORS Everywhere" in Firefox Add-ons

After installing, enable the extension and reload the page.

### Option 3: Run Browser with Security Disabled (Development Only)

⚠️ **Warning: Only for testing! Reduces browser security!**

```bash
# Close all Chrome windows first, then:
google-chrome --disable-web-security --user-data-dir=/tmp/chrome-dev
chromium --disable-web-security --user-data-dir=/tmp/chrome-dev
```

Then open http://localhost:8000


## Technical Details

### What is CORS?

**CORS (Cross-Origin Resource Sharing)** is a browser security feature that blocks requests from one origin (e.g., `http://localhost:8000`) to another (e.g., `https://swudb.com`).

- **Why it exists**: Prevents malicious websites from accessing APIs on your behalf
- **The problem**: SWUDB API doesn't provide CORS headers
- **The workaround**: Use proxies or bypass for localhost development

### Proxy Fallback Order (in `shared.js`)

1. **Direct fetch** (when on localhost)
2. `api.codetabs.com` - Alternative proxy
3. `thingproxy.freeboard.io` - Fallback proxy
4. `cors.bridged.cc` - May be rate-limited
5. `corsproxy.io` - Requires paid plan
6. `api.allorigins.win/raw` - Currently experiencing issues
7. `api.allorigins.win/get` - Currently experiencing issues

### Files Modified

- **shared.js**: Added localhost detection and proxy fallback logic
- **settings.html**: Created settings page with Direct Fetch toggle
- **index.html**: Added Settings link to navigation
- **compare.html**: Added Settings link to navigation

### Code Implementation

**Localhost Detection (shared.js):**
```javascript
const isLocalHost = typeof window !== 'undefined' && 
                    (window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname === '');

const proxies = [
  ...(isLocalHost ? [null] : []),  // Direct fetch on localhost
  // ... proxy fallbacks
];
```

**User Setting (settings.html):**
```javascript
localStorage.setItem('useDirectFetch', 'true');
```

**Check Setting (ui.js & compare.js):**
```javascript
const preferDirect = localStorage.getItem('useDirectFetch') === 'true';
```

## Production Deployment

For production, CORS proxies are unreliable. Consider:

1. **Backend Proxy**: Create a simple Node.js/Python proxy on your server
2. **Cloudflare Workers**: Free serverless proxy solution
3. **Self-hosted CORS Anywhere**: Deploy your own CORS proxy
4. **API CORS Headers**: Request SWUDB to add CORS support (unlikely)

## Troubleshooting

### Still Getting Errors?

1. **Check Browser Console** (F12 → Console tab)
   - Look for "CORS", "blocked", or "Failed to fetch" messages

2. **Test Connection**
   - Go to http://localhost:8000/settings.html
   - Click "Test SWUDB API Connection"
   - Follow the results/instructions

3. **Common Issues:**
   - **"Mixed Content"**: Server is HTTP, API is HTTPS → Use Direct Fetch
   - **"Network Error"**: Check internet connection
   - **"Failed to fetch"**: CORS still blocking → Install extension

### Quick Links

- **Settings Page**: http://localhost:8000/settings.html
- **Main App**: http://localhost:8000
- **Compare Tool**: http://localhost:8000/compare.html

