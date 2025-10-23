/** Default settings for YouTube Filters extension. */
const DEFAULT_SETTINGS = {
  viewsFilterEnabled: true,
  durationFilterEnabled: true,
  keywordFilterEnabled: true,
  ageFilterEnabled: true,
  minViews: 10000,
  minDuration: 60,
  maxDuration: 3600,
  maxAgeYears: 5,
  keywords: ["spoiler", "clickbait", "sponsor"],
};

// Make the settings available to other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_SETTINGS };
} else {
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
}
