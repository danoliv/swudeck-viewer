// ui.js - extracted UI and deck functions from index.html
// Minimal IIFE to avoid leaking unexpected locals
(function () {
  'use strict';

  // Recent decks storage
  const MAX_RECENT_DECKS = 8;
  let recentDecks = JSON.parse(localStorage.getItem('recentDecks') || '[]');

  // Update recent decks UI
  function updateRecentDecksUI() {
    const recentDecksDiv = document.getElementById('recentDecks');
    if (!recentDecksDiv) return;
    if (recentDecks.length === 0) {
      recentDecksDiv.style.display = 'none';
      return;
    }

    let html = '<div class="recent-decks-title">Recent Decks:</div>';
    html += '<div class="quick-compare-section" style="margin-bottom: 15px; padding: 10px; background: #e8f4fd; border-radius: 4px;">';
    html += '<strong>Quick Compare:</strong> Select two decks to compare them instantly. ';
    html += '<button onclick="quickCompare()" style="background: #0066cc; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">Compare Selected</button>';
    html += '</div>';
    html += '<div class="recent-decks-list">';
    recentDecks.forEach((deck, index) => {
      const leaderImg = deck.leaderArt ?
        `<img src="${deck.leaderArt}" alt="Leader" onerror="this.style.display='none'">` : '';

      html += `<div class="recent-deck-container" style="position: relative;">
                    <button onclick="loadDeckFromUrl('${deck.url}')" class="recent-deck-btn">
                        <div class="aspect ${deck.baseAspect} recent-deck-base-bg"></div>
                        <div class="recent-deck-name"><span>${deck.name || 'Unnamed Deck'}</span></div>
                        ${leaderImg}
                    </button>
                    <input type="checkbox" onclick="toggleDeckSelection('${deck.url}', this)" class="deck-checkbox" style="position: absolute; top: 8px; left: 8px; z-index: 10; width: 16px; height: 16px; cursor: pointer;">
                </div>`;
    });
    html += '</div>';
    recentDecksDiv.innerHTML = html;
    recentDecksDiv.style.display = 'block';
  }

  // Add deck to recent list
  async function addToRecentDecks(url, deckData) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();

    // Get leader art URL and base aspect
    console.log('Deck data:', deckData);
    const leaderArt = deckData.leader?.FrontArt || (deckData.leader ? `https://cdn.swu-db.com/images/cards/${deckData.leader.id.replace('_', '/')}.png` : null);

    // Fetch base card data to get correct aspect
    let baseAspect = 'Command'; // Default
    if (deckData.base?.id) {
      try {
        const baseCardData = await fetchCardData(deckData.base.id);
        if (baseCardData?.Aspects?.length > 0) {
          baseAspect = baseCardData.Aspects[0];
        }
      } catch (e) {
        // ignore
      }
    }

    console.log('Leader art:', leaderArt);
    console.log('Base aspect:', baseAspect);

    // Remove if already exists
    recentDecks = recentDecks.filter(deck => deck.url !== url);

    // Add to front of array
    recentDecks.unshift({
      url,
      name: deckData.metadata?.name || 'Unnamed Deck',
      leaderArt,
      baseAspect,
      date: dateStr
    });

    // Keep only last 8 recent decks
    if (recentDecks.length > MAX_RECENT_DECKS) {
      recentDecks = recentDecks.slice(0, MAX_RECENT_DECKS);
    }

    // Save to localStorage
    localStorage.setItem('recentDecks', JSON.stringify(recentDecks));

    // Update UI
    updateRecentDecksUI();
  }

  // Load deck from URL
  async function loadDeckFromUrl(url) {
    const input = document.getElementById('deckUrl');
    if (input) input.value = url;
    // Extract deck ID from URL and always load fresh
    const deckId = window.getDeckIdFromUrl ? window.getDeckIdFromUrl(url) : url.split('/').pop();
    await loadDeckById(deckId, true); // true = bypass cache
  }

  // Track selected decks for quick compare
  let selectedDecks = [];

  // Toggle deck selection for quick compare
  function toggleDeckSelection(url, checkbox) {
    const container = checkbox.closest('.recent-deck-container');

    if (checkbox.checked) {
      if (selectedDecks.length < 2) {
        selectedDecks.push(url);
        container.classList.add('selected');
      } else {
        // Already have 2 selected, uncheck this one
        checkbox.checked = false;
        alert('You can only select 2 decks for comparison. Uncheck another deck first.');
      }
    } else {
      selectedDecks = selectedDecks.filter(deck => deck !== url);
      container.classList.remove('selected');
    }

    // Update the compare button state
    updateCompareButton();
  }

  // Update the compare button based on selection
  function updateCompareButton() {
    const compareBtn = document.querySelector('button[onclick="quickCompare()"]');
    if (compareBtn) {
      if (selectedDecks.length === 2) {
        compareBtn.textContent = 'Compare Selected (2)';
        compareBtn.style.background = '#00a651';
      } else {
        compareBtn.textContent = `Compare Selected (${selectedDecks.length}/2)`;
        compareBtn.style.background = '#0066cc';
      }
    }
  }

  // Quick compare function
  function quickCompare() {
    if (selectedDecks.length !== 2) {
      alert('Please select exactly 2 decks to compare.');
      return;
    }

    const deck1Id = selectedDecks[0].split('/').pop();
    const deck2Id = selectedDecks[1].split('/').pop();

    // Open compare page with both decks
    window.open(`compare.html?deck1=${deck1Id}&deck2=${deck2Id}`, '_blank');

    // Clear selection
    selectedDecks = [];
    document.querySelectorAll('.deck-checkbox').forEach(cb => {
      cb.checked = false;
      cb.closest('.recent-deck-container').classList.remove('selected');
    });
    updateCompareButton();
  }

  // Check for deck ID in URL when page loads
  window.addEventListener('load', function () {
    // Check for deck in query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck');

    if (deckId) {
      // Populate input with full URL
      const input = document.getElementById('deckUrl');
      if (input) input.value = `https://swudb.com/deck/${deckId}`;
      loadDeckById(deckId);
    }

    // Initialize recent decks UI
    updateRecentDecksUI();
  });

  // Modify the loadDeck function
  async function loadDeck() {
    const urlInputEl = document.getElementById('deckUrl');
    const urlInput = urlInputEl ? urlInputEl.value.trim() : '';
    const output = document.getElementById('output');
    const errorDiv = document.getElementById('error');
    const loading = document.getElementById('loading');

    if (errorDiv) errorDiv.textContent = '';
    if (output) output.innerHTML = '';
    if (loading) loading.style.display = 'inline';

    try {
      if (!urlInput) {
        throw new Error('No deck URL or ID provided');
      }

      // Try to extract a deck ID robustly. Supported inputs:
      // - full URL (https://swudb.com/deck/<id>)
      // - raw deck ID
      // - other URL-like strings
      let deckId = null;

      if (typeof window !== 'undefined' && typeof window.getDeckIdFromUrl === 'function') {
        deckId = window.getDeckIdFromUrl(urlInput);
      } else {
        // If input looks like a plain deck id (no spaces, no scheme), use it directly
        const looksLikeId = /^[A-Za-z0-9_-]+$/.test(urlInput);
        if (looksLikeId) {
          deckId = urlInput;
        } else {
          // Try to construct a URL; if it fails, fall back to naive split
          try {
            const u = new URL(urlInput);
            const parts = u.pathname.split('/').filter(Boolean);
            deckId = parts[parts.length - 1] || null;
          } catch (e) {
            // fallback: split on slashes
            deckId = urlInput.split('/').filter(Boolean).pop() || null;
          }
        }
      }

      if (!deckId) {
        throw new Error('Could not extract deck ID from input');
      }

      await loadDeckById(deckId);

      // Update URL without reloading the page
      window.history.pushState({}, '', `?deck=${deckId}`);

    } catch (err) {
      console.error('Error loading deck:', err);
      if (errorDiv) errorDiv.textContent = `Error: ${err.message}. Please verify the deck URL is correct and try again.`;
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  // Load deck by ID (fetches deck JSON and renders it)
  async function loadDeckById(deckId, bypassCache = false) {
    const errorDiv = document.getElementById('error');
    const output = document.getElementById('output');
    const loading = document.getElementById('loading');

    if (errorDiv) errorDiv.textContent = '';
    if (output) output.innerHTML = '';
    if (loading) loading.style.display = 'inline';

    try {
      if (!deckId) throw new Error('No deck ID provided');

      console.log('Loading deck by id:', deckId, bypassCache ? '(bypass cache)' : '');

      const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
      const hostname = window.location && window.location.hostname ? window.location.hostname : '';
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
      const preferDirect = (typeof localStorage !== 'undefined' && localStorage.getItem('useDirectFetch') === 'true');

      let deckData;
      if (isLocalHost || preferDirect) {
        console.info('Using direct fetch (fetchWithRetry)');
        deckData = await window.fetchWithRetry(targetUrl, 3, bypassCache);
      } else {
        console.info('Using external proxy (fetchUsingExternalProxy)');
        deckData = await window.fetchUsingExternalProxy(targetUrl, 3, bypassCache);
      }

      if (!deckData) throw new Error('Failed to load deck data - Server returned empty response');
      if (deckData.error) throw new Error(`API Error: ${deckData.error}`);
      if (!deckData.deck) throw new Error('Invalid deck data format received from server');

      // Add to recent decks UI
      try {
        await addToRecentDecks(`https://swudb.com/deck/${deckId}`, deckData);
      } catch (e) {
        console.warn('Failed to add to recent decks', e);
      }

      // Group cards and render
      const grouped = await groupCards(deckData.deck);
      await displayDeck(deckData, grouped);

      // Update history
      if (window.setQueryParam) window.setQueryParam('deck', deckId);

    } catch (err) {
      console.error('Error in loadDeckById:', err);
      const errorDiv = document.getElementById('error');
      if (errorDiv) errorDiv.textContent = `Error: ${err.message}. Please verify the deck ID is correct and try again.`;
    } finally {
      const loading = document.getElementById('loading');
      if (loading) loading.style.display = 'none';
    }
  }

  // Group cards into sets and sort within sets
  async function groupCards(cards) {
    if (!Array.isArray(cards)) return {};
    const sets = {};
    for (const card of cards) {
      if (!card || !card.id) continue;
      const [set, num] = card.id.split('_');
      if (!set) continue;
      if (!sets[set]) sets[set] = [];
      sets[set].push({ id: card.id, number: parseInt(num, 10), count: card.count || 1 });
    }

    Object.keys(sets).forEach(set => {
      sets[set].sort((a, b) => a.number - b.number);
    });

    // Order sets according to loadSets() if available
    const ordered = {};
    try {
      const order = (typeof window.loadSets === 'function') ? window.loadSets() : null;
      if (Array.isArray(order)) {
        order.forEach(s => { if (sets[s]) ordered[s] = sets[s]; });
      }
    } catch (e) {
      // ignore
    }
    Object.keys(sets).forEach(s => { if (!ordered[s]) ordered[s] = sets[s]; });
    return ordered;
  }

  // Display deck -- this uses card-module.js helpers like fetchCardData and buildCardHTML
  async function displayDeck(deckData, grouped) {
    const { metadata } = deckData;
    const deckUrlInput = document.getElementById('deckUrl');
    const deckUrl = deckUrlInput ? deckUrlInput.value.trim() : '';
    let html = `<h2><a href="${deckUrl}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #666;">${metadata?.name || 'Unnamed Deck'}</a></h2>`;

    // Sorting controls
    html += `
      <div class="sort-controls">
        <span class="sort-label">Group by:</span>
        <button class="sort-button active" onclick="resortCards('set', this)">Set & Number</button>
        <button class="sort-button" onclick="resortCards('cost', this)">Cost</button>
        <button class="sort-button" onclick="resortCards('aspect', this)">Aspect</button>
        <button class="sort-button" onclick="resortCards('type', this)">Card Type</button>
        <button class="sort-button" onclick="resortCards('trait', this)">Traits</button>
      </div>`;

    // Leaders & base
    if (deckData.leader || deckData.secondleader || deckData.base) {
      html += '<div class="deck-header">';
      html += '<div class="section-title">Leaders & Base</div>';
      if (deckData.leader) {
        const leaderCard = await fetchCardData(deckData.leader.id);
        html += buildCardHTML(deckData.leader.id, leaderCard);
      }
      if (deckData.secondleader) {
        const secondLeaderCard = await fetchCardData(deckData.secondleader.id);
        html += buildCardHTML(deckData.secondleader.id, secondLeaderCard);
      }
      if (deckData.base) {
        const baseCard = await fetchCardData(deckData.base.id);
        html += buildCardHTML(deckData.base.id, baseCard);
      }
      html += '</div>';
    }

    // Prepare card map for resorting
    window.currentDeckCards = [];
    const cardMap = new Map();

    for (const set of Object.keys(grouped)) {
      for (const card of grouped[set]) {
        const cardData = await fetchCardData(card.id);
        cardMap.set(card.id, { id: card.id, count: card.count, sideboardCount: 0, data: cardData });
      }
    }

    // Sideboard
    if (Array.isArray(deckData.sideboard) && deckData.sideboard.length > 0) {
      const groupedSide = await groupCards(deckData.sideboard);
      for (const set of Object.keys(groupedSide)) {
        for (const card of groupedSide[set]) {
          if (cardMap.has(card.id)) {
            cardMap.get(card.id).sideboardCount = card.count;
          } else {
            const cardData = await fetchCardData(card.id);
            cardMap.set(card.id, { id: card.id, count: 0, sideboardCount: card.count, data: cardData });
          }
        }
      }
    }

    window.currentDeckCards = Array.from(cardMap.values());

    // Initial render sorted by set
    html += await displaySortedCards('set');

    const output = document.getElementById('output');
    if (output) output.innerHTML = html;
  }

  // Render cards according to sort type (set/cost/aspect/type/trait)
  async function displaySortedCards(sortType = 'set') {
    const cards = window.currentDeckCards || [];
    if (!Array.isArray(cards)) return '';

    let html = '<div class="cards-grid">';

    if (sortType === 'set') {
      // Group by set from each card's id
      const groups = {};
      cards.forEach(c => {
        const set = c.id.split('_')[0] || 'UNKNOWN';
        if (!groups[set]) groups[set] = [];
        groups[set].push(c);
      });
      for (const set of Object.keys(groups)) {
        html += `<div class="set-section"><div class="set-title">${set}</div><div class="card-grid">`;
        for (const c of groups[set]) {
          html += buildCardHTML(c.id, c.data, c.count, c.sideboardCount);
        }
        html += '</div></div>';
      }
    } else {
      // Fallback: simple flat grid sorted by attribute
      const sorted = cards.slice();
      if (sortType === 'cost') sorted.sort((a,b) => (a.data?.Cost||0)-(b.data?.Cost||0));
      if (sortType === 'aspect') sorted.sort((a,b)=>((a.data?.Aspects?.[0]||'')>(b.data?.Aspects?.[0]||'')?1:-1));
      if (sortType === 'type') sorted.sort((a,b)=>((a.data?.Type||'')>(b.data?.Type||'')?1:-1));
      if (sortType === 'trait') sorted.sort((a,b)=>((a.data?.Traits?.[0]||'')>(b.data?.Traits?.[0]||'')?1:-1));
      for (const c of sorted) {
        html += buildCardHTML(c.id, c.data, c.count, c.sideboardCount);
      }
    }

    html += '</div>';
    return html;
  }

  // Called by the sort buttons; toggles active button styling
  function resortCards(type, btn) {
    document.querySelectorAll('.sort-button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Re-render the cards area
    const output = document.getElementById('output');
    if (!output) return;
    (async () => {
      const restHtml = await displaySortedCards(type);
      // Replace only the cards grid portion (simple approach: append to existing header)
      const headerEnd = output.innerHTML.indexOf('<div class="cards-grid">');
      if (headerEnd >= 0) {
        output.innerHTML = output.innerHTML.slice(0, headerEnd) + restHtml;
      } else {
        output.innerHTML += restHtml;
      }
    })();
  }

  // Clear card cache wrapper used by index.html button
  function clearSetCache() {
    if (typeof clearCardCache === 'function') clearCardCache();
    // Also clear recent decks
    recentDecks = [];
    localStorage.removeItem('recentDecks');
    updateRecentDecksUI();
  }

  // Expose functions used by inline handlers
  window.loadDeck = loadDeck;
  window.loadDeckFromUrl = loadDeckFromUrl;
  window.toggleDeckSelection = toggleDeckSelection;
  window.quickCompare = quickCompare;
  window.resortCards = resortCards;
  window.clearSetCache = clearSetCache;

})();
