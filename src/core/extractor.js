/**
 * Video Data Extraction Module
 * Handles extracting video metadata from YouTube's DOM structure
 */

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
    data.videoId = YouTubeFilterUtils.getElementAttribute(videoElement, "[data-video-id]", "data-video-id");

    // Extract Title with multiple fallback selectors
    const titleSelectors = [
      "#video-title",
      "a#video-title-link",
      "#video-title-link",
      "h3 a",
      "yt-formatted-string#video-title",
      "[aria-label*='by']" // Channel overlay format
    ];

    for (const selector of titleSelectors) {
      const titleElement = videoElement.querySelector(selector);
      if (titleElement) {
        data.title =
          titleElement.textContent?.trim() ||
          titleElement.getAttribute("title")?.trim() ||
          titleElement.getAttribute("aria-label")?.split(" by ")[0]?.trim();
        if (data.title) break;
      }
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
    YouTubeFilterUtils.log('error', 'Extractor', 'Error extracting video data:', error);
  }

  // Debug log for incomplete extraction
  const missing = [];
  if (!data.duration) missing.push("duration");
  if (!data.viewCount) missing.push("viewCount");
  if (!data.publishTime) missing.push("publishTime");

  if (missing.length > 0 && data.title) {
    YouTubeFilterUtils.log('debug', 'Extractor', `Incomplete extraction for "${data.title}": Missing ${missing.join(", ")}`);
  }

  return data;
}

/**
 * Validates extracted video data
 * @param {Object} data - Video data object
 * @returns {boolean} True if data is valid for filtering
 */
function isValidVideoData(data) {
  return !!(data.title && data.title !== "Unknown title" && data.title.trim().length > 0);
}

/**
 * Gets video data using YouTube's internal ytInitialData if available
 * @param {HTMLElement} element - Video element
 * @returns {Object|null} Video data from ytInitialData or null
 */
function getVideoDataFromYTInitialData(element) {
  try {
    // This would use the youtube-data-extractor.js functionality
    // For now, return null to use DOM extraction
    return null;
  } catch (error) {
    YouTubeFilterUtils.log('warn', 'Extractor', 'Error getting data from ytInitialData:', error);
    return null;
  }
}

// Export functions
if (typeof window !== "undefined") {
  window.YouTubeFilterExtractor = {
    extractVideoData,
    isValidVideoData,
    getVideoDataFromYTInitialData
  };
}
