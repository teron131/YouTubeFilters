/**
 * Main Entry Point
 * Coordinates all modules and initializes the YouTube filter extension
 */

console.log("[Filter] Content script injected!");

// Skip filtering on subscriptions page - only subscription extractor runs there
if (location.href.includes("/feed/channels")) {
  console.log("[Filter] Skipping filters on subscriptions page - subscription extractor only");
} else {
  // Initialize the filter system
  initializeYouTubeFilters();
}

/**
 * Initializes the YouTube filter system
 */
async function initializeYouTubeFilters() {
  try {
    // Wait for YouTube to be ready
    YouTubeFilterDOM.waitForYouTubeReady(async () => {
      try {
        // Get filter engine instance
        const filterEngine = YouTubeFilterEngine.getFilterEngine();

        // Initialize the engine
        await filterEngine.initialize();

        // Run initial filter pass
        setTimeout(() => {
          filterEngine.runFilters();
        }, 1000); // Give YouTube time to render

      } catch (error) {
        YouTubeFilterUtils.log('error', 'Main', 'Failed to initialize filter system:', error);
      }
    });

  } catch (error) {
    YouTubeFilterUtils.log('error', 'Main', 'Critical error in filter initialization:', error);
  }
}

/**
 * Handles settings updates from popup or background
 * @param {Object} newSettings - Updated settings
 */
async function handleSettingsUpdate(newSettings) {
  try {
    const filterEngine = YouTubeFilterEngine.getFilterEngine();
    await filterEngine.updateSettings(newSettings);
  } catch (error) {
    YouTubeFilterUtils.log('error', 'Main', 'Error handling settings update:', error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'settingsUpdated') {
    handleSettingsUpdate(request.settings);
    sendResponse({ success: true });
  }
});

/**
 * Gets current filter statistics
 * @returns {Object} Statistics object
 */
function getFilterStats() {
  try {
    const filterEngine = YouTubeFilterEngine.getFilterEngine();
    return filterEngine.getStats();
  } catch (error) {
    YouTubeFilterUtils.log('error', 'Main', 'Error getting filter stats:', error);
    return null;
  }
}

/**
 * Gets current filter settings
 * @returns {Object} Settings object
 */
function getFilterSettings() {
  try {
    const filterEngine = YouTubeFilterEngine.getFilterEngine();
    return filterEngine.getSettings();
  } catch (error) {
    YouTubeFilterUtils.log('error', 'Main', 'Error getting filter settings:', error);
    return null;
  }
}

// Make functions available globally for debugging and testing
if (typeof window !== "undefined") {
  window.YouTubeFilterMain = {
    initializeYouTubeFilters,
    handleSettingsUpdate,
    getFilterStats,
    getFilterSettings
  };
}
