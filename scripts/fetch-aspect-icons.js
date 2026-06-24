const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// SWU aspect icons used for the deck builder's aspect-toggle filters.
// Mirrors the aspect classes defined in styles.css (.aspect.<Name>).
const ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism'];

// Fetch a binary image with retries, returning the response body as a Buffer.
function fetchImageWithRetry(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (attemptCount) => {
      console.log(`Fetching ${url} (attempt ${attemptCount})`);

      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          console.error(`HTTP Status ${res.statusCode} for ${url}`);
          res.resume();
          if (attemptCount < retries) {
            setTimeout(() => attempt(attemptCount + 1), 1000);
          } else {
            reject(new Error(`HTTP Status ${res.statusCode} after all retries`));
          }
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          console.log(`Successfully fetched ${url}`);
          resolve(Buffer.concat(chunks));
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

async function saveImage(buffer, filename) {
  const filePath = path.join(__dirname, '..', 'public', 'images', 'aspects', filename);
  console.log(`Saving to ${filePath}`);
  await fs.writeFile(filePath, buffer);
  console.log(`Successfully saved ${filename}`);
}

async function fetchAllIcons() {
  await fs.mkdir(path.join(__dirname, '..', 'public', 'images', 'aspects'), { recursive: true });

  for (const aspect of ASPECTS) {
    try {
      const url = `https://swudb.com/images/${aspect}.webp`;
      const buffer = await fetchImageWithRetry(url);
      await saveImage(buffer, `${aspect}.webp`);
    } catch (error) {
      console.error(`\nError fetching icon for ${aspect}:`, error);
    }
  }
  console.log('\nFinished fetching aspect icons!');
}

if (require.main === module) {
  fetchAllIcons().catch(console.error);
}

module.exports = {
  ASPECTS,
  fetchImageWithRetry,
  saveImage,
  fetchAllIcons,
};
