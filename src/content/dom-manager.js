/**
 * DOM Manager Module
 * Handles DOM manipulation, observers, and UI updates
 */

/**
 * Video card selectors for different YouTube layouts
 */
const VIDEO_CARD_SELECTORS = [
  "ytd-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-grid-video-renderer"
];

/**
 * Finds all video card elements on the page
 * @returns {NodeList} Video card elements
 */
function findVideoCards() {
  const selector = VIDEO_CARD_SELECTORS.join(", ");
  return document.querySelectorAll(selector);
}

/**
 * Checks if an element is a video card
 * @param {Element} element - DOM element to check
 * @returns {boolean} True if element is a video card
 */
function isVideoCard(element) {
  return VIDEO_CARD_SELECTORS.some(selector =>
    element.matches?.(selector) ||
    element.nodeName?.toLowerCase() === selector.replace('ytd-', '').replace('-renderer', '')
  );
}

/**
 * Hides a filtered video element
 * @param {HTMLElement} videoElement - Video element to hide
 * @param {string} reason - Filter reason
 */
function hideVideoElement(videoElement, reason) {
  try {
    videoElement.style.display = "none";
    videoElement.setAttribute("data-filtered", "true");
    videoElement.setAttribute("data-filter-reason", reason);
  } catch (error) {
    YouTubeFilterUtils.log('error', 'DOM', 'Error hiding video element:', error);
  }
}

/**
 * Shows a video element (for debugging/unfiltering)
 * @param {HTMLElement} videoElement - Video element to show
 */
function showVideoElement(videoElement) {
  try {
    videoElement.style.display = "";
    videoElement.removeAttribute("data-filtered");
    videoElement.removeAttribute("data-filter-reason");
  } catch (error) {
    YouTubeFilterUtils.log('error', 'DOM', 'Error showing video element:', error);
  }
}

/**
 * Counts filtered and visible videos
 * @returns {Object} { filtered: number, visible: number, total: number }
 */
function getVideoCounts() {
  const allVideos = findVideoCards();
  let filtered = 0;
  let visible = 0;

  allVideos.forEach(video => {
    if (video.hasAttribute("data-filtered")) {
      filtered++;
    } else {
      visible++;
    }
  });

  return {
    filtered,
    visible,
    total: allVideos.length
  };
}

/**
 * Sets up MutationObserver for dynamically loaded content
 * @param {Function} callback - Callback function to run when new content is detected
 * @returns {MutationObserver} The observer instance
 */
function setupContentObserver(callback) {
  let filterTimeout = null;

  const observer = new MutationObserver((mutations) => {
    const hasNewContent = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        // Check if node itself is a video card
        if (isVideoCard(node)) {
          return true;
        }
        // Or if it contains video cards
        return node.querySelector?.(VIDEO_CARD_SELECTORS.join(", "));
      })
    );

    if (hasNewContent) {
      // Debounce: clear existing timeout and set new one
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        YouTubeFilterUtils.log('log', 'DOM', 'New videos detected, running filters...');
        callback();
      }, 800); // Batch multiple additions
    }
  });

  const contentRoot = document.querySelector("ytd-app") || document.body;
  if (contentRoot) {
    observer.observe(contentRoot, {
      childList: true,
      subtree: true,
    });
    YouTubeFilterUtils.log('log', 'DOM', 'Content observer started');
  } else {
    YouTubeFilterUtils.log('warn', 'DOM', 'Could not find content root for observer');
  }

  return observer;
}

/**
 * Sets up scroll listener for infinite scroll detection
 * @param {Function} callback - Callback function to run on scroll
 * @returns {Function} Cleanup function to remove the listener
 */
function setupScrollListener(callback) {
  let scrollTimeout = null;
  let lastVideoCount = 0;

  const handleScroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentVideoCount = findVideoCards().length;

      if (currentVideoCount > lastVideoCount) {
        YouTubeFilterUtils.log('log', 'DOM', `Scroll detected new videos (${lastVideoCount} → ${currentVideoCount}), running filters...`);
        lastVideoCount = currentVideoCount;
        callback();
      }
    }, 1000); // Wait 1s after scroll stops
  };

  window.addEventListener("scroll", handleScroll, { passive: true });

  // Return cleanup function
  return () => {
    window.removeEventListener("scroll", handleScroll);
    clearTimeout(scrollTimeout);
  };
}

/**
 * Sets up SPA navigation observer (for YouTube's single-page app)
 * @param {Function} callback - Callback function to run on navigation
 * @returns {MutationObserver} The observer instance
 */
function setupNavigationObserver(callback) {
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      YouTubeFilterUtils.log('log', 'DOM', 'Page navigation detected, running filters...');
      setTimeout(() => callback(), 1500);
    }
  });

  const titleElement = document.querySelector("title");
  if (titleElement) {
    observer.observe(titleElement, {
      subtree: true,
      characterData: true,
      childList: true,
    });
  }

  return observer;
}

/**
 * Waits for YouTube to load initial content
 * @param {Function} callback - Callback to run when ready
 * @param {number} timeout - Maximum wait time in ms
 */
function waitForYouTubeReady(callback, timeout = 10000) {
  const startTime = Date.now();

  const checkReady = () => {
    const hasVideos = findVideoCards().length > 0;
    const hasApp = document.querySelector("ytd-app");

    if (hasVideos && hasApp) {
      YouTubeFilterUtils.log('log', 'DOM', 'YouTube ready, initializing filters...');
      callback();
    } else if (Date.now() - startTime < timeout) {
      setTimeout(checkReady, 500);
    } else {
      YouTubeFilterUtils.log('warn', 'DOM', 'Timeout waiting for YouTube to load');
      callback(); // Run anyway
    }
  };

  checkReady();
}

/**
 * Creates a filter stats display element (for debugging)
 * @returns {HTMLElement} Stats display element
 */
function createStatsDisplay() {
  const statsDiv = document.createElement('div');
  statsDiv.id = 'youtube-filter-stats';
  statsDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  statsDiv.innerHTML = '<div>Filter Stats: Initializing...</div>';
  document.body.appendChild(statsDiv);
  return statsDiv;
}

/**
 * Updates the filter stats display
 * @param {Object} stats - Filter statistics
 */
function updateStatsDisplay(stats) {
  let statsDiv = document.getElementById('youtube-filter-stats');
  if (!statsDiv) {
    statsDiv = createStatsDisplay();
  }

  statsDiv.innerHTML = `
    <div><strong>YouTube Filter</strong></div>
    <div>Views: ${stats.views}</div>
    <div>Duration: ${stats.duration}</div>
    <div>Age: ${stats.age}</div>
    <div>Keywords: ${stats.keywords}</div>
    <div><strong>Total: ${stats.total}</strong></div>
  `;
}

// Export functions
if (typeof window !== "undefined") {
  window.YouTubeFilterDOM = {
    findVideoCards,
    isVideoCard,
    hideVideoElement,
    showVideoElement,
    getVideoCounts,
    setupContentObserver,
    setupScrollListener,
    setupNavigationObserver,
    waitForYouTubeReady,
    createStatsDisplay,
    updateStatsDisplay
  };
}
