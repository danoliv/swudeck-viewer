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
            sets[set].push({id: card.id, number: parseInt(num, 10), count: card.count || 1});
        }

        Object.keys(sets).forEach(set => {
            sets[set].sort((a, b) => a.number - b.number);
        });

        // Order sets according to loadSets() if available
        const ordered = {};
        try {
            const order = (typeof window.loadSets === 'function') ? window.loadSets() : null;
            if (Array.isArray(order)) {
                order.forEach(s => {
                    if (sets[s]) ordered[s] = sets[s];
                });
            }
        } catch (e) {
            // ignore
        }
        Object.keys(sets).forEach(s => {
            if (!ordered[s]) ordered[s] = sets[s];
        });
        return ordered;
    }

    // Display deck -- this uses card-module.js helpers like fetchCardData and buildCardHTML
    async function displayDeck(deckData, grouped) {
        const {metadata} = deckData;
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
                cardMap.set(card.id, {id: card.id, count: card.count, sideboardCount: 0, data: cardData});
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
                        cardMap.set(card.id, {id: card.id, count: 0, sideboardCount: card.count, data: cardData});
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
    /**
     * Registry Pattern for card grouping and sorting strategies
     */
    class CardSortRegistry {
        constructor() {
            this.strategies = new Map();
        }

        /**
         * Register a new sorting strategy
         * @param {string} name - Strategy identifier
         * @param {Object} strategy - Strategy object with groupBy, sortGroups, and sortWithinGroup methods
         */
        register(name, strategy) {
            this.strategies.set(name, strategy);
        }

        /**
         * Get a sorting strategy by name
         * @param {string} name - Strategy identifier
         * @returns {Object} Strategy object or null
         */
        get(name) {
            console.log('Getting strategy:', name);
            return this.strategies.get(name) || null;
        }

        /**
         * Check if a strategy exists
         * @param {string} name - Strategy identifier
         * @returns {boolean}
         */
        has(name) {
            return this.strategies.has(name);
        }

        /**
         * Get all registered strategy names
         * @returns {Array<string>}
         */
        getAll() {
            return Array.from(this.strategies.keys());
        }
    }

// Initialize global registry
    window.cardSortRegistry = new CardSortRegistry();

    /**
     * Base sorting strategy with common functionality
     */
    class BaseSortStrategy {
        /**
         * Extract grouping key from card
         * @param {Object} card - Card object
         * @returns {string} Group key
         */
        groupBy(card) {
            throw new Error('groupBy must be implemented');
        }

        /**
         * Sort group keys
         * @param {Array<string>} keys - Group keys to sort
         * @param {Object} groups - All groups
         * @returns {Array<string>} Sorted keys
         */
        sortGroups(keys, groups) {
            return keys.sort((a, b) => a.localeCompare(b));
        }

        /**
         * Sort cards within a group
         * @param {Array<Object>} cards - Cards to sort
         * @returns {Array<Object>} Sorted cards
         */
        sortWithinGroup(cards) {
            const order = typeof window.loadSets === 'function' ? window.loadSets() : null;

            return cards.sort((a, b) => {
                const [setA, numA] = (a.id || '').split('_');
                const [setB, numB] = (b.id || '').split('_');
                const nA = parseInt(numA, 10) || 0;
                const nB = parseInt(numB, 10) || 0;

                // Same set: sort by number
                if (setA === setB) return nA - nB;

                // Different sets: use set order if available
                if (Array.isArray(order)) {
                    const ia = order.indexOf(setA);
                    const ib = order.indexOf(setB);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                }

                // Fallback: alphabetical
                return (setA || '').localeCompare(setB || '');
            });
        }

        /**
         * Format group title for display
         * @param {string} key - Group key
         * @returns {string} Formatted title
         */
        formatTitle(key) {
            return key;
        }
    }

    /**
     * Sort by Set strategy
     */
    class SetSortStrategy extends BaseSortStrategy {
        groupBy(card) {
            return (card.id || '').split('_')[0] || 'UNKNOWN';
        }

        sortGroups(keys, groups) {
            const order = typeof window.loadSets === 'function' ? window.loadSets() : null;

            if (Array.isArray(order)) {
                const ordered = [];
                // Add keys that are in order
                order.forEach(k => {
                    if (keys.includes(k)) ordered.push(k);
                });
                // Add remaining keys
                keys.forEach(k => {
                    if (!ordered.includes(k)) ordered.push(k);
                });
                return ordered;
            }

            return keys.sort();
        }
    }

    /**
     * Sort by Cost strategy
     */
    class CostSortStrategy extends BaseSortStrategy {
        groupBy(card) {
            const cost = card.data?.Cost;
            if (cost === undefined || cost === null || cost === '') {
                return 'Cost: Unknown';
            }
            return `Cost: ${String(cost)}`;
        }

        sortGroups(keys, groups) {
            const numeric = [];
            const unknown = [];

            keys.forEach(k => {
                const match = k.match(/^Cost: (.+)$/);
                if (match) {
                    const value = match[1];
                    if (value === 'Unknown') {
                        unknown.push(k);
                    } else {
                        numeric.push({key: k, value: Number(value)});
                    }
                } else {
                    unknown.push(k);
                }
            });

            numeric.sort((a, b) => a.value - b.value);
            return numeric.map(x => x.key).concat(unknown);
        }
    }

    /**
     * Sort by Aspect strategy
     */
    class AspectSortStrategy extends BaseSortStrategy {
        groupBy(card) {
            const aspects = card.data?.Aspects;
            return (Array.isArray(aspects) && aspects.length)
                ? String(aspects[0])
                : 'Unknown';
        }

        sortGroups(keys, groups) {
            const known = keys.filter(k => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
            const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
            return known.concat(unknown);
        }
    }

    /**
     * Sort by Type strategy
     */
    class TypeSortStrategy extends BaseSortStrategy {
        groupBy(card) {
            return String(card.data?.Type || 'Unknown');
        }

        sortGroups(keys, groups) {
            const known = keys.filter(k => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
            const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
            return known.concat(unknown);
        }
    }

    /**
     * Sort by Trait strategy
     */
    class TraitSortStrategy extends BaseSortStrategy {
        groupBy(card) {
            const traits = card.data?.Traits;
            return (Array.isArray(traits) && traits.length)
                ? String(traits[0])
                : 'Unknown';
        }

        sortGroups(keys, groups) {
            const known = keys.filter(k => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
            const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
            return known.concat(unknown);
        }
    }

// Register all default strategies
    window.cardSortRegistry.register('set', new SetSortStrategy());
    window.cardSortRegistry.register('cost', new CostSortStrategy());
    window.cardSortRegistry.register('aspect', new AspectSortStrategy());
    window.cardSortRegistry.register('type', new TypeSortStrategy());
    window.cardSortRegistry.register('trait', new TraitSortStrategy());

    /**
     * Main function to display sorted cards
     * @param {string} sortType - Sorting strategy name
     * @returns {Promise<string>} HTML string
     */
    async function displaySortedCards(sortType = 'set') {
        const cards = window.currentDeckCards || [];
        if (!Array.isArray(cards) || cards.length === 0) return '';
        console.log('Displaying sorted cards:', sortType);
        // Get strategy from registry
        const strategy = window.cardSortRegistry.get(sortType);
        if (!strategy) {
            console.warn(`Sort strategy "${sortType}" not found. Using "set" as fallback.`);
            return displaySortedCards('set');
        }

        // Group cards
        const groups = {};
        cards.forEach(card => {
            const key = strategy.groupBy(card);
            if (!groups[key]) groups[key] = [];
            groups[key].push(card);
        });

        // Sort group keys
        const sortedKeys = strategy.sortGroups(Object.keys(groups), groups);

        // Build HTML
        let html = '<div class="cards-grid">';

        for (const key of sortedKeys) {
            const groupCards = groups[key];
            strategy.sortWithinGroup(groupCards);

            const title = strategy.formatTitle(key);
            html += `<div class="set-section">`;
            html += `<div class="set-title">${title}</div>`;
            html += `<div class="card-grid">`;

            for (const card of groupCards) {
                html += buildCardHTML(card.id, card.data, card.count, card.sideboardCount);
            }

            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    // Called by the sort buttons; toggles active button styling
    function resortCards(type, btn) {
        console.log('Resorting cards:', type);
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
