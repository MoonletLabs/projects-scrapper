/**
 * Fund Page Scraper
 * Uses Puppeteer to scrape social links from CryptoRank fund pages
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const BROWSERLESS_URL = 'wss://browserless.tiexo.com/';
const CRYPTORANK_FUND_URL = 'https://cryptorank.io/funds/';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const SELECTOR_TIMEOUT_MS = 15000;
const SCREENSHOTS_DIR = './screenshots';

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
 * Categorize a URL into a social link type
 * @param {string} href - The URL to categorize
 * @returns {string|null} - Category name or null if it's a website
 */
function categorizeLink(href) {
  const lowerHref = href.toLowerCase();
  
  if (lowerHref.includes('twitter.com/') || lowerHref.includes('x.com/')) {
    return 'twitter';
  }
  if (lowerHref.includes('t.me/') || lowerHref.includes('telegram.')) {
    return 'telegram';
  }
  if (lowerHref.includes('discord.gg/') || lowerHref.includes('discord.com/')) {
    return 'discord';
  }
  if (lowerHref.includes('medium.com/') || lowerHref.includes('medium.com/@')) {
    return 'medium';
  }
  if (lowerHref.includes('linkedin.com/')) {
    return 'linkedin';
  }
  if (lowerHref.includes('github.com/')) {
    return 'github';
  }
  if (lowerHref.includes('youtube.com/') || lowerHref.includes('youtu.be/')) {
    return 'youtube';
  }
  if (lowerHref.includes('facebook.com/')) {
    return 'facebook';
  }
  if (lowerHref.includes('instagram.com/')) {
    return 'instagram';
  }
  if (lowerHref.includes('reddit.com/')) {
    return 'reddit';
  }
  
  // It's a website (not a known social platform)
  return null;
}

/**
 * FundScraper class - manages browser connection and scraping
 */
export class FundScraper {
  /**
   * @param {object} options
   * @param {boolean} options.enableScreenshots - Whether to save screenshots
   */
  constructor(options = {}) {
    this.browser = null;
    this.enableScreenshots = options.enableScreenshots || false;
    this.screenshotsDir = SCREENSHOTS_DIR;
  }

  /**
   * Ensure screenshots directory exists
   */
  async ensureScreenshotsDir() {
    if (this.enableScreenshots && !existsSync(this.screenshotsDir)) {
      await mkdir(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Save a screenshot with a descriptive filename
   * @param {object} page - Puppeteer page instance
   * @param {string} fundKey - Fund key for filename
   * @param {string} status - 'success' or 'error'
   * @param {number} attempt - Attempt number (for retries)
   */
  async saveScreenshot(page, fundKey, status, attempt = 1) {
    if (!this.enableScreenshots) return;

    try {
      const subfolder = status === 'success' ? 'success' : 'failed';
      const targetDir = path.join(this.screenshotsDir, subfolder);
      if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${fundKey}_${status}_attempt${attempt}_${timestamp}.png`;
      const filepath = path.join(targetDir, filename);
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
   * Extract all social links from a fund page
   * @param {object} page - Puppeteer page instance
   * @returns {object} - { website, twitter, telegram, discord, linkedin, etc. }
   */
  async extractSocialLinks(page) {
    return await page.evaluate(() => {
      const links = document.querySelectorAll('a[class*="coin_social_link_item"]');
      const result = {
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
        medium: null,
        linkedin: null,
        github: null,
        youtube: null,
        facebook: null,
        instagram: null,
        reddit: null
      };

      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;

        const lowerHref = href.toLowerCase();

        // Skip CryptoRank's own accounts
        if (lowerHref.includes('cryptorank')) continue;

        // Categorize the link
        if (lowerHref.includes('twitter.com/') || lowerHref.includes('x.com/')) {
          result.twitter = href;
        } else if (lowerHref.includes('t.me/') || lowerHref.includes('telegram.')) {
          result.telegram = href;
        } else if (lowerHref.includes('discord.gg/') || lowerHref.includes('discord.com/')) {
          result.discord = href;
        } else if (lowerHref.includes('medium.com/') || lowerHref.includes('medium.com/@')) {
          result.medium = href;
        } else if (lowerHref.includes('linkedin.com/')) {
          result.linkedin = href;
        } else if (lowerHref.includes('github.com/')) {
          result.github = href;
        } else if (lowerHref.includes('youtube.com/') || lowerHref.includes('youtu.be/')) {
          result.youtube = href;
        } else if (lowerHref.includes('facebook.com/')) {
          result.facebook = href;
        } else if (lowerHref.includes('instagram.com/')) {
          result.instagram = href;
        } else if (lowerHref.includes('reddit.com/')) {
          result.reddit = href;
        } else {
          // It's a website
          result.website = href;
        }
      }

      return result;
    });
  }

  /**
   * Check if any social links were found
   * @param {object} links - The extracted links object
   * @returns {boolean}
   */
  hasAnyLinks(links) {
    return Object.values(links).some(v => v !== null);
  }

  /**
   * Scrape a single fund page with retry logic
   * @param {string} key - Fund key (e.g., 'coinbase-ventures')
   * @param {number} index - Current index for logging
   * @param {number} total - Total funds for logging
   * @returns {object} - { website, twitter, ..., error }
   */
  async scrapeFund(key, index, total) {
    const url = `${CRYPTORANK_FUND_URL}${key}`;
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
        
        // Navigate to the fund page (networkidle2 waits for dynamic content)
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Wait for social links to appear with longer timeout
        try {
          await page.waitForSelector('a[class*="coin_social_link_item"]', { timeout: SELECTOR_TIMEOUT_MS });
        } catch (e) {
          // Selector not found - try waiting a bit more and check again
          await delay(2000);
        }

        // Extract social links
        const links = await this.extractSocialLinks(page);

        // If no links found and we have retries left, retry
        if (!this.hasAnyLinks(links) && attempt < MAX_RETRIES) {
          await this.saveScreenshot(page, key, 'no-links', attempt);
          await page.close();
          page = null;
          throw new Error('No social links found - retrying');
        }

        // If still no links after all retries, mark as error for reprocessing
        if (!this.hasAnyLinks(links)) {
          await this.saveScreenshot(page, key, 'error-no-links', attempt);
          await page.close();
          page = null;
          return { ...links, error: 'No social links found' };
        }

        // Success - save screenshot
        await this.saveScreenshot(page, key, 'success', attempt);
        await page.close();
        page = null;

        return { ...links, error: null };

      } catch (error) {
        lastError = error;

        // Take screenshot on error if page is still open
        if (page) {
          try {
            await this.saveScreenshot(page, key, 'error', attempt);
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
      website: null, 
      twitter: null,
      telegram: null,
      discord: null,
      medium: null,
      linkedin: null,
      github: null,
      youtube: null,
      facebook: null,
      instagram: null,
      reddit: null,
      error: lastError?.message || 'Unknown error' 
    };
  }
}
