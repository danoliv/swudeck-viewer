// Shared sets module for SWU Deck Viewer
// Single source of truth with a hardcoded list and one function

function loadSets() {
    return ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC'];
}

// Export for Node.js (fetch-sets.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadSets };
}

// Expose globally in browser
if (typeof window !== 'undefined') {
    window.loadSets = loadSets;
}
