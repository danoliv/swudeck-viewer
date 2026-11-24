const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const setCodes = require('../src/lib/sets.json');

function loadSets() {
    return [...setCodes];
}

// Function to fetch data with retries
function fetchWithRetry(url, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (attemptCount) => {
            console.log(`Fetching ${url} (attempt ${attemptCount})`);
            
            https.get(url, {
                headers: {
                    'Accept': 'application/json'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    console.log(`Response status: ${res.statusCode}`);
                    if (res.statusCode === 200) {
                        try {
                            const jsonData = JSON.parse(data);
                            console.log(`Successfully parsed JSON data for ${url}`);
                            resolve(jsonData);
                        } catch (e) {
                            console.error(`Error parsing JSON: ${e}`);
                            console.error(`Raw data received: ${data.substring(0, 200)}...`);
                            if (attemptCount < retries) {
                                setTimeout(() => attempt(attemptCount + 1), 1000);
                            } else {
                                reject(new Error(`Failed to parse JSON after all retries: ${e.message}`));
                            }
                        }
                    } else {
                        console.error(`HTTP Status ${res.statusCode} for ${url}`);
                        console.error(`Response headers:`, res.headers);
                        if (attemptCount < retries) {
                            setTimeout(() => attempt(attemptCount + 1), 1000);
                        } else {
                            reject(new Error(`HTTP Status ${res.statusCode} after all retries`));
                        }
                    }
                });
            }).on('error', (err) => {
                console.error(`Network error fetching ${url}:`, err);
                if (attemptCount < retries) {
                    setTimeout(() => attempt(attemptCount + 1), 1000);
                } else {
                    reject(err);
                }
            });
        };
        attempt(1);
    });
}

async function saveToFile(data, filename) {
    try {
        const filePath = path.join(__dirname, '..', 'public', 'data', filename);
        console.log(`Saving to ${filePath}`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`Successfully saved ${filename}`);
    } catch (error) {
        console.error(`Error saving ${filename}:`, error);
        throw error;
    }
}

const dataDir = () => path.join(__dirname, '..', 'public', 'data');

function printingKey(card) {
    return [card.Name, card.Subtitle, card.Type].map((v) => String(v ?? '').trim().toLowerCase()).join('|');
}

/**
 * Pure: given `{ SET: [cards] }`, set `OtherPrintings` on every card to the
 * IDs ("SET-NUMBER") of the Normal printings of the same card (same Name +
 * Subtitle + Type) in OTHER sets. Hyperspace/Foil variants of a card share the
 * list of their Normal counterpart. The field is omitted when there is none,
 * and removed if it went stale. Mutates and returns `cardsBySet`.
 */
function addOtherPrintings(cardsBySet) {
    const normals = new Map();
    for (const [set, cards] of Object.entries(cardsBySet)) {
        for (const card of cards) {
            if (card.VariantType && card.VariantType !== 'Normal') continue;
            const key = printingKey(card);
            if (!normals.has(key)) normals.set(key, []);
            normals.get(key).push({ set, id: `${set}-${card.Number}` });
        }
    }
    for (const [set, cards] of Object.entries(cardsBySet)) {
        for (const card of cards) {
            const others = (normals.get(printingKey(card)) ?? []).filter((p) => p.set !== set).map((p) => p.id);
            if (others.length) card.OtherPrintings = others;
            else delete card.OtherPrintings;
        }
    }
    return cardsBySet;
}

/** Read every set file from public/data, run addOtherPrintings, and write them back. */
async function enrichOtherPrintings() {
    const files = {};
    for (const set of loadSets()) {
        const file = path.join(dataDir(), `${set.toLowerCase()}.json`);
        try {
            files[set] = { file, json: JSON.parse(await fs.readFile(file, 'utf8')) };
        } catch (error) {
            console.warn(`Skipping ${set} while adding OtherPrintings:`, error.message);
        }
    }
    const bySet = Object.fromEntries(Object.entries(files).map(([set, f]) => [set, f.json.data ?? []]));
    addOtherPrintings(bySet);
    for (const { file, json } of Object.values(files)) {
        await fs.writeFile(file, JSON.stringify(json, null, 2));
    }
    console.log('Added OtherPrintings to set data');
}

async function fetchAllSets() {
    try {
        console.log('Starting to fetch all sets...');
        console.log('Current directory:', __dirname);
        const sets = loadSets();
        console.log('Loaded sets:', sets);

        // Ensure data directory exists
        await fs.mkdir(path.join(__dirname, '..', 'public', 'data'), { recursive: true });
        console.log('Data directory created/verified');

        for (const set of sets) {
            try {
                console.log(`\nProcessing set ${set}...`);
                const url = `https://api.swu-db.com/cards/${set.toLowerCase()}?pretty=true`;
                console.log(`Fetching from URL: ${url}`);
                const data = await fetchWithRetry(url);
                console.log(`Got data for set ${set}, saving...`);
                await saveToFile(data, `${set.toLowerCase()}.json`);
                console.log(`Successfully processed set ${set}`);

                // Add a delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`\nError processing set ${set}:`, error);
            }
        }
        await enrichOtherPrintings();
        console.log('\nFinished fetching all sets!');
    } catch (error) {
        console.error('\nFatal error:', error);
        throw error;
    }
}

// Run the script if called directly
// (`--enrich-only` re-derives OtherPrintings from the data already on disk, no network.)
if (require.main === module) {
    const run = process.argv.includes('--enrich-only') ? enrichOtherPrintings : fetchAllSets;
    run().catch(console.error);
}

// Export functions for testing
module.exports = {
    fetchWithRetry,
    saveToFile,
    fetchAllSets,
    addOtherPrintings,
    enrichOtherPrintings
};
