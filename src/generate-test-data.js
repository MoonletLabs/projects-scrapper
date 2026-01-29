/**
 * Generate Test Data
 * Creates smaller subsets of funding-rounds-detailed.json for testing
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const INPUT_FILE = './output/funding-rounds-detailed.json';
const OUTPUT_DIR = './output/testing';

const SUBSETS = [2, 3, 5, 10];

async function main() {
  console.log('');
  console.log('============================================');
  console.log('  Generating Test Data Subsets');
  console.log('============================================');
  console.log('');

  // Check if input file exists
  if (!existsSync(INPUT_FILE)) {
    console.log(`    Input file not found: ${INPUT_FILE}`);
    console.log('    Skipping test data generation.');
    return;
  }

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`    Created directory: ${OUTPUT_DIR}`);
  }

  // Read input data
  console.log(`    Reading: ${INPUT_FILE}`);
  const content = await readFile(INPUT_FILE, 'utf-8');
  const data = JSON.parse(content);

  if (!data.data || !Array.isArray(data.data)) {
    console.log('    Invalid data format');
    return;
  }

  // Get unique projects
  const seen = new Set();
  const uniqueProjects = [];

  for (const round of data.data) {
    if (round.projectKey && !seen.has(round.projectKey)) {
      seen.add(round.projectKey);
      uniqueProjects.push(round);
    }
  }

  console.log(`    Found ${uniqueProjects.length} unique projects`);
  console.log('');

  // Generate subsets
  for (const count of SUBSETS) {
    if (count > uniqueProjects.length) {
      console.log(`    Skipping ${count} projects (only ${uniqueProjects.length} available)`);
      continue;
    }

    const subset = uniqueProjects.slice(0, count);
    const subsetKeys = new Set(subset.map(p => p.projectKey));

    // Filter all rounds that belong to these projects
    const filteredRounds = data.data.filter(round => subsetKeys.has(round.projectKey));

    const output = {
      metadata: {
        ...data.metadata,
        generatedAt: new Date().toISOString(),
        testSubset: true,
        projectCount: count,
        totalRounds: filteredRounds.length
      },
      data: filteredRounds
    };

    const outputFile = `${OUTPUT_DIR}/funding-rounds-detailed-${count}.json`;
    await writeFile(outputFile, JSON.stringify(output, null, 2));
    console.log(`    Created: ${outputFile} (${filteredRounds.length} rounds)`);
  }

  console.log('');
  console.log('============================================');
  console.log('  Test Data Generation Complete');
  console.log('============================================');
  console.log('');
}

main().catch(error => {
  console.error('Error generating test data:', error.message);
});
