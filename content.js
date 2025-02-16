console.log("[Filter] Content script injected!");

/** Parses a view count string and converts it to a number. For example, "1.4K views" will be converted to 1400. */
function parseViewCount(text) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/([\d\.]+)\s*([KM]?)/);
  if (match) {
    let number = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === "K") number *= 1000;
    else if (suffix === "M") number *= 1000000;
    return number;
  }
  return 0;
}

/** Parses a duration string in the format mm:ss or hh:mm:ss into total seconds. */
function parseDuration(text) {
  if (!text) return 0;
  const parts = text.split(":").map((part) => parseInt(part.trim(), 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  else if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** Parses a video age string and returns the age in years. For example, "2 years ago" returns 2. */
function parseVideoAge(text) {
  if (!text) return 0;
  const match = text.match(/(\d+)\s+year/);
  return match ? parseInt(match[1]) : 0;
}

// Default settings from shared setting
let filterSettings = DEFAULT_SETTINGS;

// Global stats object to track filtering
let filterStats = { views: 0, keywords: 0, duration: 0, age: 0, total: 0 };

// Store filtered video information
function storeFilteredVideo(title, reason) {
  chrome.storage.local.get(["filteredVideos"], (result) => {
    const videos = result.filteredVideos || [];
    videos.push({
      title,
      reason,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 100 videos
    if (videos.length > 100) {
      videos.shift();
    }
    chrome.storage.local.set({ filteredVideos: videos });
  });
}

/** Applies keyword filter to videos */
function applyKeywordFilter(keywords, currentStats) {
  if (!keywords || keywords.length === 0) return false;

  let newFilters = false;
  const loweredKeywords = keywords.map((k) => k.toLowerCase());
  const videos = document.querySelectorAll("h3.title, yt-formatted-string");

  videos.forEach((video) => {
    const videoNode = video.closest(
      "ytd-video-renderer, ytd-rich-item-renderer"
    );
    if (!videoNode || videoNode.hasAttribute("data-filtered")) return;

    const titleText = video.textContent.toLowerCase();
    for (const keyword of loweredKeywords) {
      if (titleText.includes(keyword)) {
        videoNode.style.display = "none";
        videoNode.setAttribute("data-filtered", "true");
        currentStats.keywords++;
        currentStats.total++;
        newFilters = true;
        storeFilteredVideo(
          video.textContent.trim(),
          `Banned keyword: ${keyword}`
        );
        console.log(
          `[Filter] Keyword: Hidden "${video.textContent.trim()}" (keyword: ${keyword})`
        );
        break;
      }
    }
  });

  return newFilters;
}

/** Applies all filters and updates stats */
function runAllFilters() {
  chrome.storage.local.get("filterStats", (data) => {
    let currentStats = data.filterStats || {
      views: 0,
      keywords: 0,
      duration: 0,
      age: 0,
      total: 0,
    };
    let newFilters = false;
    const videoCards = document.querySelectorAll(
      "ytd-video-renderer, ytd-rich-item-renderer"
    );
    videoCards.forEach((video) => {
      if (!video || video.hasAttribute("data-filtered")) return;
      const titleElement = video.querySelector("#video-title");
      const title = titleElement?.textContent?.trim() || "Unknown title";
      const spans = Array.from(video.querySelectorAll("span"));

      // View count filter
      if (filterSettings.viewsFilterEnabled && filterSettings.minViews > 0) {
        const viewCountElement = spans.find((span) =>
          span?.textContent?.includes(" views")
        );
        if (viewCountElement) {
          const views = parseViewCount(viewCountElement.textContent);
          if (views < filterSettings.minViews) {
            video.style.display = "none";
            video.setAttribute("data-filtered", "true");
            currentStats.views++;
            currentStats.total++;
            newFilters = true;
            storeFilteredVideo(title, `Low views: ${views}`);
            console.log(`[Filter] Views: Hidden "${title}" (${views} views)`);
            return;
          }
        }
      }

      // Duration filter
      if (
        filterSettings.durationFilterEnabled &&
        (filterSettings.minDuration > 0 || filterSettings.maxDuration > 0)
      ) {
        const durationElement =
          video.querySelector(
            "ytd-thumbnail-overlay-time-status-renderer span"
          ) ||
          video.querySelector(
            "span.ytd-thumbnail-overlay-time-status-renderer"
          );
        if (durationElement) {
          const durationText = durationElement.textContent?.trim();
          const seconds = parseDuration(durationText);
          const tooShort =
            filterSettings.minDuration > 0 &&
            seconds < filterSettings.minDuration;
          const tooLong =
            filterSettings.maxDuration > 0 &&
            seconds > filterSettings.maxDuration;
          if (tooShort || tooLong) {
            video.style.display = "none";
            video.setAttribute("data-filtered", "true");
            currentStats.duration++;
            currentStats.total++;
            newFilters = true;
            storeFilteredVideo(
              title,
              `Duration: ${durationText} (${
                tooShort ? "too short" : "too long"
              })`
            );
            console.log(
              `[Filter] Duration: Hidden "${title}" (${durationText})`
            );
            return;
          }
        }
      }

      // Age filter
      if (filterSettings.ageFilterEnabled && filterSettings.maxAgeYears > 0) {
        const publishedElement = spans.find((span) =>
          span?.textContent?.includes(" ago")
        );
        if (publishedElement) {
          const ageInYears = parseVideoAge(publishedElement.textContent);
          if (ageInYears > filterSettings.maxAgeYears) {
            video.style.display = "none";
            video.setAttribute("data-filtered", "true");
            currentStats.age++;
            currentStats.total++;
            newFilters = true;
            storeFilteredVideo(
              title,
              `Too old: ${publishedElement.textContent}`
            );
            console.log(
              `[Filter] Age: Hidden "${title}" (${publishedElement.textContent})`
            );
            return;
          }
        }
      }
    });

    // Keyword filter
    if (filterSettings.keywordFilterEnabled) {
      if (applyKeywordFilter(filterSettings.keywords, currentStats)) {
        newFilters = true;
      }
    }
    if (newFilters) {
      chrome.storage.local.set({ filterStats: currentStats }, () => {
        console.log(`[Filter] Stats updated - Total: ${currentStats.total}`);
      });
    }
  });
}

// Initialize
function init() {
  // Load settings first
  chrome.storage.sync.get(null, (result) => {
    // Merge loaded settings with defaults
    filterSettings = { ...DEFAULT_SETTINGS, ...result };
    console.log("[Filter] Settings loaded:", filterSettings);

    // Run initial filter
    runAllFilters();

    // Set up observer for future changes
    const observer = new MutationObserver((mutations) => {
      const hasNewContent = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) =>
          node.querySelector?.(
            "ytd-video-renderer, ytd-rich-item-renderer, h3.title, yt-formatted-string"
          )
        )
      );
      if (hasNewContent) {
        runAllFilters();
      }
    });

    const contentRoot = document.querySelector("ytd-app") || document.body;
    if (contentRoot) {
      observer.observe(contentRoot, {
        childList: true,
        subtree: true,
      });
      console.log("[Filter] Observer started");
    } else {
      console.log("[Filter] Warning: Could not find content root");
    }
  });
}

init();
