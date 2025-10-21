// Shared card module for SWU Deck Viewer
// This module provides consistent card rendering across all pages

// Card data cache
const cardSets = {};
const loadingPromises = {};

// Load card set data
async function loadCardSet(set) {
    // Return cached data if available
    if (cardSets[set]) {
        return cardSets[set];
    }

    // Return existing promise if the set is already being loaded
    if (loadingPromises[set]) {
        return loadingPromises[set];
    }

    // Create new loading promise
    loadingPromises[set] = (async () => {
        try {
            console.log(`Loading set ${set}...`);
            const response = await fetch(`data/${set.toLowerCase()}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${set} data: ${response.status}`);
            }
            const data = await response.json();
            
            // Check if data has the expected structure
            const cards = data.data;
            if (!Array.isArray(cards)) {
                throw new Error(`Invalid data format for set ${set}: expected array in data property`);
            }
            
            console.log(`Successfully loaded set ${set} with ${cards.length} cards`);
            
            // Index cards by their number for faster lookup
            cardSets[set] = {};
            cards.forEach(card => {
                if (card.Number) {
                    // Convert string numbers to integers if needed
                    const cardNumber = parseInt(card.Number, 10);
                    cardSets[set][cardNumber] = card;
                }
            });
            
            return cardSets[set];
        } catch (error) {
            console.error(`Error loading set ${set}:`, error);
            delete cardSets[set]; // Remove failed cache entry
            throw error;
        } finally {
            delete loadingPromises[set]; // Clean up loading promise
        }
    })();

    return loadingPromises[set];
}

// Preload all sets
async function preloadSets() {
    try {
        // Simple resolver: prefer browser global, fall back to Node require.
        let sets = null;
        if (typeof window !== 'undefined' && typeof window.loadSets === 'function') {
            sets = window.loadSets();
        } else if (typeof require === 'function') {
            const mod = require('./sets.js');
            if (mod && typeof mod.loadSets === 'function') sets = mod.loadSets();
        }

        if (!Array.isArray(sets)) {
            console.error('loadSets() not found: please ensure sets.js is loaded before card-module.js (sets.js must expose loadSets()).');
            return;
        }

        await Promise.all(sets.map(set => loadCardSet(set)));
        console.log('All sets preloaded successfully');
    } catch (error) {
        console.error('Error preloading sets:', error);
    }
}

// Fetch card data by ID
async function fetchCardData(cardId) {
    const [set, num] = cardId.split('_');
    const number = parseInt(num, 10);
    
    try {
        const setData = await loadCardSet(set);
        if (!setData) {
            console.error(`Set ${set} not found`);
            throw new Error(`Set ${set} not found`);
        }

        const cardData = setData[number];
        if (!cardData) {
            console.warn(`Card ${cardId} not found in set ${set}`);
            return {
                id: cardId,
                Name: cardId,
                Set: set,
                Number: number,
                Type: 'Unknown'
            };
        }

        // Add the card ID to the data
        cardData.id = cardId;
        
        // Ensure we have a Type field
        if (!cardData.Type) {
            cardData.Type = 'Unknown';
        }

        return cardData;
    } catch (error) {
        console.error(`Error fetching card ${cardId}:`, error);
        return {
            id: cardId,
            Name: cardId,
            Set: set,
            Number: number,
            Type: 'Unknown'
        };
    }
}

// Build card HTML with consistent styling
function buildCardHTML(cardId, cardData = {}, count = 1, sideboardCount = 0, additionalClasses = '') {
    const aspects = cardData.Aspects || [];
    const stats = [];
    if (cardData.Cost !== undefined) stats.push(['Cost', cardData.Cost]);
    if (cardData.Power !== undefined) stats.push(['Power', cardData.Power]);
    if (cardData.HP !== undefined) stats.push(['HP', cardData.HP]);

    const formattedId = cardId.replace('_', ' ');
    const isDoubleSided = cardData.DoubleSided === true;
    
    // Create count text
    let countText = '';
    if (count > 0 && sideboardCount > 0) {
        countText = `Deck: ${count} | Side: ${sideboardCount}`;
    } else if (count > 0) {
        countText = `Deck: ${count}`;
    } else if (sideboardCount > 0) {
        countText = `Side: ${sideboardCount}`;
    }
    
    return `
        <div class="card ${additionalClasses}" 
            onclick="this.classList.toggle('selected')" 
            data-card-id="${formattedId}">
            <div class="card-id">
                <span>${formattedId}</span>
                ${isDoubleSided ? '<button class="flip-button" onclick="event.stopPropagation(); this.closest(\'.card\').classList.toggle(\'flipped\')">Flip Card</button>' : ''}
            </div>
            ${countText ? `<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${countText}</div>` : ''}
            <div class="card-name">${cardData.Name || cardId}</div>
            ${aspects.length ? `
                <div class="aspects">
                    ${aspects.map(aspect => `
                        <span class="aspect ${aspect}">${aspect}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${cardData.FrontArt ? 
                            `<img src="${cardData.FrontArt}" alt="${cardData.Name || cardId} (Front)">` : 
                            `<div class="card-placeholder">${cardId}</div>`}
                    </div>
                    ${isDoubleSided && cardData.BackArt ? `
                        <div class="card-back">
                            <img src="${cardData.BackArt}" alt="${cardData.Name || cardId} (Back)">
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="card-content">
                ${stats.length ? `
                    <div class="card-stats">
                        ${stats.map(([label, value]) => `
                            <span class="stat" data-type="${label}">${label}: <span class="stat-value">${value}</span></span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Build comparison card HTML (for comparison page)
function buildComparisonCardHTML(cardId, cardData = {}, count1 = 0, count2 = 0, comparisonType = '', deck1Name = 'Deck 1', deck2Name = 'Deck 2', sideboard1 = 0, sideboard2 = 0) {
    const aspects = cardData.Aspects || [];
    const stats = [];
    if (cardData.Cost !== undefined) stats.push(['Cost', cardData.Cost]);
    if (cardData.Power !== undefined) stats.push(['Power', cardData.Power]);
    if (cardData.HP !== undefined) stats.push(['HP', cardData.HP]);

    const formattedId = cardId.replace('_', ' ');
    const isDoubleSided = cardData.DoubleSided === true;
    
    // Create count display for comparison (including sideboard)
    let countText = '';
    const total1 = count1 + sideboard1;
    const total2 = count2 + sideboard2;
    
    if (total1 > 0 && total2 > 0) {
        let deck1Text = `${deck1Name}: ${count1}`;
        if (sideboard1 > 0) deck1Text += ` (${sideboard1} side)`;
        
        let deck2Text = `${deck2Name}: ${count2}`;
        if (sideboard2 > 0) deck2Text += ` (${sideboard2} side)`;
        
        countText = `${deck1Text} | ${deck2Text}`;
    } else if (total1 > 0) {
        let deck1Text = `${deck1Name}: ${count1}`;
        if (sideboard1 > 0) deck1Text += ` (${sideboard1} side)`;
        countText = deck1Text;
    } else if (total2 > 0) {
        let deck2Text = `${deck2Name}: ${count2}`;
        if (sideboard2 > 0) deck2Text += ` (${sideboard2} side)`;
        countText = deck2Text;
    }
    
    return `
        <div class="card ${comparisonType}">
            <div class="card-id">
                <span>${formattedId}</span>
                ${isDoubleSided ? '<button class="flip-button" onclick="event.stopPropagation(); this.closest(\'.card\').classList.toggle(\'flipped\')">Flip Card</button>' : ''}
            </div>
            ${countText ? `<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${countText}</div>` : ''}
            <div class="card-name">${cardData.Name || cardId}</div>
            ${aspects.length ? `
                <div class="aspects">
                    ${aspects.map(aspect => `
                        <span class="aspect ${aspect}">${aspect}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${cardData.FrontArt ? 
                            `<img src="${cardData.FrontArt}" alt="${cardData.Name || cardId} (Front)">` : 
                            `<div class="card-placeholder">${cardId}</div>`}
                    </div>
                    ${isDoubleSided && cardData.BackArt ? `
                        <div class="card-back">
                            <img src="${cardData.BackArt}" alt="${cardData.Name || cardId} (Back)">
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="card-content">
                ${stats.length ? `
                    <div class="card-stats">
                        ${stats.map(([label, value]) => `
                            <span class="stat" data-type="${label}">${label}: <span class="stat-value">${value}</span></span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Clear card cache
function clearCardCache() {
    Object.keys(cardSets).forEach(k => delete cardSets[k]);
    Object.keys(loadingPromises).forEach(k => delete loadingPromises[k]);
}

// Start preloading sets immediately when module loads
preloadSets();
