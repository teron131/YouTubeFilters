console.log("[Filter] Content script injected!");

// ============================================================================
// SECTION 1: UTILITY FUNCTIONS
// Parse raw text data into usable formats
// ============================================================================

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


// ============================================================================
// SECTION 2: VIDEO DATA EXTRACTION
// Extract video metadata from YouTube's DOM structure
// ============================================================================

/**
 * Extracts video data from a YouTube video card element
 * Handles modern YouTube (2025+) layout with badge-shape elements
 * 
 * @param {HTMLElement} videoElement - The video card DOM element
 * @returns {Object} Video data object with title, duration, views, etc.
 */
function extractVideoData(videoElement) {
  const data = {
    title: null,
    viewCount: null,
    duration: null,
    publishTime: null,
    videoId: null,
  };

  try {
    // Extract Video ID
    const videoData = videoElement.querySelector("[data-video-id]");
    if (videoData) {
      data.videoId = videoData.getAttribute("data-video-id");
    }

    // Extract Title
    const titleElement =
      videoElement.querySelector("#video-title") ||
      videoElement.querySelector("a#video-title-link") ||
      videoElement.querySelector("#video-title-link") ||
      videoElement.querySelector("h3 a") ||
      videoElement.querySelector("yt-formatted-string#video-title") ||
      videoElement.querySelector("[aria-label*='by']");

    if (titleElement) {
      data.title =
        titleElement.textContent?.trim() ||
        titleElement.getAttribute("title")?.trim() ||
        titleElement.getAttribute("aria-label")?.split(" by ")[0]?.trim();
    }

    // Extract Duration (Modern YouTube 2025+ uses badge-shape custom elements)
    const durationSelectors = [
      "badge-shape .yt-badge-shape__text",      // Modern layout (2025+)
      "badge-shape div",
      ".yt-badge-shape__text",
      "yt-thumbnail-badge-view-model",
      "ytd-thumbnail-overlay-time-status-renderer span", // Legacy
      "span.ytd-thumbnail-overlay-time-status-renderer",
      "#time-status span",
      ".badge-style-type-simple",
    ];

    for (const selector of durationSelectors) {
      const element = videoElement.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text && text.match(/^\d+:\d+/)) {
        data.duration = text;
        break;
      }
    }
    
    // Fallback: Use innerText from thumbnail link
    if (!data.duration) {
      const thumbLink = videoElement.querySelector("a#thumbnail, a[href*='/watch']");
      if (thumbLink) {
        const thumbText = thumbLink.innerText?.trim();
        const timeMatch = thumbText?.match(/\d+:\d+/);
        if (timeMatch) {
          data.duration = timeMatch[0];
        }
      }
    }

    // Extract Views and Publish Time (Modern YouTube doesn't use #metadata-line)
    // Use regex on video card's innerText instead
    const fullText = videoElement.innerText || "";
    
    // Extract view count
    if (!data.viewCount) {
      const viewMatch = fullText.match(/(\d+(?:\.\d+)?[KMB]?)\s*views?/i);
      if (viewMatch) {
        data.viewCount = viewMatch[0];
      } else if (fullText.match(/No views?/i)) {
        data.viewCount = "No views";
      }
    }
    
    // Extract publish time
    if (!data.publishTime) {
      const timeMatch = fullText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
      if (timeMatch) {
        data.publishTime = timeMatch[0];
      } else if (fullText.match(/streamed\s+(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i)) {
        const streamMatch = fullText.match(/streamed\s+(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)/i);
        data.publishTime = streamMatch?.[1];
      }
    }

  } catch (error) {
    console.warn("[Filter] Error extracting video data:", error);
  }

  // Debug log for incomplete extraction
  if (!data.duration || !data.viewCount || !data.publishTime) {
    const missing = [];
    if (!data.duration) missing.push("duration");
    if (!data.viewCount) missing.push("viewCount");
    if (!data.publishTime) missing.push("publishTime");

    if (missing.length > 0) {
      console.debug(`[Filter] Incomplete extraction for "${data.title}": Missing ${missing.join(", ")}`);
    }
  }

  return data;
}


// ============================================================================
// SECTION 3: FILTER LOGIC
// Individual filter functions - each returns true if video should be filtered
// ============================================================================

/**
 * Checks if video should be filtered by view count
 * @returns {Object} { shouldFilter: boolean, reason: string }
 */
function checkViewsFilter(videoData, settings) {
  if (!settings.viewsFilterEnabled || settings.minViews <= 0) {
    return { shouldFilter: false };
  }

  // Filter videos with no view count (Mix playlists, live streams, etc.)
  if (!videoData.viewCount) {
    return {
      shouldFilter: true,
      reason: "no-views",
      details: "No view count (likely Mix/Playlist)"
    };
  }

  // Check if views are below threshold
  const views = parseViewCount(videoData.viewCount);
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
 * @returns {Object} { shouldFilter: boolean, reason: string }
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

  const durationSeconds = parseDuration(videoData.duration);
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
 * @returns {Object} { shouldFilter: boolean, reason: string }
 */
function checkAgeFilter(videoData, settings) {
  if (!settings.ageFilterEnabled || settings.maxAge <= 0) {
    return { shouldFilter: false };
  }

  if (!videoData.publishTime) {
    return { shouldFilter: false }; // Can't filter without age
  }

  const videoAge = parseVideoAge(videoData.publishTime);
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
 * @returns {Object} { shouldFilter: boolean, reason: string }
 */
function checkKeywordsFilter(videoData, settings) {
  if (!settings.keywordsFilterEnabled || !settings.bannedKeywords || settings.bannedKeywords.length === 0) {
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


// ============================================================================
// SECTION 4: FILTER APPLICATION
// Main filtering orchestration and DOM manipulation
// ============================================================================

// Global state
let filterSettings = DEFAULT_SETTINGS;
let filterStats = { views: 0, keywords: 0, duration: 0, age: 0, total: 0 };

/**
 * Stores filtered video information for history tracking
 */
function storeFilteredVideo(title, reason) {
  chrome.storage.local.get(["filteredVideos"], (result) => {
    const videos = result.filteredVideos || [];
    videos.push({
      title,
      reason,
      timestamp: new Date().toISOString(),
    });
    if (videos.length > 100) {
      videos.shift(); // Keep only last 100
    }
    chrome.storage.local.set({ filteredVideos: videos });
  });
}

/**
 * Applies all filters to video cards on the page
 * Main filtering orchestration function
 */
function runAllFilters() {
  console.log("[Filter] Running all filters...");

  if (!filterSettings.viewsFilterEnabled &&
      !filterSettings.durationFilterEnabled &&
      !filterSettings.keywordsFilterEnabled &&
      !filterSettings.ageFilterEnabled) {
    console.log("[Filter] All filters disabled, skipping");
    return;
  }

  // Reset current run stats
  const currentStats = { views: 0, keywords: 0, duration: 0, age: 0, total: 0 };
  let newFilters = false;

  // Find all video card elements
  const videoCards = document.querySelectorAll(
    "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer"
  );

  console.log(`[Filter] Found ${videoCards.length} video cards to process`);
  console.log(`[Filter] Current settings:`, filterSettings);

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
    const videoData = extractVideoData(videoElement);
    const title = videoData.title || "Unknown title";
    
    // Debug log for first few videos
    if (processedCount <= 3) {
      console.log(`[Filter] Video ${processedCount} data:`, {
        title,
        viewCount: videoData.viewCount,
        duration: videoData.duration,
        publishTime: videoData.publishTime
      });
    }

    // Apply each filter in order
    const filters = [
      checkViewsFilter(videoData, filterSettings),
      checkDurationFilter(videoData, filterSettings),
      checkAgeFilter(videoData, filterSettings),
      checkKeywordsFilter(videoData, filterSettings)
    ];

    // Find first filter that triggers
    const triggeredFilter = filters.find(f => f.shouldFilter);

    if (triggeredFilter) {
      // Hide video
      videoElement.style.display = "none";
      videoElement.setAttribute("data-filtered", "true");
      videoElement.setAttribute("data-filter-reason", triggeredFilter.reason);
      
      // Update stats
      currentStats[triggeredFilter.reason]++;
      currentStats.total++;
      newFilters = true;
      
      // Store and log
      storeFilteredVideo(title, triggeredFilter.details);
      console.log(`[Filter] ✓ ${triggeredFilter.reason}: Hidden "${title}" - ${triggeredFilter.details}`);
    }
  });

  // Update global stats
  if (newFilters) {
    filterStats.views += currentStats.views;
    filterStats.keywords += currentStats.keywords;
    filterStats.duration += currentStats.duration;
    filterStats.age += currentStats.age;
    filterStats.total += currentStats.total;

    chrome.storage.local.set({ filterStats });
    console.log(
      `[Filter] Filtered ${currentStats.total} videos this run (${processedCount} new, ${alreadyFilteredCount} already filtered)`
    );
  }

  console.log("[Filter] Filtering complete. Total stats:", filterStats);
}


// ============================================================================
// SECTION 5: INITIALIZATION & EVENT HANDLERS
// Setup, observers, and event listeners
// ============================================================================

/**
 * Initializes the filtering extension
 */
function init() {
  console.log("[Filter] Initializing filter extension...");

  // Load settings and start filtering
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    filterSettings = settings;
    console.log("[Filter] Settings loaded:", filterSettings);

    // Run initial filter
    setTimeout(() => runAllFilters(), 1000); // Give YouTube time to render

    // Set up MutationObserver for dynamically loaded content
    let filterTimeout = null;
    const observer = new MutationObserver((mutations) => {
      const hasNewContent = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          // Check if node itself is a video card
          if (node.nodeName === 'YTD-VIDEO-RENDERER' || 
              node.nodeName === 'YTD-RICH-ITEM-RENDERER' || 
              node.nodeName === 'YTD-GRID-VIDEO-RENDERER') {
            return true;
          }
          // Or if it contains video cards
          return node.querySelector?.(
            "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer"
          );
        })
      );
      
      if (hasNewContent) {
        // Debounce: clear existing timeout and set new one
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => {
          console.log("[Filter] New videos detected, re-running filters...");
          runAllFilters();
        }, 800); // Batch multiple additions
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

  // Re-run filters on YouTube navigation (SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("[Filter] Page navigation detected, re-running filters...");
      setTimeout(() => runAllFilters(), 1500);
    }
  }).observe(document.querySelector("title"), {
    subtree: true,
    characterData: true,
    childList: true,
  });

  // Backup: Also re-run filters on scroll (for infinite scroll)
  let scrollTimeout = null;
  let lastVideoCount = 0;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentVideoCount = document.querySelectorAll(
        "ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer"
      ).length;
      
      if (currentVideoCount > lastVideoCount) {
        console.log(`[Filter] Scroll detected new videos (${lastVideoCount} → ${currentVideoCount}), re-running filters...`);
        lastVideoCount = currentVideoCount;
        runAllFilters();
      }
    }, 1000); // Wait 1s after scroll stops
  }, { passive: true });
}

// Start the extension
init();

