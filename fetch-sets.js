const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { loadSets } = require('./sets.js');

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
                            console.error('Error parsing JSON:', e);
                            console.error('Raw data received:', data.substring(0, 200) + '...');
                            if (attemptCount < retries) {
                                setTimeout(() => attempt(attemptCount + 1), 1000 * attemptCount);
                            } else {
                                reject(new Error('Failed to parse JSON after all retries'));
                            }
                        }
                    } else {
                        console.error(`HTTP Status ${res.statusCode} for ${url}`);
                        console.error('Response headers:', res.headers);
                        if (attemptCount < retries) {
                            setTimeout(() => attempt(attemptCount + 1), 1000 * attemptCount);
                        } else {
                            reject(new Error(`HTTP Status ${res.statusCode} after all retries`));
                        }
                    }
                });
            }).on('error', (err) => {
                console.error(`Network error fetching ${url}:`, err);
                if (attemptCount < retries) {
                    setTimeout(() => attempt(attemptCount + 1), 1000 * attemptCount);
                } else {
                    reject(err);
                }
            });
        };

        attempt(1);
    });
}

// Function to save JSON to file
async function saveToFile(data, filename) {
    const filePath = path.join(__dirname, 'data', filename);
    console.log(`Saving to ${filePath}`);
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`Successfully saved ${filename}`);
    } catch (error) {
        console.error(`Error saving ${filename}:`, error);
        throw error;
    }
}

// Main function to fetch all sets
async function fetchAllSets() {
    console.log('Starting to fetch all sets...');
    console.log('Current directory:', __dirname);
    
    // Load sets from shared module
    const SETS = await loadSets();
    console.log('Loaded sets:', SETS);
    
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    try {
        await fs.mkdir(dataDir, { recursive: true });
        console.log('Data directory created/verified');
    } catch (error) {
        console.error('Error creating data directory:', error);
        throw error;
    }
    
    for (const set of SETS) {
        try {
            console.log(`\nProcessing set ${set}...`);
            const url = `https://api.swu-db.com/cards/${set.toLowerCase()}?pretty=true`;
            console.log(`Fetching from URL: ${url}`);
            const data = await fetchWithRetry(url);
            console.log(`Got data for set ${set}, saving...`);
            await saveToFile(data, `${set.toLowerCase()}.json`);
            console.log(`Successfully processed set ${set}`);
            // Add a small delay between requests to be nice to the API
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`\nError processing set ${set}:`, error);
        }
    }
    
    console.log('\nFinished fetching all sets!');
}

// Export functions for testing
module.exports = {
    fetchWithRetry,
    saveToFile,
    fetchAllSets
};

// Run the script only if this file is executed directly
if (require.main === module) {
    console.log('Script starting...');
    fetchAllSets().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
} 