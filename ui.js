// ui.js - extracted UI and deck functions from index.html
// Minimal IIFE to avoid leaking unexpected locals
(function () {
  'use strict';

  // External proxy used for static deployments (AllOrigins /get wrapper is CORS-friendly)
  const PROXY = 'https://api.allorigins.win/get?url=';
  const TIMEOUT_MS = 10000; // 10 second timeout

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
    const deckId = url.split('/').pop();
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
      null, // try direct first
      // Prefer the `get` wrapper which returns a CORS-friendly JSON wrapper
      'https://api.allorigins.win/get?url=',
      // Other known proxies
      'https://thingproxy.freeboard.io/fetch/',
      'https://cors.bridged.cc/'
    ];

    // Helper to build the proxied URL for a given proxy entry
    const buildProxyUrl = (proxy, targetUrl) => {
      if (!proxy) return targetUrl;
      // allorigins expects an encoded URL
      if (proxy.includes('allorigins')) return `${proxy}${encodeURIComponent(targetUrl)}`;
      // some proxies accept the raw URL appended
      if (proxy.endsWith('/fetch/') || proxy.endsWith('/')) return `${proxy}${targetUrl}`;
      // default to encoding
      return `${proxy}${encodeURIComponent(targetUrl)}`;
    };

    // Try each proxy in order; for each proxy attempt up to `retries` times with backoff
    let lastError = null;
    for (const proxy of proxies) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          console.info(`fetchWithRetry: attempt ${attempt + 1}/${retries} using proxy=${proxy || 'direct'}`);
           const controller = new AbortController();
           const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

           // Build final URL and optionally append cache-bypass param
           const target = buildProxyUrl(proxy, bypassCache ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` : url);

          const response = await fetch(target, {
            signal: controller.signal,
            // If we're using a proxy, let the proxy decide caching; otherwise allow default
            cache: bypassCache ? 'no-cache' : 'default'
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            // Non-2xx response; try again or move to next proxy
            throw new Error(`HTTP error from ${proxy || 'direct'} fetch: ${response.status}`);
          }

          // If using certain proxies (like allorigins.get) they return a JSON wrapper
          if (proxy && proxy.includes('allorigins') && target.includes('/get?url=')) {
            const wrapper = await response.json();
            if (wrapper && wrapper.contents) {
              try {
                // contents might be JSON text
                return JSON.parse(wrapper.contents);
              } catch (e) {
                // Not JSON inside contents, return as-is
                return wrapper.contents;
              }
            }
            throw new Error('AllOrigins returned an unexpected wrapper');
          }

          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          }

          // If we get here the response wasn't JSON; attempt to parse text as JSON
          const text = await response.text();
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error('Response was not JSON');
          }
        } catch (error) {
          lastError = error;
          // Log helpful diagnostic for network/CORS failures and move on
          if (error instanceof TypeError || (error && /Failed to fetch|NetworkError|CORS|No 'Access-Control-Allow-Origin'/.test(String(error.message)))) {
            console.warn(`Fetch attempt failed (proxy=${proxy || 'direct'}), likely network/CORS:`, error.message || error);
          } else {
            console.warn(`Fetch attempt failed (proxy=${proxy || 'direct'}):`, error.message || error);
          }
          // If this was the last attempt for this proxy, break to try the next proxy
          if (attempt === retries - 1) break;
          // small exponential backoff before retrying same proxy
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      // move to next proxy
    }

    // After exhausting proxies and retries, throw the last seen error
    throw new Error(`All attempts failed: ${lastError ? lastError.message : 'unknown error'}`);
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
      // Extract deck ID from URL
      const url = new URL(urlInput);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const deckId = pathSegments[pathSegments.length - 1];

      if (!deckId) {
        throw new Error('Invalid SWUDB URL - Could not extract deck ID');
      }

      await loadDeckById(deckId);

      // Update URL without reloading the page
      window.history.pushState({}, '', `?deck=${deckId}`);

    } catch (err) {
      console.error('Error loading deck:', err);
      if (errorDiv) errorDiv.textContent = `Error: ${err.message}. Please verify the deck URL is correct and try again.`;
      if (loading) loading.style.display = 'none';
    }
  }

  async function loadDeckById(deckId, bypassCache = false) {
    const errorDiv = document.getElementById('error');
    const output = document.getElementById('output');
    const loading = document.getElementById('loading');

    try {
      console.log('Loading deck:', deckId, bypassCache ? '(bypassing cache)' : '');

      // Use the CORS proxy for the API endpoint
      // Let fetchWithRetry try direct fetch first, then fallbacks/proxies
      const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
      let deckData;
      // Always use the external proxy to fetch deck JSON to avoid CORS issues
      console.info('Using external proxy for fetch (production/static) [forced]');
      deckData = await fetchUsingExternalProxy(targetUrl, 3, bypassCache);

      if (!deckData) {
        throw new Error('Failed to load deck data - Server returned empty response');
      }

      if (deckData.error) {
        throw new Error(`API Error: ${deckData.error}`);
      }

      // Validate deck data structure
      if (!deckData.deck) {
        throw new Error('Invalid deck data format received from server');
      }

      // Add to recent decks
      await addToRecentDecks(`https://swudb.com/deck/${deckId}`, deckData);

      // Process cards
      const grouped = await groupCards(deckData.deck);
      console.log('Grouped sets:', grouped);

      // Log sideboard info
      console.log('Sideboard data:', deckData.sideboard);
      if (deckData.sideboard) {
        console.log('Sideboard length:', deckData.sideboard.length);
        console.log('Sideboard cards:', deckData.sideboard);
      }

      await displayDeck(deckData, grouped);

      // Update URL without reloading the page
      window.history.pushState({}, '', `?deck=${deckId}`);

    } catch (err) {
      console.error('Error loading deck:', err);
      if (errorDiv) errorDiv.textContent = `Error: ${err.message}. Please verify the deck ID is correct and try again.`;
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  async function groupCards(cards) {
    if (!Array.isArray(cards)) {
      console.error('Invalid cards data:', cards);
      return {};
    }

    const sets = {};
    cards.forEach(card => {
      if (!card || !card.id) {
        console.warn('Invalid card data:', card);
        return;
      }

      const [set, num] = card.id.split('_');
      if (!set || !num) {
        console.warn('Invalid card ID format:', card.id);
        return;
      }

      if (!sets[set]) sets[set] = [];
      sets[set].push({
        id: card.id,
        number: parseInt(num, 10),
        count: card.count || 1
      });
    });

    // Sort cards within each set
    Object.keys(sets).forEach(set => {
      sets[set].sort((a, b) => a.number - b.number);
    });

    // Create a new object with sets in the desired order
    const orderedSets = {};
    const setOrder = loadSets();
    setOrder.forEach(set => {
      if (sets[set]) {
        orderedSets[set] = sets[set];
      }
    });
    // Add any unexpected sets after the known order
    Object.keys(sets).forEach(set => {
      if (!orderedSets[set]) {
        orderedSets[set] = sets[set];
      }
    });

    return orderedSets;
  }

  async function displayDeck(deckData, grouped) {
    const { metadata, leader, secondleader, base, sideboard } = deckData;
    const deckUrlInput = document.getElementById('deckUrl');
    const deckUrl = deckUrlInput ? deckUrlInput.value.trim() : '';
    let html = `<h2><a href="${deckUrl}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #666;">${metadata?.name || 'Unnamed Deck'}</a></h2>`;

    // Add sorting controls
    html += `
            <div class="sort-controls">
                <span class="sort-label">Group by:</span>
                <button class="sort-button active" onclick="resortCards('set', this)">Set & Number</button>
                <button class="sort-button" onclick="resortCards('cost', this)">Cost</button>
                <button class="sort-button" onclick="resortCards('aspect', this)">Aspect</button>
                <button class="sort-button" onclick="resortCards('type', this)">Card Type</button>
                <button class="sort-button" onclick="resortCards('trait', this)">Traits</button>
            </div>`;

    // Display leaders and base in the same grid
    if (leader || secondleader || base) {
      html += '<div class="deck-header">';
      html += '<div class="section-title">Leaders & Base</div>';
      if (leader) {
        const leaderCard = await fetchCardData(leader.id);
        html += buildCardHTML(leader.id, leaderCard);
      }
      if (secondleader) {
        const secondLeaderCard = await fetchCardData(secondleader.id);
        html += buildCardHTML(secondleader.id, secondLeaderCard);
      }
      if (base) {
        const baseCard = await fetchCardData(base.id);
        html += buildCardHTML(base.id, baseCard);
      }
      html += '</div>';
    }

    // Store the grouped cards for resorting
    window.currentDeckCards = [];
    const cardMap = new Map(); // To keep track of unique cards

    // Process main deck cards
    for (const set of Object.keys(grouped)) {
      for (const card of grouped[set]) {
        const cardData = await fetchCardData(card.id);
        cardMap.set(card.id, {
          id: card.id,
          count: card.count,
          sideboardCount: 0,
          data: cardData
        });
      }
    }

    // Add sideboard cards to the same map
    if (Array.isArray(deckData.sideboard) && deckData.sideboard.length > 0) {
      const groupedSide = await groupCards(deckData.sideboard);
      for (const set of Object.keys(groupedSide)) {
        for (const card of groupedSide[set]) {
          if (cardMap.has(card.id)) {
            // Card already present in main deck, add only sideboard count
            cardMap.get(card.id).sideboardCount = card.count;
          } else {
            // Card only in the sideboard
            const cardData = await fetchCardData(card.id);
            cardMap.set(card.id, {
              id: card.id,
              count: 0,
              sideboardCount: card.count,
              data: cardData
            });
          }
        }
      }
    }

    // Convert map to array
    window.currentDeckCards = Array.from(cardMap.values());

    // Initial sort by set
    html += await displaySortedCards('set');

    if (output) {
      output.innerHTML = html;
    } else {
      const outEl = document.getElementById('output');
      if (outEl) outEl.innerHTML = html;
    }
  }

  async function displaySortedCards(sortType) {
    if (!window.currentDeckCards) return '';

    let html = '';
    switch (sortType) {
      case 'cost':
        // Group by cost
        const costGroups = {};
        window.currentDeckCards.forEach(card => {
          const cost = card.data.Cost !== undefined ? card.data.Cost : 'X';
          if (!costGroups[cost]) costGroups[cost] = [];
          costGroups[cost].push(card);
        });

        Object.keys(costGroups).sort((a, b) => {
          if (a === 'X') return 1;
          if (b === 'X') return -1;
          return parseInt(a) - parseInt(b);
        }).forEach(cost => {
          html += `
                            <div class="set-group">
                                <div class="set-header">Cost: ${cost}</div>
                                <div class="card-grid">
                                    ${costGroups[cost].map(card => 
                                        buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                    ).join('')}
                                </div>
                            </div>`;
        });
        return html;

      case 'aspect':
        // Group by aspect
        const aspectGroups = {};
        window.currentDeckCards.forEach(card => {
          const aspects = card.data.Aspects || ['None'];
          aspects.forEach(aspect => {
            if (!aspectGroups[aspect]) aspectGroups[aspect] = [];
            aspectGroups[aspect].push(card);
          });
        });

        return Object.keys(aspectGroups).sort().map(aspect => `
                        <div class="set-group">
                            <div class="set-header">${aspect}</div>
                            <div class="card-grid">
                                ${aspectGroups[aspect].map(card => 
                                    buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                ).join('')}
                            </div>
                        </div>`
        ).join('');

      case 'type':
        // Group by card type with space/ground separation
        const typeGroups = {};
        window.currentDeckCards.forEach(card => {
          let type = card.data.Type || 'Unknown';
          console.log('Card:', card.data.Name, 'Type:', type, 'Arenas:', card.data.Arenas);

          // Split units into Space and Ground based on Arenas field
          if (type === 'Unit') {
            if (card.data.Arenas && card.data.Arenas.includes('Space')) {
              type = 'Space Unit';
            } else {
              type = 'Ground Unit';
            }
          }
          if (!typeGroups[type]) typeGroups[type] = [];
          typeGroups[type].push(card);
        });

        console.log('Final groups:', typeGroups);

        // Define type order with Ground Units first
        const typeOrder = ['Ground Unit', 'Space Unit', 'Event', 'Upgrade', 'Unknown'];
        return typeOrder
          .filter(type => typeGroups[type] && typeGroups[type].length > 0)
          .map(type => `
                            <div class="set-group">
                                <div class="set-header">${type} (${typeGroups[type].length})</div>
                                <div class="card-grid">
                                    ${typeGroups[type].map(card => 
                                        buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                    ).join('')}
                                </div>
                            </div>`
          ).join('');

      case 'trait':
        // Group by traits
        const traitGroups = {};
        window.currentDeckCards.forEach(card => {
          console.log('Processing card:', card.data.Name);
          console.log('Raw Traits:', card.data.Traits);

          // Handle traits that are already an array or convert string to array
          const traits = Array.isArray(card.data.Traits)
            ? card.data.Traits
            : (card.data.Traits || '').split(',').map(t => t.trim());

          // Filter out empty traits
          const validTraits = traits.filter(t => t);

          console.log('Processed Traits:', validTraits);

          if (validTraits.length === 0) {
            // Handle cards with no traits
            if (!traitGroups['No Traits']) traitGroups['No Traits'] = [];
            traitGroups['No Traits'].push(card);
            console.log('Added to No Traits group');
          } else {
            // Add card to each of its trait groups
            validTraits.forEach(trait => {
              if (!traitGroups[trait]) {
                traitGroups[trait] = [];
                console.log('Created new trait group:', trait);
              }
              traitGroups[trait].push(card);
              console.log('Added to trait group:', trait);
            });
          }
        });

        console.log('Final trait groups:', traitGroups);

        // Sort trait groups alphabetically, but put "No Traits" at the end
        const sortedTraits = Object.keys(traitGroups)
          .sort((a, b) => {
            if (a === 'No Traits') return 1;
            if (b === 'No Traits') return -1;
            return a.localeCompare(b);
          });

        console.log('Sorted traits:', sortedTraits);

        return sortedTraits
          .map(trait => `
                            <div class="set-group">
                                <div class="set-header">${trait} (${traitGroups[trait].length})</div>
                                <div class="card-grid">
                                    ${traitGroups[trait].map(card => 
                                        buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                    ).join('')}
                                </div>
                            </div>`
          ).join('');

      default: // 'set'
        // Group by set
        const setGroups = {};
        window.currentDeckCards.forEach(card => {
          const [set] = card.id.split('_');
          if (!setGroups[set]) setGroups[set] = [];
          setGroups[set].push(card);
        });

        // Log per debug
        console.log('Set groups for display:', setGroups);

        // Use the same setOrder as groupCards
        const setOrder = loadSets();
        setOrder.forEach(set => {
          if (setGroups[set]) {
            html += `
                                <div class="set-group">
                                    <div class="set-header">${set}</div>
                                    <div class="card-grid">
                                        ${setGroups[set].map(card => 
                                            buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                        ).join('')}
                                    </div>
                                </div>`;
          }
        });
        // Add any unexpected sets after the known order
        Object.keys(setGroups).forEach(set => {
          if (!setOrder.includes(set)) {
            html += `
                                <div class="set-group">
                                    <div class="set-header">${set}</div>
                                    <div class="card-grid">
                                        ${setGroups[set].map(card => 
                                            buildCardHTML(card.id, card.data, card.count, card.sideboardCount)
                                        ).join('')}
                                    </div>
                                </div>`;
          }
        });
        return html;
    }
  }

  async function resortCards(sortType, clickedButton) {
    // Update active button state
    document.querySelectorAll('.sort-button').forEach(button => {
      button.classList.remove('active');
    });
    if (clickedButton) {
      clickedButton.classList.add('active');
    }

    // Store currently selected cards by their IDs
    const selectedCardIds = new Set(
      Array.from(document.querySelectorAll('.card.selected'))
        .map(card => card.getAttribute('data-card-id'))
    );

    const mainContent = await displaySortedCards(sortType);

    // Find the deck-header (leaders & base section)
    const deckHeader = document.querySelector('.deck-header');
    if (deckHeader) {
      // Replace everything after the deck-header
      let next = deckHeader.nextElementSibling;
      while (next) {
        const current = next;
        next = current.nextElementSibling;
        current.remove();
      }
      deckHeader.insertAdjacentHTML('afterend', mainContent);

      // Restore selected states
      document.querySelectorAll('.card').forEach(card => {
        if (selectedCardIds.has(card.getAttribute('data-card-id'))) {
          card.classList.add('selected');
        }
      });
    }
  }

  // Add a helper function to find elements by text content
  Document.prototype.querySelector = (function (querySelector) {
    return function (selector) {
      if (selector.includes(':contains(')) {
        const match = selector.match(/:contains\('([^']+)'\)/);
        if (match) {
          const text = match[1];
          const baseSelector = selector.replace(/:contains\('[^']+'\)/, '');
          const elements = this.querySelectorAll(baseSelector);
          return Array.from(elements).find(el => el.textContent.trim() === text);
        }
      }
      return querySelector.call(this, selector);
    };
  })(Document.prototype.querySelector);

  // Initialize recent decks UI is called on load above

  function clearSetCache() {
    // Clear card cache using shared module
    if (typeof clearCardCache === 'function') clearCardCache();

    // Clear recent decks from localStorage
    localStorage.removeItem('recentDecks');
    recentDecks = [];

    // Clear current deck global variable
    if (window.currentDeckCards) {
      delete window.currentDeckCards;
    }

    // Clear UI
    const recentEl = document.getElementById('recentDecks');
    if (recentEl) recentEl.style.display = 'none';
    const outEl = document.getElementById('output');
    if (outEl) outEl.innerHTML = '';
    const errEl = document.getElementById('error');
    if (errEl) errEl.textContent = '';
    const deckInput = document.getElementById('deckUrl');
    if (deckInput) deckInput.value = '';

    // Clear browser cache for images
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }

    // Reload page to ensure everything is completely reset
    window.location.href = window.location.pathname;
  }

  // Expose functions globally that are referenced from HTML attributes
  window.updateRecentDecksUI = updateRecentDecksUI;
  window.addToRecentDecks = addToRecentDecks;
  window.loadDeckFromUrl = loadDeckFromUrl;
  window.toggleDeckSelection = toggleDeckSelection;
  window.updateCompareButton = updateCompareButton;
  window.quickCompare = quickCompare;
  window.fetchWithRetry = fetchWithRetry;
  window.loadDeck = loadDeck;
  window.loadDeckById = loadDeckById;
  window.groupCards = groupCards;
  window.displayDeck = displayDeck;
  window.displaySortedCards = displaySortedCards;
  window.resortCards = resortCards;
  window.clearSetCache = clearSetCache;
})();
