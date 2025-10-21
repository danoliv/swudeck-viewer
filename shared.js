// shared.js
// Shared utilities used by ui.js and compare.js
(function () {
  'use strict';

  // External proxy used for static deployments (AllOrigins /raw wrapper is CORS-friendly)
  // Prefer the `raw` endpoint which returns the target response directly and typically includes
  // Access-Control-Allow-Origin headers so browsers won't block requests from localhost/origins.
  // Keep the older `/get?url=` wrapper as a fallback in the proxies list below.
  const PROXY = 'https://api.allorigins.win/raw?url=';
  const TIMEOUT_MS = 10000; // 10 second timeout

  // Helper to fetch via the external proxy (no direct fetch attempt)
  async function fetchUsingExternalProxy(targetUrl, retries = 3, bypassCache = false) {
    const build = (u) => `${PROXY}${encodeURIComponent(u)}`;
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const urlWithBypass = bypassCache ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}_t=${Date.now()}` : targetUrl;
        const response = await fetch(build(urlWithBypass), { signal: controller.signal, cache: 'no-cache' });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
        // AllOrigins /get returns a JSON wrapper: { status, contents }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const wrapper = await response.json();
          if (wrapper && typeof wrapper.contents === 'string') {
            // wrapper.contents is the target response as string — try to parse JSON
            try {
              return JSON.parse(wrapper.contents);
            } catch (e) {
              // not JSON inside contents, return raw contents
              return wrapper.contents;
            }
          }
          // If wrapper missing contents, return wrapper directly
          return wrapper;
        }
        // Fallback: try to parse text
        const text = await response.text();
        try { return JSON.parse(text); } catch (e) { return text; }
      } catch (err) {
        lastError = err;
        console.warn('fetchUsingExternalProxy attempt failed:', err && err.message ? err.message : err);
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error(`Proxy fetch failed: ${lastError ? lastError.message : 'unknown'}`);
  }

  // Utility function to retry fetch requests with proxy fallbacks
  async function fetchWithRetry(url, retries = 3, bypassCache = false) {
    // List of proxies to try (null = direct fetch). Order matters.
    const proxies = [
      // Prefer the AllOrigins `raw` endpoint which forwards the original response and
      // usually includes Access-Control-Allow-Origin.
      'https://api.allorigins.win/raw?url=',
      // Fallback to the `/get` JSON wrapper if `raw` is unavailable.
      'https://api.allorigins.win/get?url=',
      // Other known proxies
      'https://thingproxy.freeboard.io/fetch/',
      'https://cors.bridged.cc/'
    ];

    const buildProxyUrl = (proxy, targetUrl) => {
      if (!proxy) return targetUrl;
      if (proxy.includes('allorigins')) return `${proxy}${encodeURIComponent(targetUrl)}`;
      if (proxy.endsWith('/fetch/') || proxy.endsWith('/')) return `${proxy}${targetUrl}`;
      return `${proxy}${encodeURIComponent(targetUrl)}`;
    };

    let lastError = null;
    for (const proxy of proxies) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          console.info(`fetchWithRetry: attempt ${attempt + 1}/${retries} using proxy=${proxy || 'direct'}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

          const target = buildProxyUrl(proxy, bypassCache ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` : url);

          const response = await fetch(target, {
            signal: controller.signal,
            cache: bypassCache ? 'no-cache' : 'default'
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error from ${proxy || 'direct'} fetch: ${response.status}`);
          }

          if (proxy && proxy.includes('allorigins') && target.includes('/get?url=')) {
            const wrapper = await response.json();
            if (wrapper && wrapper.contents) {
              try { return JSON.parse(wrapper.contents); } catch (e) { return wrapper.contents; }
            }
            throw new Error('AllOrigins returned an unexpected wrapper');
          }

          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          }

          const text = await response.text();
          try { return JSON.parse(text); } catch (e) { throw new Error('Response was not JSON'); }
        } catch (err) {
          lastError = err;
          if (err instanceof TypeError || /Failed to fetch|NetworkError|CORS|Access-Control-Allow-Origin/.test(String(err.message))) {
            console.warn(`fetchWithRetry failed (proxy=${proxy || 'direct'}): likely CORS/network`, err.message || err);
          } else {
            console.warn(`fetchWithRetry failed (proxy=${proxy || 'direct'}):`, err.message || err);
          }
          if (attempt === retries - 1) break;
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    throw new Error(`All attempts failed: ${lastError ? lastError.message : 'unknown'}`);
  }

  function getDeckIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch (e) {
      // Fallback to naive split
      return url.split('/').pop() || null;
    }
  }

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch (e) {
      return null;
    }
  }

  function setQueryParam(name, value) {
    const u = new URL(window.location);
    if (value === null || typeof value === 'undefined') {
      u.searchParams.delete(name);
    } else {
      u.searchParams.set(name, value);
    }
    window.history.pushState({}, '', u.toString());
  }

  function setQueryParams(obj) {
    const u = new URL(window.location);
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v === null || typeof v === 'undefined') {
        u.searchParams.delete(k);
      } else {
        u.searchParams.set(k, v);
      }
    });
    window.history.pushState({}, '', u.toString());
  }

  // Build a consolidated card counts map from deck data (main + sideboard)
  function buildDeckCardCounts(deckData) {
    const map = new Map();
    if (!deckData) return map;

    // Main deck
    if (Array.isArray(deckData.deck)) {
      deckData.deck.forEach(card => {
        if (card && card.id) {
          const cnt = card.count || 1;
          map.set(card.id, { main: cnt, sideboard: 0 });
        }
      });
    }

    // Sideboard
    if (Array.isArray(deckData.sideboard)) {
      deckData.sideboard.forEach(card => {
        if (card && card.id) {
          const cnt = card.count || 1;
          if (map.has(card.id)) {
            map.get(card.id).sideboard = cnt;
          } else {
            map.set(card.id, { main: 0, sideboard: cnt });
          }
        }
      });
    }

    return map;
  }

  function deckInfoHTML(deckData) {
    const deckName = deckData?.metadata?.name || 'Unnamed Deck';
    const deckSize = Array.isArray(deckData?.deck) ? deckData.deck.length : 0;
    const sideboardSize = Array.isArray(deckData?.sideboard) ? deckData.sideboard.length : 0;
    return `\n      <div class="deck-name">${deckName}</div>\n      <div class="deck-stats">\n        Main Deck: ${deckSize} cards<br>\n        Sideboard: ${sideboardSize} cards\n      </div>\n    `;
  }

  // Expose on window for scripts to use
  window.PROXY = PROXY;
  window.TIMEOUT_MS = TIMEOUT_MS;
  window.fetchUsingExternalProxy = fetchUsingExternalProxy;
  window.fetchWithRetry = fetchWithRetry;
  window.getDeckIdFromUrl = getDeckIdFromUrl;
  window.getQueryParam = getQueryParam;
  window.setQueryParam = setQueryParam;
  window.setQueryParams = setQueryParams;
  window.buildDeckCardCounts = buildDeckCardCounts;
  window.deckInfoHTML = deckInfoHTML;
})();
