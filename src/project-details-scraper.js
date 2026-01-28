/**
 * Project Details Scraper
 * Uses Puppeteer to scrape detailed project information from CryptoRank ICO pages
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://browserless.tiexo.com/';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const SELECTOR_TIMEOUT_MS = 15000;
const SCREENSHOTS_DIR = './screenshots/project-details';

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
 * Parse amount string to raw number
 * @param {string} amountStr - Amount string like "$5.5M" or "$1.2B"
 * @returns {number|null} - Parsed number or null
 */
function parseAmount(amountStr) {
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
 * Parse supply string (e.g., "10B", "1.825B") to raw number
 * @param {string} supplyStr - Supply string
 * @returns {number|null} - Parsed number or null
 */
function parseSupply(supplyStr) {
  if (!supplyStr || supplyStr === '-' || supplyStr === 'N/A') {
    return null;
  }

  const cleaned = supplyStr.replace(/[,\s]/g, '').toUpperCase();
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
 * ProjectDetailsScraper class - manages browser connection and scraping
 */
export class ProjectDetailsScraper {
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
   * @param {string} projectKey - Project key for filename
   */
  async saveScreenshot(page, projectKey) {
    try {
      await this.ensureScreenshotsDir();
      const filename = `${projectKey}.png`;
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
   * Extract project details from the current page
   * @param {object} page - Puppeteer page instance
   * @returns {object} - Project details object
   */
  async extractDetails(page) {
    return await page.evaluate(() => {
      const details = {
        description: null,
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
        github: null,
        linkedin: null,
        tokenSymbol: null,
        tokenPrice: null,
        marketCap: null,
        fdv: null,
        totalSupply: null,
        circulatingSupply: null,
        categories: [],
        totalRaised: null,
        tgeDate: null,
        valuation: null
      };

      // Helper to check if a link is a CryptoRank site link (not a project link)
      const isSiteLink = (href) => {
        const lower = href.toLowerCase();
        return lower.includes('cryptorank.io') ||
               lower.includes('cryptorank_io') ||
               lower.includes('/cryptorank') ||
               lower.includes('cryptoranknews') ||
               lower.includes('cryptorank-io');
      };

      // Get all links on the page excluding footer (which has CryptoRank's own social links)
      const footer = document.querySelector('footer, [class*="footer"], [class*="Footer"]');
      const allLinks = document.querySelectorAll('a[href]');

      // Helper to check if element is in footer area
      const isInFooter = (el) => {
        if (!footer) return false;
        return footer.contains(el);
      };

      // Helper to check if this looks like a project social link (not site navigation)
      const isProjectLink = (link) => {
        // Skip footer links
        if (isInFooter(link)) return false;

        const href = link.getAttribute('href') || '';
        // Skip internal CryptoRank links
        if (isSiteLink(href)) return false;
        // Skip anchor links
        if (href.startsWith('#')) return false;
        // Skip javascript links
        if (href.startsWith('javascript:')) return false;

        return true;
      };

      // First pass: collect all external links with their context
      for (const link of allLinks) {
        if (!isProjectLink(link)) continue;

        const href = link.getAttribute('href') || '';
        const hrefLower = href.toLowerCase();
        const linkText = (link.textContent?.trim() || '').toLowerCase();
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
        const title = (link.getAttribute('title') || '').toLowerCase();

        // Also check for SVG icons or img with alt text
        const svgTitle = link.querySelector('svg title')?.textContent?.toLowerCase() || '';
        const imgAlt = link.querySelector('img')?.getAttribute('alt')?.toLowerCase() || '';
        const allContext = `${linkText} ${ariaLabel} ${title} ${svgTitle} ${imgAlt}`;

        // Twitter/X detection
        if (!details.twitter) {
          if (hrefLower.includes('twitter.com/') || hrefLower.includes('x.com/')) {
            if (!hrefLower.includes('/status/')) {
              details.twitter = href;
            }
          } else if (allContext.includes('twitter') || linkText === 'x' || allContext === 'x') {
            if (href.startsWith('http')) {
              details.twitter = href;
            }
          }
        }

        // Telegram detection
        if (!details.telegram) {
          if (hrefLower.includes('t.me/') || hrefLower.includes('telegram.')) {
            details.telegram = href;
          } else if (allContext.includes('telegram')) {
            if (href.startsWith('http')) {
              details.telegram = href;
            }
          }
        }

        // Discord detection
        if (!details.discord) {
          if (hrefLower.includes('discord.gg/') || hrefLower.includes('discord.com/')) {
            details.discord = href;
          } else if (allContext.includes('discord')) {
            if (href.startsWith('http')) {
              details.discord = href;
            }
          }
        }

        // GitHub detection
        if (!details.github) {
          if (hrefLower.includes('github.com/') && !hrefLower.includes('github.com/topics')) {
            details.github = href;
          } else if (allContext.includes('github')) {
            if (href.startsWith('http')) {
              details.github = href;
            }
          }
        }

        // LinkedIn detection
        if (!details.linkedin) {
          if (hrefLower.includes('linkedin.com/') || hrefLower.includes('linkedin.')) {
            details.linkedin = href;
          } else if (allContext.includes('linkedin')) {
            if (href.startsWith('http')) {
              details.linkedin = href;
            }
          }
        }

        // Website detection - look for links labeled "website" or "official"
        if (!details.website) {
          if (allContext.includes('website') || allContext.includes('official site')) {
            const isSocial = hrefLower.includes('twitter.com') || hrefLower.includes('x.com') ||
                           hrefLower.includes('t.me') || hrefLower.includes('telegram.') ||
                           hrefLower.includes('discord.') || hrefLower.includes('github.com') ||
                           hrefLower.includes('linkedin.') || hrefLower.includes('facebook.') ||
                           hrefLower.includes('youtube.') || hrefLower.includes('medium.com') ||
                           hrefLower.includes('reddit.com');
            if (!isSocial && href.startsWith('http')) {
              details.website = href;
            }
          }
        }
      }

      // Token symbol - look in the header area near the project name
      // Usually appears as a short uppercase string near the logo/name
      const headerArea = document.querySelector('header, [class*="header"], [class*="coin-info"], [class*="project-info"]');
      if (headerArea) {
        const symbolMatch = headerArea.textContent?.match(/\b([A-Z]{1,10})\b/g);
        if (symbolMatch) {
          // Filter to find the likely token symbol (short, uppercase)
          for (const sym of symbolMatch) {
            if (sym.length <= 6 && sym !== 'USD' && sym !== 'ETH' && sym !== 'BTC' && sym !== 'NFT') {
              details.tokenSymbol = sym;
              break;
            }
          }
        }
      }

      // Look for token symbol in the page - usually near price
      if (!details.tokenSymbol) {
        const priceAreas = document.querySelectorAll('[class*="price"], [class*="token"]');
        for (const area of priceAreas) {
          const text = area.textContent || '';
          const symbolMatch = text.match(/\b([A-Z]{1,6})\b/);
          if (symbolMatch && symbolMatch[1] !== 'USD' && symbolMatch[1] !== 'ETH' && symbolMatch[1] !== 'BTC') {
            details.tokenSymbol = symbolMatch[1];
            break;
          }
        }
      }

      // Token Price - look for the main price display (usually large, near $ sign)
      const priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]');
      for (const el of priceElements) {
        const text = el.textContent || '';
        const priceMatch = text.match(/\$\s*([\d,.]+)/);
        if (priceMatch && !details.tokenPrice) {
          details.tokenPrice = '$' + priceMatch[1];
          break;
        }
      }

      // Look for Fundraising Info section for total raised and valuation
      const findFundraisingSection = () => {
        const elements = document.querySelectorAll('h2, h3, h4, div, span');
        for (const el of elements) {
          const text = el.textContent?.trim().toLowerCase();
          if (text === 'fundraising info' || text === 'fundraising information') {
            return el.closest('div')?.parentElement || el.parentElement;
          }
        }
        return null;
      };

      const fundraisingSection = findFundraisingSection();
      if (fundraisingSection) {
        const text = fundraisingSection.textContent || '';

        // Total Raised
        const raisedMatch = text.match(/Total Raised[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
        if (raisedMatch) {
          details.totalRaised = '$' + raisedMatch[1].trim();
        }

        // Valuation
        const valuationMatch = text.match(/Valuation[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
        if (valuationMatch) {
          details.valuation = '$' + valuationMatch[1].trim();
        }
      }

      // Fallback: search for metrics in body text
      const bodyText = document.body.innerText || '';

      if (!details.totalRaised) {
        const raisedMatch = bodyText.match(/Total Raised[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
        if (raisedMatch) {
          details.totalRaised = '$' + raisedMatch[1].trim();
        }
      }

      if (!details.valuation) {
        const valuationMatch = bodyText.match(/Valuation[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
        if (valuationMatch) {
          details.valuation = '$' + valuationMatch[1].trim();
        }
      }

      // Market Cap
      const mcapMatch = bodyText.match(/Market Cap[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
      if (mcapMatch) {
        details.marketCap = '$' + mcapMatch[1].trim();
      }

      // FDV
      const fdvMatch = bodyText.match(/(?:FDV|Fully Diluted)[:\s]*\$\s*([\d,.]+\s*[KMB]?)/i);
      if (fdvMatch) {
        details.fdv = '$' + fdvMatch[1].trim();
      }

      // Total Supply
      const supplyMatch = bodyText.match(/Total Supply[:\s]*([\d,.]+\s*[KMB]?)/i);
      if (supplyMatch) {
        details.totalSupply = supplyMatch[1].trim();
      }

      // Circulating Supply
      const circMatch = bodyText.match(/Circulating Supply[:\s]*([\d,.]+\s*[KMB]?)/i);
      if (circMatch) {
        details.circulatingSupply = circMatch[1].trim();
      }

      // Description - look for project description in Overview section
      // Usually the first substantial paragraph on the page
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent?.trim();
        // Look for a paragraph that's descriptive (not too short, not a label)
        if (text && text.length > 100 && text.length < 2000) {
          // Exclude paragraphs that look like metadata or cookie/privacy banners
          const textLower = text.toLowerCase();
          if (!text.match(/^(Total|Price|Market|Supply|Raised)/i) &&
              !textLower.includes('privacy policy') &&
              !textLower.includes('cookies statement') &&
              !textLower.includes('cookie policy') &&
              !textLower.includes('accept our') &&
              !textLower.includes('using our site')) {
            details.description = text;
            break;
          }
        }
      }

      // Categories - look for category pills/tags in a specific categories section
      // Avoid picking up funding stage labels
      const categoryBlacklist = new Set([
        'lead', '+1', '+2', '+3', 'strategic', 'seed', 'series a', 'series b', 'series c',
        'series d', 'undisclosed', 'pre-seed', 'm&a', 'ico', 'ido', 'ieo',
        'we are hiring!', 'view more', 'see all', 'load more'
      ]);

      const categorySection = document.querySelector('[class*="categories"], [class*="tags"]');
      if (categorySection) {
        const categoryLinks = categorySection.querySelectorAll('a');
        for (const link of categoryLinks) {
          const text = link.textContent?.trim();
          if (text && text.length < 30 && !categoryBlacklist.has(text.toLowerCase())) {
            details.categories.push(text);
          }
        }
      }

      return details;
    });
  }

  /**
   * Scrape a single project page with retry logic
   * @param {string} projectKey - Project key for URL construction
   * @returns {object} - { details: object, error: string|null }
   */
  async scrapeProject(projectKey) {
    const url = `https://cryptorank.io/price/${projectKey}`;

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

        // Wait for page content to load
        try {
          await page.waitForSelector('body', { timeout: SELECTOR_TIMEOUT_MS });
          // Give additional time for dynamic content
          await delay(2000);

          // Try to dismiss cookie consent popup if present
          try {
            // Look for Accept cookies button by text content
            const dismissed = await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                const text = btn.textContent?.trim().toLowerCase();
                if (text === 'accept cookies' || text === 'accept' || text === 'i accept') {
                  btn.click();
                  return true;
                }
              }
              return false;
            });
            if (dismissed) {
              await delay(1000);
            }
          } catch (e) {
            // Ignore errors dismissing cookie popup
          }
        } catch (e) {
          // Content not fully loaded - continue anyway
        }

        // Extract details
        const rawDetails = await this.extractDetails(page);

        // Post-process the details (add parsed values)
        const fullDetails = {
          ...rawDetails,
          tokenPriceRaw: parseAmount(rawDetails.tokenPrice),
          marketCapRaw: parseAmount(rawDetails.marketCap),
          fdvRaw: parseAmount(rawDetails.fdv),
          totalSupplyRaw: parseSupply(rawDetails.totalSupply),
          circulatingSupplyRaw: parseSupply(rawDetails.circulatingSupply),
          totalRaisedRaw: parseAmount(rawDetails.totalRaised),
          valuationRaw: parseAmount(rawDetails.valuation),
          scrapedAt: new Date().toISOString()
        };

        // Filter out null/empty values, keep only fields with actual data
        const details = Object.fromEntries(
          Object.entries(fullDetails).filter(([key, value]) => {
            if (value === null || value === undefined) return false;
            if (Array.isArray(value) && value.length === 0) return false;
            return true;
          })
        );

        // Save screenshot
        await this.saveScreenshot(page, projectKey);
        await page.close();
        page = null;

        return { details, error: null };

      } catch (error) {
        lastError = error;

        // Take screenshot on error if page is still open
        if (page) {
          try {
            await this.saveScreenshot(page, projectKey);
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
      details: null,
      error: lastError?.message || 'Unknown error'
    };
  }
}
