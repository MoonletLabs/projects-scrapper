/**
 * CryptoRank API Client
 * Fetches fund data from CryptoRank API
 */

const API_URL = 'https://api.cryptorank.io/v2/funds/map';
const API_KEY = process.env.API_KEY || '';

/**
 * Fetches all funds from CryptoRank API and filters by tiers
 * @param {number[]} tiers - Array of tiers to filter by (e.g., [1] or [1, 2])
 * @returns {Promise<Array>} Array of fund objects
 */
export async function fetchFundsByTiers(tiers) {
  console.log(`    Fetching funds from CryptoRank API...`);
  
  const response = await fetch(API_URL, {
    method: 'GET',
    headers: {
      'X-Api-Key': API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('Invalid API response format');
  }

  const filtered = json.data.filter(fund => tiers.includes(fund.tier));
  
  // Log count per tier
  for (const tier of tiers) {
    const count = filtered.filter(f => f.tier === tier).length;
    console.log(`    Found ${count} Tier ${tier} funds`);
  }
  console.log(`    Total: ${filtered.length} funds`);
  
  return filtered;
}

/**
 * Fetches Tier 1 funds from CryptoRank API
 * @returns {Promise<Array>} Array of Tier 1 fund objects
 */
export async function fetchTier1Funds() {
  return fetchFundsByTiers([1]);
}

/**
 * Fetches Tier 1 and Tier 2 funds from CryptoRank API
 * @returns {Promise<Array>} Array of Tier 1 and Tier 2 fund objects
 */
export async function fetchTier1And2Funds() {
  return fetchFundsByTiers([1, 2]);
}
