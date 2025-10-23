/**
 * Utility Functions Module
 * Contains parsing functions and helper utilities
 */

/**
 * Parses view count string to number
 * @param {string} text - e.g., "1.4K views", "2.3M views"
 * @returns {number} - e.g., 1400, 2300000
 */
function parseViewCount(text) {
  if (!text) return 0;

  const cleaned = text.replace(/views?/i, "").replace(/,/g, "").trim();
  const match = cleaned.match(/([\d\.]+)\s*([KMB]?)/i);

  if (match) {
    let number = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();
    if (suffix === "K") number *= 1000;
    else if (suffix === "M") number *= 1000000;
    else if (suffix === "B") number *= 1000000000;
    return number;
  }

  const directNumber = parseFloat(cleaned);
  return isNaN(directNumber) ? 0 : directNumber;
}

/**
 * Parses duration string to seconds
 * @param {string} text - e.g., "12:05", "1:23:45", "12 minutes"
 * @returns {number} - Total seconds
 */
function parseDuration(text) {
  if (!text) return 0;

  const cleaned = text.trim();

  // Colon-separated format (12:05 or 1:23:45)
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":").map((part) => parseInt(part.trim(), 10));
    if (parts.some(isNaN)) return 0;

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
  }

  // Text format (e.g., "1 hour 23 minutes")
  let totalSeconds = 0;
  const hourMatch = cleaned.match(/(\d+)\s*h(our)?s?/i);
  const minMatch = cleaned.match(/(\d+)\s*m(in(ute)?)?s?/i);
  const secMatch = cleaned.match(/(\d+)\s*s(ec(ond)?)?s?/i);

  if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
  if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
  if (secMatch) totalSeconds += parseInt(secMatch[1]);

  return totalSeconds;
}

/**
 * Parses video age to years
 * @param {string} text - e.g., "2 years ago", "3 months ago"
 * @returns {number} - Age in years (0 if less than 1 year)
 */
function parseVideoAge(text) {
  if (!text) return 0;
  const match = text.match(/(\d+)\s+year/i);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Creates a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Safely gets text content from an element
 * @param {Element} element - DOM element
 * @param {string} selector - CSS selector
 * @returns {string|null} Text content or null
 */
function getElementText(element, selector) {
  try {
    const el = element.querySelector(selector);
    return el?.textContent?.trim() || null;
  } catch (error) {
    console.warn(`[Utils] Error getting element text for selector "${selector}":`, error);
    return null;
  }
}

/**
 * Safely gets attribute value from an element
 * @param {Element} element - DOM element
 * @param {string} selector - CSS selector
 * @param {string} attribute - Attribute name
 * @returns {string|null} Attribute value or null
 */
function getElementAttribute(element, selector, attribute) {
  try {
    const el = element.querySelector(selector);
    return el?.getAttribute(attribute) || null;
  } catch (error) {
    console.warn(`[Utils] Error getting element attribute "${attribute}" for selector "${selector}":`, error);
    return null;
  }
}

/**
 * Logs with consistent formatting
 * @param {string} level - Log level (log, warn, error)
 * @param {string} module - Module name
 * @param {string} message - Message
 * @param {*} data - Optional data to log
 */
function log(level, module, message, data = null) {
  const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
  const prefix = `[${timestamp}] [${module}]`;

  switch (level) {
    case 'error':
      console.error(`${prefix} ❌ ${message}`, data || '');
      break;
    case 'warn':
      console.warn(`${prefix} ⚠️ ${message}`, data || '');
      break;
    case 'debug':
      console.debug(`${prefix} 🔍 ${message}`, data || '');
      break;
    default:
      console.log(`${prefix} ${message}`, data || '');
  }
}

// Export functions for use in other modules
if (typeof window !== "undefined") {
  window.YouTubeFilterUtils = {
    parseViewCount,
    parseDuration,
    parseVideoAge,
    debounce,
    getElementText,
    getElementAttribute,
    log
  };
}
