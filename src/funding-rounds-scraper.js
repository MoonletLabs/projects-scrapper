/**
 * Funding Rounds Scraper
 * Uses Puppeteer to scrape funding rounds from CryptoRank
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://browserless.tiexo.com/';
const CRYPTORANK_FUNDING_URL = 'https://cryptorank.io/funding-rounds';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const SELECTOR_TIMEOUT_MS = 15000;
const SCREENSHOTS_DIR = './screenshots/funding-rounds';

// Realistic user agent to avoid bot detection
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Standard viewport
const VIEWPORT = { width: 1920, height: 1080 };

/**
 * Delay helper
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse raise amount string to raw number
 * @param {string} amountStr - Amount string like "$5.5M" or "$1.2B"
 * @returns {number|null} - Parsed number or null
 */
function parseRaiseAmount(amountStr) {
  if (!amountStr || amountStr === '-' || amountStr === 'N/A') {
    return null;
  }

  // Remove $ and any whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '').toUpperCase();

  // Extract number and multiplier
  const match = cleaned.match(/^([\d.]+)([KMB])?$/);
  if (!match) {
    return null;
  }

  const num = parseFloat(match[1]);
  const multiplier = match[2];

  if (isNaN(num)) {
    return null;
  }

  switch (multiplier) {
    case 'K':
      return num * 1000;
    case 'M':
      return num * 1000000;
    case 'B':
      return num * 1000000000;
    default:
      return num;
  }
}

/**
 * Parse date string to ISO format
 * @param {string} dateStr - Date string like "Jan 27, 2026" or "27 Jan"
 * @returns {string|null} - ISO date string or null
 */
function parseDateToISO(dateStr) {
  if (!dateStr || dateStr === '-' || dateStr === 'N/A') {
    return null;
  }

  try {
    // If date doesn't include a year (e.g., "27 Jan"), add current year
    const hasYear = /\d{4}/.test(dateStr);
    const dateWithYear = hasYear ? dateStr : `${dateStr} ${new Date().getFullYear()}`;

    const date = new Date(dateWithYear);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * FundingRoundsScraper class - manages browser connection and scraping
 */
export class FundingRoundsScraper {
  constructor() {
    this.browser = null;
    this.screenshotsDir = SCREENSHOTS_DIR;
  }

  /**
   * Ensure screenshots directory exists
   */
  async ensureScreenshotsDir() {
    if (!existsSync(this.screenshotsDir)) {
      await mkdir(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Save a screenshot with a descriptive filename
   * @param {object} page - Puppeteer page instance
   * @param {number} pageNumber - Page number for filename
   */
  async saveScreenshot(page, pageNumber) {
    try {
      await this.ensureScreenshotsDir();
      const filename = `page-${pageNumber}.png`;
      const filepath = path.join(this.screenshotsDir, filename);
      await page.screenshot({ path: filepath, fullPage: true });
    } catch (e) {
      // Silently ignore screenshot errors to not break the scraping flow
    }
  }

  /**
   * Check if browser is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.browser && this.browser.isConnected();
  }

  /**
   * Connect to browserless instance
   */
  async connect() {
    console.log('    Connecting to browserless...');
    this.browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_URL
    });
    console.log('    Connected successfully');
  }

  /**
   * Reconnect to browserless if disconnected
   */
  async ensureConnected() {
    if (!this.isConnected()) {
      console.log('           Reconnecting to browserless...');
      await this.connect();
    }
  }

  /**
   * Disconnect from browser
   */
  async disconnect() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore errors when closing
      }
      this.browser = null;
      console.log('    Browser disconnected');
    }
  }

  /**
   * Extract funding rounds data from the current page
   * @param {object} page - Puppeteer page instance
   * @returns {Array} - Array of funding round objects
   */
  async extractRowData(page) {
    return await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) continue;

        // Project info (first column with link and name)
        const projectLink = cells[0].querySelector('a[href*="/ico/"]');
        let projectName = null;
        let projectKey = null;
        let projectIcoURL = null;
        let projectUrl = null;

        if (projectLink) {
          projectName = projectLink.textContent?.trim() || null;
          const href = projectLink.getAttribute('href');
          if (href) {
            // Extract key from /ico/project-key
            const keyMatch = href.match(/\/ico\/([^/?]+)/);
            projectKey = keyMatch ? keyMatch[1] : null;
            projectIcoURL = `https://cryptorank.io${href}`;
            projectUrl = `https://cryptorank.io/price/${projectKey}`;
          }
        }

        // Raise amount (second column)
        const raiseAmountText = cells[1].textContent?.trim() || null;

        // Stage (third column)
        const stage = cells[2].textContent?.trim() || null;

        // Investors (fourth column - may have multiple links)
        const investorLinks = cells[3].querySelectorAll('a[href*="/funds/"]');
        const investors = [];
        for (const invLink of investorLinks) {
          const invName = invLink.textContent?.trim();
          const invHref = invLink.getAttribute('href');
          if (invName && invHref) {
            const keyMatch = invHref.match(/\/funds\/([^/?]+)/);
            investors.push({
              name: invName,
              key: keyMatch ? keyMatch[1] : null
            });
          }
        }

        // Date (fifth column)
        const dateText = cells[4].textContent?.trim() || null;

        // Moni Score (sixth column)
        const moniScore = cells[5].textContent?.trim() || null;

        results.push({
          projectName,
          projectKey,
          projectUrl,
          projectIcoURL,
          raiseAmount: raiseAmountText,
          stage,
          investors,
          date: dateText,
          moniScore
        });
      }

      return results;
    });
  }

  /**
   * Scrape a single page of funding rounds with retry logic
   * @param {number} pageNumber - Page number (1-indexed)
   * @returns {object} - { data: Array, error: string|null }
   */
  async scrapePage(pageNumber) {
    const url = pageNumber === 1
      ? CRYPTORANK_FUNDING_URL
      : `${CRYPTORANK_FUNDING_URL}?page=${pageNumber}`;

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let page = null;
      try {
        // Ensure browser is connected before each attempt
        await this.ensureConnected();

        page = await this.browser.newPage();

        // Set user agent to avoid bot detection
        await page.setUserAgent(USER_AGENT);

        // Set viewport
        await page.setViewport(VIEWPORT);

        // Set a reasonable timeout
        page.setDefaultTimeout(30000);

        // Navigate to the page (networkidle2 waits for dynamic content)
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait for table to appear
        try {
          await page.waitForSelector('table tbody tr', { timeout: SELECTOR_TIMEOUT_MS });
        } catch (e) {
          // Table not found - try waiting a bit more and check again
          await delay(2000);
        }

        // Extract row data
        const rawData = await this.extractRowData(page);

        // Post-process the data (add parsed values)
        const data = rawData.map(row => ({
          ...row,
          raiseAmountRaw: parseRaiseAmount(row.raiseAmount),
          dateISO: parseDateToISO(row.date),
          scrapedAt: new Date().toISOString()
        }));

        // If no data found and we have retries left, retry
        if (data.length === 0 && attempt < MAX_RETRIES) {
          await page.close();
          page = null;
          throw new Error('No funding rounds found - retrying');
        }

        // Save screenshot (always enabled for funding rounds)
        await this.saveScreenshot(page, pageNumber);
        await page.close();
        page = null;

        return { data, error: null };

      } catch (error) {
        lastError = error;

        // Take screenshot on error if page is still open
        if (page) {
          try {
            await this.saveScreenshot(page, pageNumber);
          } catch (e) {
            // Ignore screenshot errors
          }
          try {
            await page.close();
          } catch (e) {
            // Ignore
          }
        }

        // If connection was lost, try to reconnect
        if (error.message.includes('Connection closed') ||
            error.message.includes('Protocol error') ||
            error.message.includes('Target closed')) {
          this.browser = null; // Force reconnection on next attempt
        }

        if (attempt < MAX_RETRIES) {
          console.log(`           RETRY (${attempt}/${MAX_RETRIES}) - ${error.message}`);
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    return {
      data: [],
      error: lastError?.message || 'Unknown error'
    };
  }
}
