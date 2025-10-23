/**
 * Filter Functions Module
 * Contains individual filter logic for different criteria
 */

/**
 * Base filter result structure
 * @typedef {Object} FilterResult
 * @property {boolean} shouldFilter - Whether to filter the video
 * @property {string} reason - Filter reason (views, duration, age, keyword)
 * @property {string} details - Detailed reason with values
 */

/**
 * Checks if video should be filtered by view count
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult} Filter result
 */
function checkViewsFilter(videoData, settings) {
  if (!settings.viewsFilterEnabled || settings.minViews <= 0) {
    return { shouldFilter: false };
  }

  // Filter videos with no view count (Mix playlists, live streams, etc.)
  if (!videoData.viewCount) {
    return {
      shouldFilter: true,
      reason: "views",
      details: "No view count (likely Mix/Playlist)"
    };
  }

  // Check if views are below threshold
  const views = YouTubeFilterUtils.parseViewCount(videoData.viewCount);
  if (views < settings.minViews) {
    return {
      shouldFilter: true,
      reason: "views",
      details: `Low views: ${videoData.viewCount} (${views})`
    };
  }

  return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by duration
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult} Filter result
 */
function checkDurationFilter(videoData, settings) {
  if (!settings.durationFilterEnabled) {
    return { shouldFilter: false };
  }

  if (!settings.minDuration && !settings.maxDuration) {
    return { shouldFilter: false };
  }

  if (!videoData.duration) {
    return { shouldFilter: false }; // Can't filter without duration
  }

  const durationSeconds = YouTubeFilterUtils.parseDuration(videoData.duration);
  const minOk = !settings.minDuration || durationSeconds >= settings.minDuration;
  const maxOk = !settings.maxDuration || durationSeconds <= settings.maxDuration;

  if (!minOk || !maxOk) {
    return {
      shouldFilter: true,
      reason: "duration",
      details: `Duration: ${videoData.duration} (${durationSeconds}s) outside range [${settings.minDuration || 0}, ${settings.maxDuration || "∞"}]`
    };
  }

  return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by age
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult} Filter result
 */
function checkAgeFilter(videoData, settings) {
  if (!settings.ageFilterEnabled || settings.maxAge <= 0) {
    return { shouldFilter: false };
  }

  if (!videoData.publishTime) {
    return { shouldFilter: false }; // Can't filter without age
  }

  const videoAge = YouTubeFilterUtils.parseVideoAge(videoData.publishTime);
  if (videoAge > settings.maxAge) {
    return {
      shouldFilter: true,
      reason: "age",
      details: `Too old: ${videoData.publishTime} (${videoAge} years)`
    };
  }

  return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by keywords
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult} Filter result
 */
function checkKeywordsFilter(videoData, settings) {
  if (!settings.keywordFilterEnabled || !settings.bannedKeywords || settings.bannedKeywords.length === 0) {
    return { shouldFilter: false };
  }

  if (!videoData.title) {
    return { shouldFilter: false }; // Can't filter without title
  }

  const titleLower = videoData.title.toLowerCase();

  for (const keyword of settings.bannedKeywords) {
    if (keyword && titleLower.includes(keyword.toLowerCase())) {
      return {
        shouldFilter: true,
        reason: "keyword",
        details: `Banned keyword: "${keyword}"`
      };
    }
  }

  return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by channel (future feature)
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult} Filter result
 */
function checkChannelFilter(videoData, settings) {
  // Placeholder for future channel-based filtering
  return { shouldFilter: false };
}

/**
 * Gets all available filter functions
 * @returns {Array<Function>} Array of filter functions
 */
function getAllFilterFunctions() {
  return [
    checkViewsFilter,
    checkDurationFilter,
    checkAgeFilter,
    checkKeywordsFilter,
    checkChannelFilter
  ];
}

/**
 * Applies all filters to video data
 * @param {Object} videoData - Extracted video data
 * @param {Object} settings - Filter settings
 * @returns {FilterResult|null} First matching filter result, or null if no filters apply
 */
function applyAllFilters(videoData, settings) {
  const filterFunctions = getAllFilterFunctions();

  for (const filterFunc of filterFunctions) {
    const result = filterFunc(videoData, settings);
    if (result.shouldFilter) {
      return result;
    }
  }

  return null; // No filters applied
}

// Export functions
if (typeof window !== "undefined") {
  window.YouTubeFilterFunctions = {
    checkViewsFilter,
    checkDurationFilter,
    checkAgeFilter,
    checkKeywordsFilter,
    checkChannelFilter,
    getAllFilterFunctions,
    applyAllFilters
  };
}
