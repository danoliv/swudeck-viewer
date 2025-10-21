// compare.js
// Extracted from compare.html - contains deck fetching and comparison logic

// NOTE: fetch helpers and PROXY/TIMEOUT moved to shared.js. This file assumes
// shared.js is loaded before compare.js and exposes `fetchWithRetry` and
// `fetchUsingExternalProxy` on window.

// Store loaded deck data
let deck1Data = null;
let deck2Data = null;

async function loadDeck(deckNumber) {
    const inputEl = document.getElementById(`deck${deckNumber}Url`);
    const urlInput = inputEl ? (inputEl.value || '').trim() : '';
    const errorDiv = document.getElementById(`error${deckNumber}`);
    const loading = document.getElementById(`loading${deckNumber}`);
    const deckInfo = document.getElementById(`deck${deckNumber}Info`);
    
    errorDiv.textContent = '';
    deckInfo.style.display = 'none';
    loading.style.display = 'inline';

    try {
        if (!urlInput) {
            throw new Error('No deck URL or ID provided');
        }

        // Extract deck ID robustly
        let deckId = null;
        if (typeof window !== 'undefined' && typeof window.getDeckIdFromUrl === 'function') {
            deckId = window.getDeckIdFromUrl(urlInput);
        } else {
            const looksLikeId = /^[A-Za-z0-9_-]+$/.test(urlInput);
            if (looksLikeId) {
                deckId = urlInput;
            } else {
                try {
                    const u = new URL(urlInput);
                    const parts = u.pathname.split('/').filter(Boolean);
                    deckId = parts[parts.length - 1] || null;
                } catch (e) {
                    deckId = urlInput.split('/').filter(Boolean).pop() || null;
                }
            }
        }

        if (!deckId) {
            throw new Error('Invalid SWUDB URL - Could not extract deck ID');
        }

        const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
        const hostname = window.location && window.location.hostname ? window.location.hostname : '';
        const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
        const preferDirect = (typeof localStorage !== 'undefined' && localStorage.getItem('useDirectFetch') === 'true');
        let deckData;
        if (isLocalHost || preferDirect) {
            console.info('compare.html: using direct/dev fetch strategy (fetchWithRetry)');
            deckData = await window.fetchWithRetry(targetUrl, 3, true);
        } else {
            console.info('compare.html: using external proxy for fetch (production/static)');
            deckData = await window.fetchUsingExternalProxy(targetUrl, 3, true);
        }

        if (!deckData) {
            throw new Error('Failed to load deck data - Server returned empty response');
        }

        if (deckData.error) {
            throw new Error(`API Error: ${deckData.error}`);
        }

        if (!deckData.deck) {
            throw new Error('Invalid deck data format received from server');
        }

        // Store deck data
        if (deckNumber === 1) {
            deck1Data = deckData;
        } else {
            deck2Data = deckData;
        }

        // Display deck info
        // Use shared HTML helper for consistent rendering
        deckInfo.innerHTML = (window.deckInfoHTML && typeof window.deckInfoHTML === 'function')
            ? window.deckInfoHTML(deckData)
            : `\n                <div class="deck-name">${deckData.metadata?.name || 'Unnamed Deck'}</div>\n                <div class="deck-stats">\n                    Main Deck: ${deckData.deck ? deckData.deck.length : 0} cards<br>\n                    Sideboard: ${deckData.sideboard ? deckData.sideboard.length : 0} cards\n                </div>\n            `;
        deckInfo.style.display = 'block';

        // Update URL with deck ID
        // Use shared helper to set query params consistently
        if (window.setQueryParam) {
            if (deckNumber === 1) {
                window.setQueryParam('deck1', deckId);
            } else {
                window.setQueryParam('deck2', deckId);
            }
        } else {
            const currentUrl = new URL(window.location);
            if (deckNumber === 1) {
                currentUrl.searchParams.set('deck1', deckId);
            } else {
                currentUrl.searchParams.set('deck2', deckId);
            }
            window.history.pushState({}, '', currentUrl.toString());
        }

        // Check if both decks are loaded and compare
        if (deck1Data && deck2Data) {
            await compareDecks();
        }

    } catch (err) {
        console.error(`Error loading deck ${deckNumber}:`, err);
        errorDiv.textContent = `Error: ${err.message}. Please verify the deck URL is correct and try again.`;
    } finally {
        loading.style.display = 'none';
    }
}

async function compareDecks() {
    if (!deck1Data || !deck2Data) return;

    const resultsDiv = document.getElementById('comparisonResults');
    resultsDiv.style.display = 'block';

    // Build consolidated card count maps using shared helper
    const deck1Cards = (window.buildDeckCardCounts && typeof window.buildDeckCardCounts === 'function')
        ? window.buildDeckCardCounts(deck1Data)
        : new Map();
    const deck2Cards = (window.buildDeckCardCounts && typeof window.buildDeckCardCounts === 'function')
        ? window.buildDeckCardCounts(deck2Data)
        : new Map();

    // Find differences
    const allCardIds = new Set([...deck1Cards.keys(), ...deck2Cards.keys()]);
    const deck1Only = [];
    const deck2Only = [];
    const differentCounts = [];
    const sameCards = [];

    for (const cardId of allCardIds) {
        const counts1 = deck1Cards.get(cardId) || { main: 0, sideboard: 0 };
        const counts2 = deck2Cards.get(cardId) || { main: 0, sideboard: 0 };
        
        const total1 = counts1.main + counts1.sideboard;
        const total2 = counts2.main + counts2.sideboard;

        if (total1 > 0 && total2 === 0) {
            deck1Only.push({ id: cardId, main: counts1.main, sideboard: counts1.sideboard });
        } else if (total1 === 0 && total2 > 0) {
            deck2Only.push({ id: cardId, main: counts2.main, sideboard: counts2.sideboard });
        } else if (counts1.main !== counts2.main || counts1.sideboard !== counts2.sideboard) {
            differentCounts.push({ 
                id: cardId, 
                deck1Main: counts1.main, 
                deck1Sideboard: counts1.sideboard,
                deck2Main: counts2.main, 
                deck2Sideboard: counts2.sideboard 
            });
        } else if (total1 > 0 && total2 > 0) {
            sameCards.push({ id: cardId, main: counts1.main, sideboard: counts1.sideboard });
        }
    }

    // Get deck names
    const deck1Name = deck1Data.metadata?.name || 'Deck 1';
    const deck2Name = deck2Data.metadata?.name || 'Deck 2';
    
    // Generate comparison HTML
    let html = `<h2>Deck Comparison: ${deck1Name} vs ${deck2Name}</h2>`;
    
    // Summary stats
    html += `
        <div class="summary-stats">
            <div class="stat-card">
                <div class="stat-number">${deck1Only.length}</div>
                <div class="stat-label">Only in ${deck1Name}</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${deck2Only.length}</div>
                <div class="stat-label">Only in ${deck2Name}</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${differentCounts.length}</div>
                <div class="stat-label">Different Counts</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${sameCards.length}</div>
                <div class="stat-label">Same Cards</div>
            </div>
        </div>
    `;

    // Cards only in deck 1
    if (deck1Only.length > 0) {
        html += `
            <div class="comparison-section">
                <div class="comparison-header">Only in ${deck1Name} (${deck1Only.length} cards)</div>
                <div class="comparison-content">
                    <div class="card-grid">
                        ${(await Promise.all(deck1Only.map(async card => {
                            const cardData = await fetchCardData(card.id);
                            return buildComparisonCardHTML(card.id, cardData, card.main, 0, 'deck1-only', deck1Name, deck2Name, card.sideboard, 0);
                        }))).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Cards only in deck 2
    if (deck2Only.length > 0) {
        html += `
            <div class="comparison-section">
                <div class="comparison-header">Only in ${deck2Name} (${deck2Only.length} cards)</div>
                <div class="comparison-content">
                    <div class="card-grid">
                        ${(await Promise.all(deck2Only.map(async card => {
                            const cardData = await fetchCardData(card.id);
                            return buildComparisonCardHTML(card.id, cardData, 0, card.main, 'deck2-only', deck1Name, deck2Name, 0, card.sideboard);
                        }))).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Cards with different counts
    if (differentCounts.length > 0) {
        html += `
            <div class="comparison-section">
                <div class="comparison-header">Different Counts (${differentCounts.length} cards)</div>
                <div class="comparison-content">
                    <div class="card-grid">
                        ${(await Promise.all(differentCounts.map(async card => {
                            const cardData = await fetchCardData(card.id);
                            return buildComparisonCardHTML(card.id, cardData, card.deck1Main, card.deck2Main, 'different-count', deck1Name, deck2Name, card.deck1Sideboard, card.deck2Sideboard);
                        }))).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Same cards
    if (sameCards.length > 0) {
        html += `
            <div class="comparison-section">
                <div class="comparison-header">Same Cards (${sameCards.length} cards)</div>
                <div class="comparison-content">
                    <div class="card-grid">
                        ${(await Promise.all(sameCards.map(async card => {
                            const cardData = await fetchCardData(card.id);
                            return buildComparisonCardHTML(card.id, cardData, card.main, card.main, 'same-card', deck1Name, deck2Name, card.sideboard, card.sideboard);
                        }))).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    resultsDiv.innerHTML = html;
}

// Reverse deck order function
async function reverseDeckOrder() {
    if (!deck1Data || !deck2Data) {
        alert('Both decks must be loaded to reverse order');
        return;
    }

    // Swap the deck data
    const tempData = deck1Data;
    deck1Data = deck2Data;
    deck2Data = tempData;

    // Update the URL parameters (swap deck1/deck2)
    const url1 = document.getElementById('deck1Url').value;
    const url2 = document.getElementById('deck2Url').value;
    const id1 = window.getDeckIdFromUrl ? window.getDeckIdFromUrl(url1) : url1.split('/').pop();
    const id2 = window.getDeckIdFromUrl ? window.getDeckIdFromUrl(url2) : url2.split('/').pop();

    if (window.setQueryParams) {
        window.setQueryParams({ deck1: id2, deck2: id1 });
    } else {
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set('deck1', id2);
        currentUrl.searchParams.set('deck2', id1);
        window.history.pushState({}, '', currentUrl.toString());
    }

    // Swap the input field values
    document.getElementById('deck1Url').value = url2;
    document.getElementById('deck2Url').value = url1;

    // Swap the deck info displays
    const deck1Info = document.getElementById('deck1Info');
    const deck2Info = document.getElementById('deck2Info');
    const tempInfo = deck1Info.innerHTML;
    deck1Info.innerHTML = deck2Info.innerHTML;
    deck2Info.innerHTML = tempInfo;

    // Regenerate the comparison
    await compareDecks();
}

// Check for deck IDs in URL when page loads
window.addEventListener('load', async function() {
    const deck1Id = window.getQueryParam ? window.getQueryParam('deck1') : (new URLSearchParams(window.location.search)).get('deck1');
    const deck2Id = window.getQueryParam ? window.getQueryParam('deck2') : (new URLSearchParams(window.location.search)).get('deck2');

    if (deck1Id) {
        const el1 = document.getElementById('deck1Url');
        if (el1) el1.value = `https://swudb.com/deck/${deck1Id}`;
        await loadDeck(1);
    }
    if (deck2Id) {
        const el2 = document.getElementById('deck2Url');
        if (el2) el2.value = `https://swudb.com/deck/${deck2Id}`;
        await loadDeck(2);
    }
});
