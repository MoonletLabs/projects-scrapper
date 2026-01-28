# CryptoRank Tier 1 VC Scraper - Development Notes

## Project Overview

This project extracts Tier 1 VCs, Angel Investors, and other funds from CryptoRank, including their website and Twitter accounts.

## Implementation Steps

### Step 1: Project Initialization
- Created `package.json` with ESM modules support (`"type": "module"`)
- Added `puppeteer-core` dependency for browserless connection
- Created `src/` directory for source files
- Created `output/` directory for results

### Step 2: API Client (`src/api.js`)
- Implemented `fetchFundsByTier(tier)` function to fetch funds from CryptoRank API
- Uses the provided API key for authentication
- Filters results by tier (Tier 1 = 30 funds)
- API Endpoint: `https://api.cryptorank.io/v2/funds/map`

### Step 3: Scraper (`src/scraper.js`)
- Implemented `FundScraper` class using Puppeteer
- Connects to browserless instance at `wss://browserless.tiexo.com/`
- Scrapes each fund page at `https://cryptorank.io/funds/{key}`
- Extracts website and Twitter from social link elements
- Includes retry logic (3 attempts) with 2-second delay between retries
- Filters out CryptoRank's own social accounts
- **Auto-reconnect feature**: Automatically reconnects to browserless if connection is lost

### Step 4: Main Entry Point (`src/index.js`)
- Orchestrates the entire flow:
  1. Fetches Tier 1 funds from API
  2. Connects to browserless
  3. Scrapes each fund page sequentially
  4. Saves results to JSON file
- Verbose console output showing progress
- 1.5-second delay between requests to be respectful to servers
- Generates summary statistics

## Technical Details

### API Response Structure
```json
{
  "data": [
    {
      "id": 5,
      "key": "coinbase-ventures",
      "name": "Coinbase Ventures",
      "tier": 1,
      "type": "Venture"
    }
  ]
}
```

### Fund Types in Tier 1
- Venture (e.g., Coinbase Ventures, Pantera Capital, a16z)
- Angel Investor (e.g., Vitalik Buterin, Balaji Srinivasan)
- Corporation (e.g., BlackRock, ConsenSys)
- Incubator (e.g., Y Combinator, YZi Labs/Binance Labs)

### Page Structure
- Social links are in anchor tags with class containing `coin_social_link_item`
- Website link is typically the first non-social-media link
- Twitter link contains `twitter.com/` or `x.com/`

### Output Format
```json
{
  "metadata": {
    "generatedAt": "ISO timestamp",
    "source": "cryptorank.io",
    "tier": 1,
    "totalFunds": 30,
    "successfulScrapes": 28,
    "failedScrapes": 2,
    "durationMs": 135000
  },
  "data": [
    {
      "id": 5,
      "key": "coinbase-ventures",
      "name": "Coinbase Ventures",
      "tier": 1,
      "type": "Venture",
      "website": "https://ventures.coinbase.com",
      "twitter": "https://twitter.com/CoinbaseVenture",
      "scrapedAt": "ISO timestamp",
      "error": null
    }
  ]
}
```

## Configuration

### Constants
| Constant | Value | Description |
|----------|-------|-------------|
| `API_URL` | `https://api.cryptorank.io/v2/funds/map` | CryptoRank API endpoint |
| `API_KEY` | `2b9c419b...` | API authentication key |
| `BROWSERLESS_URL` | `wss://browserless.tiexo.com/` | Puppeteer browserless endpoint |
| `MAX_RETRIES` | `3` | Maximum retry attempts per fund |
| `RETRY_DELAY_MS` | `2000` | Delay between retries |
| `DELAY_BETWEEN_REQUESTS_MS` | `1500` | Delay between fund scrapes |

## Usage

### Install Dependencies
```bash
npm install
```

### Run the Scraper
```bash
npm start
```

### Expected Output
```
====================================
  CryptoRank Tier 1 VC Scraper
====================================

[1] Fetching Tier 1 funds from API...
    Fetching funds from CryptoRank API...
    Found 30 Tier 1 funds

[2] Connecting to browserless...
    Connecting to browserless...
    Connected successfully

[3] Scraping fund pages...
    [1/30] Coinbase Ventures... OK
           Website: https://ventures.coinbase.com
           Twitter: https://twitter.com/CoinbaseVenture
    [2/30] Pantera Capital... OK
           Website: https://panteracapital.com
           Twitter: https://twitter.com/PanteraCapital
    ...

[4] Summary
    Total funds: 30
    Successful: 28
    Failed: 2
    Time elapsed: 2m 15s

[5] Saving results...
    Output saved to: ./output/tier1-vcs.json

====================================
  Done!
====================================
```

## Tier 1 Funds List (30 total)

### Venture Capital
1. Coinbase Ventures
2. Pantera Capital
3. Paradigm
4. Sequoia Capital
5. The Spartan Group
6. Dragonfly
7. Multicoin Capital
8. Polychain Capital
9. Andreessen Horowitz (a16z crypto)
10. Blockchain Capital
11. Galaxy
12. HashKey Capital
13. Circle
14. VanEck

### Angel Investors
15. Santiago Roel Santos
16. Sandeep Nailwal
17. Balaji Srinivasan
18. Paul Veradittakit
19. Alex Svanevik
20. Anatoly Yakovenko
21. Raj Gokal
22. Stani Kulechov
23. Arthur Hayes
24. Vitalik Buterin
25. Bryan Pellegrino

### Corporations
26. ConsenSys
27. BlackRock

### Incubators
28. YZi Labs (Prev. Binance Labs)
29. Y Combinator
30. a16z CSX

## Error Handling

- **API Errors**: Exits with error message if API fails
- **Connection Errors**: Exits with error message if browserless connection fails
- **Scraping Errors**: Retries up to 3 times, then marks as failed and continues
- **Connection Lost**: Automatically reconnects to browserless if connection drops
- **File Write Errors**: Exits with error message if output file cannot be written

## Test Run Results

### Successful Run (2026-01-27)
```
Total funds: 30
Successful: 30
Failed: 0
Time elapsed: 1m 49s
```

All 30 Tier 1 funds were successfully scraped with their website and Twitter accounts.

### Data Summary
| Category | Count | With Website | With Twitter |
|----------|-------|--------------|--------------|
| Venture Capital | 14 | 14 | 14 |
| Angel Investors | 11 | 1 | 11 |
| Corporations | 2 | 2 | 2 |
| Incubators | 3 | 3 | 3 |
| **Total** | **30** | **20** | **30** |

Note: Most angel investors don't have personal websites listed on CryptoRank, only Twitter accounts.

## Future Improvements

1. Add concurrent scraping with configurable concurrency level
2. Add support for Tier 2 funds
3. Export to CSV format
4. Add command-line arguments for configuration
5. Add caching to avoid re-scraping already scraped funds
