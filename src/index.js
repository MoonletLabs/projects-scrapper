/**
 * CryptoRank VC Scraper
 *
 * Main entry point that orchestrates:
 * 1. Fetching funds from CryptoRank API (Tier 1 or Tier 1+2)
 * 2. Loading cache to skip already scraped funds
 * 3. Scraping all social links for each fund
 * 4. Saving results to JSON file
 *
 * Usage:
 *   npm start                    # Scrape Tier 1 only (default)
 *   npm start -- --tier2         # Scrape Tier 1 + Tier 2
 *   npm start -- --screenshots   # Enable debug screenshots
 *   npm start -- -s              # Short form for screenshots
 *   npm start -- --tier2 -s      # Combine flags
 */

import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fetchTier1Funds, fetchTier1And2Funds } from './api.js';
import { FundScraper } from './scraper.js';

const OUTPUT_FILE_TIER1 = './output/tier1-vcs.json';
const OUTPUT_FILE_TIER1_2 = './output/tier1-2-vcs.json';
const DELAY_BETWEEN_REQUESTS_MS = 1500;

/**
 * Parse command line arguments
 * @returns {object} - { includeTier2: boolean, enableScreenshots: boolean }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    includeTier2: args.includes('--tier2') || args.includes('-t2'),
    enableScreenshots: args.includes('--screenshots') || args.includes('-s')
  };
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
 * Save partial results to output file
 * @param {string} outputFile - Path to the output file
 * @param {Map} cache - Cached results
 * @param {Array} newResults - New results to merge
 * @param {boolean} includeTier2 - Whether tier 2 is included
 * @param {number} startTime - Start timestamp for duration calculation
 */
async function savePartialResults(outputFile, cache, newResults, includeTier2, startTime) {
  const allResultsMap = new Map();

  // Add cached results
  for (const [key, data] of cache) {
    if (!data.url) {
      data.url = `https://cryptorank.io/funds/${key}`;
    }
    allResultsMap.set(key, data);
  }

  // Add new results
  for (const result of newResults) {
    allResultsMap.set(result.key, result);
  }

  // Convert to array and sort
  const targetTiers = includeTier2 ? [1, 2] : [1];
  const allResults = Array.from(allResultsMap.values())
    .filter(f => targetTiers.includes(f.tier))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.name.localeCompare(b.name);
    });

  const totalSuccess = allResults.filter(f => !f.error).length;
  const totalFailed = allResults.filter(f => f.error).length;

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'cryptorank.io',
      tiers: targetTiers,
      totalFunds: allResults.length,
      successfulScrapes: totalSuccess,
      failedScrapes: totalFailed,
      partial: true,
      durationMs: Date.now() - startTime
    },
    data: allResults
  };

  await writeFile(outputFile, JSON.stringify(output, null, 2));
}

/**
 * Load existing cache from output file
 * @param {string} outputFile - Path to the output file
 * @returns {Promise<Map>} - Map of fund key -> scraped data
 */
async function loadCache(outputFile) {
  const cache = new Map();
  
  if (!existsSync(outputFile)) {
    return cache;
  }
  
  try {
    const content = await readFile(outputFile, 'utf-8');
    const json = JSON.parse(content);
    
    if (json.data && Array.isArray(json.data)) {
      for (const fund of json.data) {
        // Only cache successful scrapes (no error and has at least one social link)
        const hasAnyLink = fund.website || fund.twitter || fund.telegram || 
                           fund.discord || fund.medium || fund.linkedin || 
                           fund.github || fund.youtube || fund.facebook || 
                           fund.instagram || fund.reddit;
        if (!fund.error && hasAnyLink) {
          cache.set(fund.key, fund);
        }
      }
    }
    
    return cache;
  } catch (error) {
    console.log(`    Warning: Could not load cache: ${error.message}`);
    return cache;
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const { includeTier2, enableScreenshots } = parseArgs();
  const tierLabel = includeTier2 ? 'Tier 1 + Tier 2' : 'Tier 1';
  const outputFile = includeTier2 ? OUTPUT_FILE_TIER1_2 : OUTPUT_FILE_TIER1;

  console.log('');
  console.log('====================================');
  console.log(`  CryptoRank ${tierLabel} VC Scraper`);
  console.log('====================================');
  if (enableScreenshots) {
    console.log('  Screenshots: ENABLED (./screenshots/)');
  }
  console.log('');

  // Step 1: Fetch funds from API
  console.log(`[1] Fetching ${tierLabel} funds from API...`);
  let funds;
  try {
    funds = includeTier2 ? await fetchTier1And2Funds() : await fetchTier1Funds();
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // Step 2: Load cache
  console.log('[2] Loading cache...');
  const cache = await loadCache(outputFile);
  const cachedCount = cache.size;
  console.log(`    Found ${cachedCount} cached funds`);
  
  // Filter out already cached funds
  const fundsToScrape = funds.filter(f => !cache.has(f.key));
  console.log(`    Need to scrape: ${fundsToScrape.length} funds`);
  console.log('');

  // If nothing to scrape, we're done
  if (fundsToScrape.length === 0) {
    console.log('[3] All funds already cached, nothing to scrape!');
    console.log('');
    console.log('====================================');
    console.log('  Done! (from cache)');
    console.log('====================================');
    console.log('');
    return;
  }

  // Step 3: Connect to browserless
  console.log('[3] Connecting to browserless...');
  const scraper = new FundScraper({ enableScreenshots });
  try {
    await scraper.connect();
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // Step 4: Scrape each fund
  console.log('[4] Scraping fund pages...');
  const newResults = [];
  let successCount = 0;
  let failCount = 0;
  let skippedCount = cachedCount;

  for (let i = 0; i < fundsToScrape.length; i++) {
    const fund = fundsToScrape[i];
    const index = i + 1;
    
    process.stdout.write(`    [${index}/${fundsToScrape.length}] ${fund.name}... `);
    
    const scrapeResult = await scraper.scrapeFund(
      fund.key, 
      index, 
      fundsToScrape.length
    );

    const { error, website, twitter, ...otherLinks } = scrapeResult;

    // Build other_socials object with only non-null values
    const otherSocials = {};
    for (const [key, value] of Object.entries(otherLinks)) {
      if (value !== null) {
        otherSocials[key] = value;
      }
    }

    if (error) {
      console.log('FAILED');
      console.log(`           Error: ${error}`);
      failCount++;
    } else {
      console.log('OK');
      // Log all found social links
      if (website) {
        console.log(`           website: ${website}`);
      }
      if (twitter) {
        console.log(`           twitter: ${twitter}`);
      }
      for (const [key, value] of Object.entries(otherSocials)) {
        console.log(`           ${key}: ${value}`);
      }
      if (!website && !twitter && Object.keys(otherSocials).length === 0) {
        console.log(`           (No social links found)`);
      }
      successCount++;
    }

    const result = {
      id: fund.id,
      key: fund.key,
      name: fund.name,
      tier: fund.tier,
      type: fund.type,
      url: `https://cryptorank.io/funds/${fund.key}`,
      website: website || null,
      twitter: twitter || null,
      scrapedAt: new Date().toISOString(),
      error: error || null
    };

    // Only add other_socials if there are any
    if (Object.keys(otherSocials).length > 0) {
      result.other_socials = otherSocials;
    }

    newResults.push(result);

    // Save partial results after each scrape
    try {
      await savePartialResults(outputFile, cache, newResults, includeTier2, startTime);
    } catch (e) {
      // Ignore save errors during scraping
    }

    // Delay between requests (except for the last one)
    if (i < fundsToScrape.length - 1) {
      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  // Disconnect from browser
  await scraper.disconnect();
  console.log('');

  // Step 5: Merge with cache and prepare final results
  console.log('[5] Merging results with cache...');
  
  // Create a map of all results (cache + new)
  const allResultsMap = new Map();
  
  // Add cached results (ensure URL is present for backwards compatibility)
  for (const [key, data] of cache) {
    if (!data.url) {
      data.url = `https://cryptorank.io/funds/${key}`;
    }
    allResultsMap.set(key, data);
  }
  
  // Add new results (overwrite if exists)
  for (const result of newResults) {
    allResultsMap.set(result.key, result);
  }
  
  // Convert to array and sort by tier, then by name
  const allResults = Array.from(allResultsMap.values())
    .filter(f => {
      // Only include funds that are in our target tiers
      const targetTiers = includeTier2 ? [1, 2] : [1];
      return targetTiers.includes(f.tier);
    })
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.name.localeCompare(b.name);
    });

  console.log(`    Total results: ${allResults.length}`);
  console.log('');

  // Step 6: Summary
  const endTime = Date.now();
  const duration = endTime - startTime;

  const totalSuccess = allResults.filter(f => !f.error).length;
  const totalFailed = allResults.filter(f => f.error).length;

  console.log('[6] Summary');
  console.log(`    Total funds: ${allResults.length}`);
  console.log(`    From cache: ${skippedCount}`);
  console.log(`    Newly scraped: ${successCount + failCount}`);
  console.log(`    - Successful: ${successCount}`);
  console.log(`    - Failed: ${failCount}`);
  console.log(`    Overall success rate: ${totalSuccess}/${allResults.length}`);
  console.log(`    Time elapsed: ${formatDuration(duration)}`);
  console.log('');

  // Step 7: Save results
  console.log('[7] Saving results...');
  
  const tiers = includeTier2 ? [1, 2] : [1];
  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'cryptorank.io',
      tiers: tiers,
      totalFunds: allResults.length,
      successfulScrapes: totalSuccess,
      failedScrapes: totalFailed,
      fromCache: skippedCount,
      newlyScrapped: successCount + failCount,
      durationMs: duration,
      partial: false
    },
    data: allResults
  };

  try {
    await writeFile(outputFile, JSON.stringify(output, null, 2));
    console.log(`    Output saved to: ${outputFile}`);
  } catch (error) {
    console.error(`    ERROR saving file: ${error.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('====================================');
  console.log('  Done!');
  console.log('====================================');
  console.log('');
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
