// /core/webFetch.js
/**
 * Purpose: Centralized module for network requests.
 * Provides a safe fetch implementation with timeouts, retries,
 * and a simple in-memory cache.
 *
 * Conforms to Batch 1 of MASTER_BUILD_GUIDE.md (Section 4.2.6).
 *
 * BATCH 4 MODIFICATION:
 * - Corrected a root-logic flaw: now handles 'text/html' and
 * 'text/plain' responses, not just 'application/json'.
 * - Integrated dynamic 'whitelist' and 'ttl' from fetchConfig,
 * which will be supplied by SettingsContext.
 * - Cache retrieval now correctly checks TTL and expires old entries.
 */

// A simple in-memory cache.
const responseCache = new Map();

// A basic whitelist. This will be merged with the user's
// list from SettingsContext.
const DEFAULT_DOMAIN_WHITELIST = new Set([
  'api.github.com',
  'gist.github.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'stackoverflow.com',
  'npmjs.com',
  'pypi.org',
  'localhost',
  '127.0.0.1',
]);

/**
 * Caches a response for a given URL.
 * @param {string} url - The URL to use as the cache key.
 * @param {any} data - The response data to cache.
 */
export function cacheResponse(url, data) {
  // This function just wraps the data with a timestamp
  responseCache.set(url, { data, timestamp: Date.now() });
  console.log(`[webFetch] Cached response for: ${url}`);
}

/**
 * Fetches a URL with added safety features (timeout, retries, whitelist).
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options (e.g., method, headers, body).
 * @param {object} [fetchConfig] - Configuration for the fetch behavior.
 * @param {number} [fetchConfig.retries=1] - Number of retry attempts.
 * @param {number} [fetchConfig.timeout=8000] - Timeout in milliseconds.
 * @param {string[]} [fetchConfig.whitelist=[]] - User-defined domain whitelist.
 * @param {number} [fetchConfig.ttl=300000] - Cache TTL in milliseconds (default 5 min).
 * @returns {Promise<Response>} A promise that resolves to the Response object.
 */
export async function fetchURL(url, options = {}, fetchConfig = {}) {
  const {
    retries = 1,
    timeout = 8000,
    whitelist = [],
    ttl = 300000,
  } = fetchConfig;

  // 1. Check Whitelist
  try {
    const { hostname } = new URL(url);
    // [CHANGED] Merge default and user-provided whitelists
    const mergedWhitelist = new Set([...DEFAULT_DOMAIN_WHITELIST, ...whitelist]);

    if (!mergedWhitelist.has(hostname)) {
      throw new Error(`Domain not in whitelist: ${hostname}`);
    }
  } catch (err) {
    throw new Error(`Invalid URL: ${err.message}`);
  }

  // 2. Check Cache
  if (options.method === 'GET' || !options.method) {
    if (responseCache.has(url)) {
      const cached = responseCache.get(url);
      const now = Date.now();

      // [CHANGED] Check Time-to-Live (TTL)
      if ((now - cached.timestamp) > ttl) {
        console.log(`[webFetch] Cache expired for: ${url}`);
        responseCache.delete(url);
      } else {
        console.log(`[webFetch] Returning cached response for: ${url}`);
        // [FIXED] Return raw text/html body, not JSON.stringify
        return new Response(cached.data.body, {
          status: cached.data.status,
          statusText: cached.data.statusText,
          headers: cached.data.headers,
        });
      }
    }
  }

  // 3. Perform Fetch
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 4. Cache successful GET requests
      if (options.method === 'GET' || !options.method) {
        // [FIXED] Clone and read as .text() to support HTML/Text/JSON
        const responseText = await response.clone().text();

        cacheResponse(url, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText, // Cache the raw text
        });
      }

      return response;

    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[webFetch] Request timed out: ${url}`);
      } else {
        console.warn(`[webFetch] Attempt ${i + 1} failed for ${url}: ${err.message}`);
      }
      
      if (i === retries - 1) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts.`);
      }
    }
  }
}