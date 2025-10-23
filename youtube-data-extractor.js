/**
 * YouTube Data Extractor
 * Advanced utility to extract video data from YouTube's internal data structures
 */

/**
 * Extract video data from ytInitialData (YouTube's internal data structure)
 * This is more reliable than DOM parsing as it accesses the actual JSON data
 */
function extractFromYTInitialData() {
  try {
    // Access YouTube's internal data
    const ytInitialData = window.ytInitialData;
    if (!ytInitialData) {
      console.log("[Filter] ytInitialData not available yet");
      return null;
    }

    const videoDataMap = new Map();

    // Navigate through the data structure to find video renderers
    function traverseData(obj, path = "") {
      if (!obj || typeof obj !== "object") return;

      // Check if this is a richItemRenderer or videoRenderer
      if (obj.richItemRenderer || obj.videoRenderer || obj.gridVideoRenderer) {
        const renderer =
          obj.richItemRenderer?.content ||
          obj.videoRenderer ||
          obj.gridVideoRenderer;

        // Extract video data
        const videoData = extractVideoFromRenderer(renderer);
        if (videoData && videoData.videoId) {
          videoDataMap.set(videoData.videoId, videoData);
        }
      }

      // Traverse arrays and objects
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => traverseData(item, `${path}[${index}]`));
      } else {
        Object.keys(obj).forEach((key) => {
          traverseData(obj[key], `${path}.${key}`);
        });
      }
    }

    traverseData(ytInitialData);
    return videoDataMap;
  } catch (error) {
    console.warn("[Filter] Error extracting from ytInitialData:", error);
    return null;
  }
}

/**
 * Extract video information from a renderer object
 */
function extractVideoFromRenderer(renderer) {
  const data = {
    videoId: null,
    title: null,
    viewCount: null,
    duration: null,
    publishTime: null,
    channelName: null,
  };

  try {
    // For lockupViewModel (new YouTube layout)
    if (renderer.lockupViewModel) {
      const lockup = renderer.lockupViewModel;

      // Get video ID from contentId
      data.videoId = lockup.contentId;

      // Get title from metadata
      if (lockup.metadata?.lockupMetadataViewModel?.title?.content) {
        data.title = lockup.metadata.lockupMetadataViewModel.title.content;
      }

      // Get duration from thumbnail badge
      if (lockup.contentImage?.thumbnailViewModel?.overlays) {
        for (const overlay of lockup.contentImage.thumbnailViewModel.overlays) {
          if (overlay.thumbnailOverlayBadgeViewModel) {
            const badge =
              overlay.thumbnailOverlayBadgeViewModel.thumbnailBadges?.[0];
            if (badge?.thumbnailBadgeViewModel?.text) {
              data.duration = badge.thumbnailBadgeViewModel.text;
            }
          }
        }
      }

      // Get view count and publish time from metadata rows
      if (
        lockup.metadata?.lockupMetadataViewModel?.metadata
          ?.contentMetadataViewModel?.metadataRows
      ) {
        const rows =
          lockup.metadata.lockupMetadataViewModel.metadata
            .contentMetadataViewModel.metadataRows;

        for (const row of rows) {
          if (row.metadataParts) {
            for (const part of row.metadataParts) {
              const content = part.text?.content;
              if (!content) continue;

              // Check if it's a view count
              if (
                content.match(/\d+.*views?/i) ||
                content.match(/No views?/i)
              ) {
                data.viewCount = content;
              }
              // Check if it's publish time
              else if (
                content.match(/ago|hour|day|week|month|year|minute|second/i)
              ) {
                data.publishTime = content;
              }
              // Check if it's channel name
              else if (part.text?.commandRuns) {
                data.channelName = content;
              }
            }
          }
        }
      }
    }
    // For traditional videoRenderer
    else if (renderer.videoId) {
      data.videoId = renderer.videoId;

      // Title
      if (renderer.title?.runs?.[0]?.text) {
        data.title = renderer.title.runs[0].text;
      } else if (renderer.title?.simpleText) {
        data.title = renderer.title.simpleText;
      }

      // Duration
      if (renderer.lengthText?.simpleText) {
        data.duration = renderer.lengthText.simpleText;
      }

      // View count
      if (renderer.viewCountText?.simpleText) {
        data.viewCount = renderer.viewCountText.simpleText;
      } else if (renderer.shortViewCountText?.simpleText) {
        data.viewCount = renderer.shortViewCountText.simpleText;
      }

      // Publish time
      if (renderer.publishedTimeText?.simpleText) {
        data.publishTime = renderer.publishedTimeText.simpleText;
      }

      // Channel name
      if (renderer.ownerText?.runs?.[0]?.text) {
        data.channelName = renderer.ownerText.runs[0].text;
      } else if (renderer.longBylineText?.runs?.[0]?.text) {
        data.channelName = renderer.longBylineText.runs[0].text;
      }
    }
  } catch (error) {
    console.warn("[Filter] Error extracting from renderer:", error);
  }

  return data;
}

/**
 * Get video data for a DOM element by matching it with ytInitialData
 */
function getVideoDataForElement(element) {
  const dataMap = extractFromYTInitialData();
  if (!dataMap) return null;

  // Try to find video ID from element
  const videoIdAttr = element.querySelector("[data-video-id]");
  if (videoIdAttr) {
    const videoId = videoIdAttr.getAttribute("data-video-id");
    return dataMap.get(videoId);
  }

  // Try to match by title
  const titleElement =
    element.querySelector("#video-title") ||
    element.querySelector("a#video-title-link");
  if (titleElement) {
    const titleText = titleElement.textContent?.trim();
    if (titleText) {
      for (const [videoId, data] of dataMap.entries()) {
        if (data.title === titleText) {
          return data;
        }
      }
    }
  }

  return null;
}

// Export functions for use in content script
if (typeof window !== "undefined") {
  window.YouTubeDataExtractor = {
    extractFromYTInitialData,
    extractVideoFromRenderer,
    getVideoDataForElement,
  };
}

