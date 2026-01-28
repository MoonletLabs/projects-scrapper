/**
 * CryptoRank Funding Rounds Scraper
 *
 * Main entry point that orchestrates:
 * 1. Parsing command line arguments
 * 2. Loading cache to resume from partial scrapes
 * 3. Scraping funding rounds pages
 * 4. Saving results to JSON file
 *
 * Usage:
 *   node src/funding-rounds.js              # Scrape default 200 rounds
 *   node src/funding-rounds.js --limit 500  # Custom limit
 *   node src/funding-rounds.js -l 100       # Short form
 */

import { writeFile } from 'fs/promises';
import { FundingRoundsScraper } from './funding-rounds-scraper.js';

const OUTPUT_FILE = './output/funding-rounds.json';
const DEFAULT_LIMIT = 200;
const ITEMS_PER_PAGE = 20;
const DELAY_BETWEEN_PAGES_MS = 2000;

/**
 * Parse command line arguments
 * @returns {object} - { limit: number }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--limit' || args[i] === '-l') && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
      i++; // Skip next arg
    }
  }

  return { limit };
}

/**
 * Delay helper
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration in human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}


/**
 * Save results to output file
 * @param {Array} data - Funding rounds data
 * @param {number} limit - The limit used
 * @param {number} pagesScraped - Number of pages scraped
 * @param {number} startTime - Start timestamp for duration calculation
 * @param {boolean} partial - Whether this is a partial save
 */
async function saveResults(data, limit, pagesScraped, startTime, partial = false) {
  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'cryptorank.io/funding-rounds',
      totalRounds: data.length,
      limit,
      pagesScraped,
      partial,
      durationMs: Date.now() - startTime
    },
    data
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const { limit } = parseArgs();
  const pagesNeeded = Math.ceil(limit / ITEMS_PER_PAGE);

  console.log('');
  console.log('============================================');
  console.log('  CryptoRank Funding Rounds Scraper');
  console.log('============================================');
  console.log(`  Limit: ${limit} rounds`);
  console.log(`  Pages needed: ${pagesNeeded}`);
  console.log(`  Screenshots: ./screenshots/funding-rounds/`);
  console.log('');

  // Step 1: Connect to browserless
  console.log('[1] Connecting to browserless...');
  const scraper = new FundingRoundsScraper();
  try {
    await scraper.connect();
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // Step 2: Scrape pages
  console.log('[2] Scraping funding rounds pages...');
  const allData = [];
  let pagesScraped = 0;
  let successCount = 0;
  let failCount = 0;

  for (let pageNumber = 1; pageNumber <= pagesNeeded; pageNumber++) {
    process.stdout.write(`    [${pageNumber}/${pagesNeeded}] Page ${pageNumber}... `);

    const result = await scraper.scrapePage(pageNumber);

    if (result.error) {
      console.log('FAILED');
      console.log(`           Error: ${result.error}`);
      failCount++;
    } else {
      console.log(`OK (${result.data.length} rounds)`);
      allData.push(...result.data);
      pagesScraped++;
      successCount++;
    }

    // Save partial results after each page
    try {
      await saveResults(allData, limit, pagesScraped, startTime, true);
    } catch (e) {
      // Ignore save errors during scraping
    }

    // Delay between pages (except for the last one)
    if (pageNumber < pagesNeeded) {
      await delay(DELAY_BETWEEN_PAGES_MS);
    }
  }

  // Disconnect from browser
  await scraper.disconnect();
  console.log('');

  // Step 3: Summary
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log('[3] Summary');
  console.log(`    Total rounds: ${allData.length}`);
  console.log(`    Pages scraped: ${pagesScraped}`);
  console.log(`    - Successful: ${successCount}`);
  console.log(`    - Failed: ${failCount}`);
  console.log(`    Time elapsed: ${formatDuration(duration)}`);
  console.log('');

  // Step 4: Save final results
  console.log('[4] Saving final results...');
  try {
    await saveResults(allData, limit, pagesScraped, startTime, false);
    console.log(`    Output saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`    ERROR saving file: ${error.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('============================================');
  console.log('  Done!');
  console.log('============================================');
  console.log('');
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
