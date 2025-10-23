/**
 * Settings Manager Module
 * Centralizes settings loading, saving, and validation
 */

/**
 * Default filter settings
 */
const DEFAULT_FILTER_SETTINGS = {
  viewsFilterEnabled: true,
  durationFilterEnabled: true,
  keywordFilterEnabled: true,
  ageFilterEnabled: true,
  minViews: 10000,
  minDuration: 60,     // 1 minute
  maxDuration: 3600,   // 1 hour
  maxAge: 5,           // 5 years
  bannedKeywords: ["spoiler", "clickbait", "sponsor"]
};

/**
 * Default statistics
 */
const DEFAULT_STATS = {
  views: 0,
  keywords: 0,
  duration: 0,
  age: 0,
  total: 0
};

/**
 * Loads settings from Chrome storage
 * @returns {Promise<Object>} Settings object
 */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_FILTER_SETTINGS, (settings) => {
      // Validate and sanitize settings
      const validatedSettings = validateAndSanitizeSettings(settings);
      YouTubeFilterUtils.log('log', 'Settings', 'Loaded settings:', validatedSettings);
      resolve(validatedSettings);
    });
  });
}

/**
 * Saves settings to Chrome storage
 * @param {Object} settings - Settings object to save
 * @returns {Promise<void>}
 */
function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    const validatedSettings = validateAndSanitizeSettings(settings);

    chrome.storage.sync.set(validatedSettings, () => {
      if (chrome.runtime.lastError) {
        YouTubeFilterUtils.log('error', 'Settings', 'Error saving settings:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        YouTubeFilterUtils.log('log', 'Settings', 'Settings saved successfully');
        resolve();
      }
    });
  });
}

/**
 * Loads filter statistics
 * @returns {Promise<Object>} Statistics object
 */
function loadStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ filterStats: DEFAULT_STATS }, (result) => {
      resolve(result.filterStats);
    });
  });
}

/**
 * Saves filter statistics
 * @param {Object} stats - Statistics object to save
 * @returns {Promise<void>}
 */
function saveStats(stats) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ filterStats: stats }, () => {
      if (chrome.runtime.lastError) {
        YouTubeFilterUtils.log('error', 'Settings', 'Error saving stats:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Loads filtered videos history
 * @returns {Promise<Array>} Array of filtered video objects
 */
function loadFilteredVideos() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ filteredVideos: [] }, (result) => {
      resolve(result.filteredVideos);
    });
  });
}

/**
 * Adds a filtered video to history
 * @param {string} title - Video title
 * @param {string} reason - Filter reason
 * @returns {Promise<void>}
 */
function addFilteredVideo(title, reason) {
  return loadFilteredVideos().then(videos => {
    videos.push({
      title,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 100 videos
    if (videos.length > 100) {
      videos.shift();
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ filteredVideos: videos }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Clears filtered videos history
 * @returns {Promise<void>}
 */
function clearFilteredVideos() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ filteredVideos: [] }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Validates and sanitizes settings object
 * @param {Object} settings - Raw settings object
 * @returns {Object} Validated and sanitized settings
 */
function validateAndSanitizeSettings(settings) {
  const validated = { ...DEFAULT_FILTER_SETTINGS };

  // Boolean settings
  ['viewsFilterEnabled', 'durationFilterEnabled', 'keywordFilterEnabled', 'ageFilterEnabled'].forEach(key => {
    if (typeof settings[key] === 'boolean') {
      validated[key] = settings[key];
    }
  });

  // Numeric settings with bounds
  if (typeof settings.minViews === 'number' && settings.minViews >= 0) {
    validated.minViews = Math.floor(settings.minViews);
  }

  if (typeof settings.minDuration === 'number' && settings.minDuration >= 0) {
    validated.minDuration = Math.floor(settings.minDuration);
  }

  if (typeof settings.maxDuration === 'number' && settings.maxDuration >= 0) {
    validated.maxDuration = Math.floor(settings.maxDuration);
  }

  if (typeof settings.maxAge === 'number' && settings.maxAge >= 0 && settings.maxAge <= 20) {
    validated.maxAge = Math.floor(settings.maxAge);
  }

  // Keywords array
  if (Array.isArray(settings.bannedKeywords)) {
    validated.bannedKeywords = settings.bannedKeywords
      .filter(keyword => typeof keyword === 'string' && keyword.trim().length > 0)
      .map(keyword => keyword.trim().toLowerCase());
  }

  // Legacy settings compatibility
  if (settings.maxAgeYears && !settings.maxAge) {
    validated.maxAge = settings.maxAgeYears;
  }

  if (settings.keywords && !settings.bannedKeywords) {
    validated.bannedKeywords = settings.keywords;
  }

  return validated;
}

/**
 * Gets a user-friendly description of current settings
 * @param {Object} settings - Settings object
 * @returns {string} Description string
 */
function getSettingsDescription(settings) {
  const enabled = [];
  if (settings.viewsFilterEnabled) enabled.push(`views ≥ ${settings.minViews.toLocaleString()}`);
  if (settings.durationFilterEnabled) {
    const min = settings.minDuration ? `${Math.floor(settings.minDuration / 60)}min` : '0min';
    const max = settings.maxDuration ? `${Math.floor(settings.maxDuration / 60)}min` : '∞';
    enabled.push(`duration ${min}-${max}`);
  }
  if (settings.ageFilterEnabled) enabled.push(`age ≤ ${settings.maxAge} years`);
  if (settings.keywordFilterEnabled && settings.bannedKeywords.length > 0) {
    enabled.push(`keywords: ${settings.bannedKeywords.join(', ')}`);
  }

  return enabled.length > 0 ? enabled.join(', ') : 'No filters enabled';
}

/**
 * Resets settings to defaults
 * @returns {Promise<void>}
 */
function resetToDefaults() {
  return saveSettings(DEFAULT_FILTER_SETTINGS);
}

// Export functions and constants
if (typeof window !== "undefined") {
  window.YouTubeFilterSettings = {
    DEFAULT_FILTER_SETTINGS,
    DEFAULT_STATS,
    loadSettings,
    saveSettings,
    loadStats,
    saveStats,
    loadFilteredVideos,
    addFilteredVideo,
    clearFilteredVideos,
    validateAndSanitizeSettings,
    getSettingsDescription,
    resetToDefaults
  };
}
