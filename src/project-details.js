/**
 * CryptoRank Project Details Enrichment Scraper
 *
 * Main entry point that orchestrates:
 * 1. Reading funding-rounds.json
 * 2. Extracting unique projects
 * 3. Scraping each project's detail page
 * 4. Merging details back into funding rounds
 * 5. Saving enriched data to funding-rounds-detailed.json
 *
 * Usage:
 *   node src/project-details.js              # All projects
 *   node src/project-details.js --limit 50   # First 50 projects
 *   node src/project-details.js -l 10        # Short form
 */

import { readFile, writeFile } from 'fs/promises';
import { ProjectDetailsScraper } from './project-details-scraper.js';

const INPUT_FILE = './output/funding-rounds.json';
const OUTPUT_FILE = './output/funding-rounds-detailed.json';
const DELAY_BETWEEN_PROJECTS_MS = 2000;

/**
 * Parse command line arguments
 * @returns {object} - { limit: number|null }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let limit = null;

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
 * Read funding rounds data from input file
 * @returns {object} - Parsed JSON data
 */
async function readFundingRounds() {
  const content = await readFile(INPUT_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Extract unique projects from funding rounds data
 * @param {Array} fundingRounds - Array of funding round objects
 * @returns {Array} - Array of unique project objects { projectKey, projectName, projectUrl }
 */
function extractUniqueProjects(fundingRounds) {
  const seen = new Set();
  const projects = [];

  for (const round of fundingRounds) {
    if (round.projectKey && !seen.has(round.projectKey)) {
      seen.add(round.projectKey);
      projects.push({
        projectKey: round.projectKey,
        projectName: round.projectName,
        projectUrl: round.projectUrl
      });
    }
  }

  return projects;
}

/**
 * Save results to output file
 * @param {Array} data - Enriched funding rounds data
 * @param {object} projectDetails - Map of projectKey to details
 * @param {number} totalProjects - Total number of unique projects
 * @param {number} successful - Number of successfully scraped projects
 * @param {number} failed - Number of failed projects
 * @param {number} startTime - Start timestamp for duration calculation
 * @param {boolean} partial - Whether this is a partial save
 */
async function saveResults(data, projectDetails, totalProjects, successful, failed, startTime, partial = false) {
  // Merge details into funding rounds
  const enrichedData = data.map(round => {
    const details = projectDetails[round.projectKey] || null;
    return {
      ...round,
      details: details?.details || null,
      detailsError: details?.error || null
    };
  });

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'cryptorank.io/ico',
      totalProjects,
      successful,
      failed,
      partial,
      durationMs: Date.now() - startTime
    },
    data: enrichedData
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const { limit } = parseArgs();

  console.log('');
  console.log('============================================');
  console.log('  CryptoRank Project Details Enrichment');
  console.log('============================================');

  // Step 1: Read funding rounds data
  console.log('[1] Reading funding rounds data...');
  let fundingData;
  try {
    fundingData = await readFundingRounds();
    console.log(`    Loaded ${fundingData.data.length} funding rounds`);
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    console.error(`    Make sure ${INPUT_FILE} exists. Run 'npm run funding-rounds' first.`);
    process.exit(1);
  }
  console.log('');

  // Step 2: Extract unique projects
  console.log('[2] Extracting unique projects...');
  let projects = extractUniqueProjects(fundingData.data);
  console.log(`    Found ${projects.length} unique projects`);

  // Apply limit if specified
  if (limit && limit < projects.length) {
    projects = projects.slice(0, limit);
    console.log(`    Limited to first ${limit} projects`);
  }

  console.log(`    Screenshots: ./screenshots/project-details/`);
  console.log('');

  // Step 3: Connect to browserless
  console.log('[3] Connecting to browserless...');
  const scraper = new ProjectDetailsScraper();
  try {
    await scraper.connect();
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // Step 4: Scrape project details
  console.log('[4] Scraping project details...');
  const projectDetails = {}; // Map of projectKey -> { details, error }
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const progress = `[${i + 1}/${projects.length}]`;

    process.stdout.write(`    ${progress} ${project.projectName || project.projectKey}... `);

    const result = await scraper.scrapeProject(project.projectKey);

    if (result.error) {
      console.log('FAILED');
      console.log(`           Error: ${result.error}`);
      failCount++;
    } else {
      // Count how many fields were populated
      const details = result.details;
      const populatedFields = [
        details.description,
        details.website,
        details.twitter,
        details.telegram,
        details.discord,
        details.github,
        details.tokenSymbol,
        details.tokenPrice,
        details.marketCap,
        details.totalRaised
      ].filter(Boolean).length;

      console.log(`OK (${populatedFields} fields)`);
      successCount++;
    }

    projectDetails[project.projectKey] = result;

    // Save partial results after each project
    try {
      await saveResults(
        fundingData.data,
        projectDetails,
        projects.length,
        successCount,
        failCount,
        startTime,
        true
      );
    } catch (e) {
      // Ignore save errors during scraping
    }

    // Delay between projects (except for the last one)
    if (i < projects.length - 1) {
      await delay(DELAY_BETWEEN_PROJECTS_MS);
    }
  }

  // Disconnect from browser
  await scraper.disconnect();
  console.log('');

  // Step 5: Summary
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log('[5] Summary');
  console.log(`    Total projects: ${projects.length}`);
  console.log(`    - Successful: ${successCount}`);
  console.log(`    - Failed: ${failCount}`);
  console.log(`    Time elapsed: ${formatDuration(duration)}`);
  console.log('');

  // Step 6: Save final results
  console.log('[6] Saving final results...');
  try {
    await saveResults(
      fundingData.data,
      projectDetails,
      projects.length,
      successCount,
      failCount,
      startTime,
      false
    );
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
