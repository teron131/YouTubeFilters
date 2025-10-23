/**
 * Filter Engine Module
 * Main orchestration logic for the YouTube filtering system
 */

class YouTubeFilterEngine {
  constructor() {
    this.settings = null;
    this.stats = null;
    this.isInitialized = false;
    this.observers = [];
    this.cleanupFunctions = [];
  }

  /**
   * Initializes the filter engine
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      YouTubeFilterUtils.log('log', 'Engine', 'Initializing filter engine...');

      // Load settings and stats
      this.settings = await YouTubeFilterSettings.loadSettings();
      this.stats = await YouTubeFilterSettings.loadStats();

      // Set up DOM observers and listeners
      this.setupObservers();

      // Mark as initialized
      this.isInitialized = true;

      YouTubeFilterUtils.log('log', 'Engine', 'Filter engine initialized successfully');

    } catch (error) {
      YouTubeFilterUtils.log('error', 'Engine', 'Failed to initialize filter engine:', error);
      throw error;
    }
  }

  /**
   * Sets up DOM observers and event listeners
   */
  setupObservers() {
    // Content observer for dynamically loaded videos
    const contentObserver = YouTubeFilterDOM.setupContentObserver(() => {
      this.runFilters();
    });
    this.observers.push(contentObserver);

    // Scroll listener for infinite scroll
    const cleanupScroll = YouTubeFilterDOM.setupScrollListener(() => {
      this.runFilters();
    });
    this.cleanupFunctions.push(cleanupScroll);

    // Navigation observer for SPA navigation
    const navObserver = YouTubeFilterDOM.setupNavigationObserver(() => {
      this.runFilters();
    });
    this.observers.push(navObserver);
  }

  /**
   * Runs all filters on current video cards
   */
  async runFilters() {
    if (!this.isInitialized || !this.settings) {
      YouTubeFilterUtils.log('warn', 'Engine', 'Filter engine not initialized, skipping filters');
      return;
    }

    // Check if any filters are enabled
    const hasEnabledFilters = [
      this.settings.viewsFilterEnabled,
      this.settings.durationFilterEnabled,
      this.settings.keywordFilterEnabled,
      this.settings.ageFilterEnabled
    ].some(enabled => enabled);

    if (!hasEnabledFilters) {
      YouTubeFilterUtils.log('log', 'Engine', 'All filters disabled, skipping');
      return;
    }

    YouTubeFilterUtils.log('log', 'Engine', 'Running filters...');

    const videoCards = YouTubeFilterDOM.findVideoCards();
    YouTubeFilterUtils.log('log', 'Engine', `Processing ${videoCards.length} video cards`);

    const currentRunStats = {
      views: 0,
      keywords: 0,
      duration: 0,
      age: 0,
      total: 0
    };

    let newFilters = false;
    let processedCount = 0;
    let alreadyFilteredCount = 0;

    videoCards.forEach((videoElement) => {
      if (!videoElement) return;

      // Skip already filtered videos
      if (videoElement.hasAttribute("data-filtered")) {
        alreadyFilteredCount++;
        return;
      }

      processedCount++;

      // Extract video data
      const videoData = YouTubeFilterExtractor.extractVideoData(videoElement);
      const title = videoData.title || "Unknown title";

      // Debug log for first few videos
      if (processedCount <= 3) {
        YouTubeFilterUtils.log('debug', 'Engine', `Video ${processedCount} data:`, {
          title,
          viewCount: videoData.viewCount,
          duration: videoData.duration,
          publishTime: videoData.publishTime
        });
      }

      // Apply all filters
      const filterResult = YouTubeFilterFunctions.applyAllFilters(videoData, this.settings);

      if (filterResult) {
        // Hide the video
        YouTubeFilterDOM.hideVideoElement(videoElement, filterResult.reason);

        // Update stats
        currentRunStats[filterResult.reason]++;
        currentRunStats.total++;
        newFilters = true;

        // Store filtered video
        YouTubeFilterSettings.addFilteredVideo(title, filterResult.details).catch(error => {
          YouTubeFilterUtils.log('error', 'Engine', 'Error storing filtered video:', error);
        });

        YouTubeFilterUtils.log('log', 'Engine', `✓ ${filterResult.reason}: Hidden "${title}" - ${filterResult.details}`);
      }
    });

    // Update global stats
    if (newFilters) {
      this.stats.views += currentRunStats.views;
      this.stats.keywords += currentRunStats.keywords;
      this.stats.duration += currentRunStats.duration;
      this.stats.age += currentRunStats.age;
      this.stats.total += currentRunStats.total;

      // Save updated stats
      YouTubeFilterSettings.saveStats(this.stats).catch(error => {
        YouTubeFilterUtils.log('error', 'Engine', 'Error saving stats:', error);
      });

      YouTubeFilterUtils.log('log', 'Engine',
        `Filtered ${currentRunStats.total} videos this run (${processedCount} new, ${alreadyFilteredCount} already filtered)`
      );
    }

    YouTubeFilterUtils.log('log', 'Engine', 'Filtering complete. Total stats:', this.stats);
  }

  /**
   * Updates settings and re-runs filters if needed
   * @param {Object} newSettings - New settings object
   */
  async updateSettings(newSettings) {
    try {
      this.settings = await YouTubeFilterSettings.validateAndSanitizeSettings(newSettings);
      await YouTubeFilterSettings.saveSettings(this.settings);

      YouTubeFilterUtils.log('log', 'Engine', 'Settings updated, re-running filters...');
      this.runFilters();
    } catch (error) {
      YouTubeFilterUtils.log('error', 'Engine', 'Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Gets current filter statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Gets current settings
   * @returns {Object} Settings object
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Resets all statistics
   */
  async resetStats() {
    this.stats = { ...YouTubeFilterSettings.DEFAULT_STATS };
    await YouTubeFilterSettings.saveStats(this.stats);
    YouTubeFilterUtils.log('log', 'Engine', 'Statistics reset');
  }

  /**
   * Clears all filtered videos history
   */
  async clearHistory() {
    await YouTubeFilterSettings.clearFilteredVideos();
    YouTubeFilterUtils.log('log', 'Engine', 'Filtered videos history cleared');
  }

  /**
   * Cleans up observers and listeners
   */
  destroy() {
    // Disconnect observers
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (error) {
        YouTubeFilterUtils.log('error', 'Engine', 'Error disconnecting observer:', error);
      }
    });
    this.observers = [];

    // Run cleanup functions
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        YouTubeFilterUtils.log('error', 'Engine', 'Error running cleanup function:', error);
      }
    });
    this.cleanupFunctions = [];

    this.isInitialized = false;
    YouTubeFilterUtils.log('log', 'Engine', 'Filter engine destroyed');
  }
}

// Singleton instance
let filterEngineInstance = null;

/**
 * Gets the filter engine singleton instance
 * @returns {YouTubeFilterEngine} Filter engine instance
 */
function getFilterEngine() {
  if (!filterEngineInstance) {
    filterEngineInstance = new YouTubeFilterEngine();
  }
  return filterEngineInstance;
}

// Export functions
if (typeof window !== "undefined") {
  window.YouTubeFilterEngine = {
    getFilterEngine,
    YouTubeFilterEngine
  };
}
