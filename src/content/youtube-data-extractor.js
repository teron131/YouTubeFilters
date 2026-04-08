/**
 * YouTube Data Extractor
 * Prefer structured Polymer/ytInitialData metadata before falling back to DOM text.
 */

let cachedInitialData = null;
let cachedVideoDataMap = null;

function normalizeText(text) {
    if (typeof text !== "string") {
        return null;
    }

    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized || null;
}

function getTextContent(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return normalizeText(value);
    }

    if (value.simpleText) {
        return normalizeText(value.simpleText);
    }

    if (value.content) {
        return normalizeText(value.content);
    }

    if (Array.isArray(value.runs)) {
        return normalizeText(
            value.runs
                .map((run) => run?.text || run?.emoji?.emojiId || "")
                .join(""),
        );
    }

    return null;
}

function isViewCountText(text) {
    return Boolean(
        text && (/\bviews?\b/i.test(text) || /no views?/i.test(text)),
    );
}

function isPublishTimeText(text) {
    return Boolean(
        text &&
            /(streamed\s+)?\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i.test(
                text,
            ),
    );
}

function isDurationText(text) {
    return Boolean(text && /^(?:\d+:)?\d{1,2}:\d{2}$/.test(text));
}

function extractBadgeText(badges) {
    if (!Array.isArray(badges)) {
        return null;
    }

    for (const badge of badges) {
        const badgeText =
            getTextContent(badge?.thumbnailBadgeViewModel?.text) ||
            getTextContent(badge?.thumbnailBadgeViewModel?.animatedText) ||
            getTextContent(badge?.metadataBadgeRenderer?.label) ||
            getTextContent(badge?.metadataBadgeRenderer?.text);

        if (isDurationText(badgeText)) {
            return badgeText;
        }
    }

    return null;
}

function extractDurationFromOverlays(overlays) {
    if (!Array.isArray(overlays)) {
        return null;
    }

    for (const overlay of overlays) {
        const duration =
            extractBadgeText(
                overlay?.thumbnailBottomOverlayViewModel?.badges,
            ) ||
            extractBadgeText(
                overlay?.thumbnailOverlayBadgeViewModel?.thumbnailBadges,
            ) ||
            getTextContent(overlay?.thumbnailOverlayTimeStatusRenderer?.text) ||
            getTextContent(overlay?.thumbnailOverlayBadgeViewModel?.text) ||
            getTextContent(overlay?.thumbnailBadgeViewModel?.text);

        if (isDurationText(duration)) {
            return duration;
        }
    }

    return null;
}

function applyMetadataText(data, text) {
    const normalized = normalizeText(text);
    if (!normalized) {
        return;
    }

    if (!data.viewCount && isViewCountText(normalized)) {
        data.viewCount = normalized;
        return;
    }

    if (!data.publishTime && isPublishTimeText(normalized)) {
        data.publishTime = normalized;
        return;
    }

    if (!data.channelName) {
        data.channelName = normalized;
    }
}

function extractVideoIdFromEndpoint(endpoint) {
    if (endpoint?.watchEndpoint?.videoId) {
        return endpoint.watchEndpoint.videoId;
    }

    if (endpoint?.reelWatchEndpoint?.videoId) {
        return endpoint.reelWatchEndpoint.videoId;
    }

    const url = endpoint?.commandMetadata?.webCommandMetadata?.url;
    if (!url) {
        return null;
    }

    try {
        return new URL(url, window.location.origin).searchParams.get("v");
    } catch (error) {
        console.debug("[Filter] Failed to parse endpoint URL:", error);
        return null;
    }
}

function mergeVideoData(...sources) {
    const merged = {
        videoId: null,
        title: null,
        viewCount: null,
        duration: null,
        publishTime: null,
        channelName: null,
    };

    for (const source of sources) {
        if (!source) {
            continue;
        }

        Object.keys(merged).forEach((key) => {
            if (source[key] != null && source[key] !== "") {
                merged[key] = source[key];
            }
        });
    }

    return merged;
}

function extractClassicRendererData(renderer) {
    const data = {
        videoId:
            renderer.videoId ||
            renderer.playlistVideoRenderer?.videoId ||
            extractVideoIdFromEndpoint(renderer.navigationEndpoint) ||
            null,
        title:
            getTextContent(renderer.title) ||
            getTextContent(renderer.headline) ||
            getTextContent(renderer.shortBylineText),
        viewCount:
            getTextContent(renderer.viewCountText) ||
            getTextContent(renderer.shortViewCountText),
        duration:
            getTextContent(renderer.lengthText) ||
            extractDurationFromOverlays(renderer.thumbnailOverlays),
        publishTime: getTextContent(renderer.publishedTimeText),
        channelName:
            getTextContent(renderer.ownerText) ||
            getTextContent(renderer.longBylineText) ||
            getTextContent(renderer.shortBylineText),
    };

    return data;
}

function extractLockupData(lockup) {
    const data = {
        videoId: lockup.contentId || null,
        title: getTextContent(lockup.metadata?.lockupMetadataViewModel?.title),
        viewCount: null,
        duration: extractDurationFromOverlays(
            lockup.contentImage?.thumbnailViewModel?.overlays,
        ),
        publishTime: null,
        channelName: null,
    };

    const metadataRows =
        lockup.metadata?.lockupMetadataViewModel?.metadata
            ?.contentMetadataViewModel?.metadataRows || [];

    for (const row of metadataRows) {
        for (const part of row.metadataParts || []) {
            applyMetadataText(data, getTextContent(part?.text));
        }
    }

    return data;
}

function unwrapRenderer(renderer) {
    if (!renderer || typeof renderer !== "object") {
        return null;
    }

    if (renderer.richItemRenderer) {
        return renderer.richItemRenderer.content || renderer.richItemRenderer;
    }

    if (renderer.videoRenderer) {
        return renderer.videoRenderer;
    }

    if (renderer.gridVideoRenderer) {
        return renderer.gridVideoRenderer;
    }

    if (renderer.compactVideoRenderer) {
        return renderer.compactVideoRenderer;
    }

    if (renderer.content) {
        return renderer.content;
    }

    return renderer;
}

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
        const unwrappedRenderer = unwrapRenderer(renderer);
        if (!unwrappedRenderer) {
            return data;
        }

        if (unwrappedRenderer.lockupViewModel) {
            return {
                ...data,
                ...extractLockupData(unwrappedRenderer.lockupViewModel),
            };
        }

        return {
            ...data,
            ...extractClassicRendererData(unwrappedRenderer),
        };
    } catch (error) {
        console.warn("[Filter] Error extracting from renderer:", error);
        return data;
    }
}

function getElementRenderer(element) {
    const elementData =
        element?.data ||
        element?.__data ||
        element?.__dataHost?.data ||
        element?.__dataHost?.__data;

    return unwrapRenderer(elementData);
}

function getVideoIdFromElement(element) {
    const explicitVideoId = element
        ?.querySelector("[data-video-id]")
        ?.getAttribute("data-video-id");
    if (explicitVideoId) {
        return explicitVideoId;
    }

    const href = element
        ?.querySelector(
            "a#thumbnail, a#video-title, a#video-title-link, a[href*='/watch']",
        )
        ?.getAttribute("href");

    if (!href) {
        return null;
    }

    try {
        const url = new URL(href, window.location.origin);
        return url.searchParams.get("v");
    } catch (error) {
        console.debug("[Filter] Failed to parse video URL:", error);
        return null;
    }
}

/**
 * Extract video data from ytInitialData (YouTube's internal data structure).
 */
function extractFromYTInitialData() {
    try {
        const ytInitialData = window.ytInitialData;
        if (!ytInitialData) {
            console.log("[Filter] ytInitialData not available yet");
            return null;
        }

        if (ytInitialData === cachedInitialData && cachedVideoDataMap) {
            return cachedVideoDataMap;
        }

        const videoDataMap = new Map();

        function traverseData(obj) {
            if (!obj || typeof obj !== "object") {
                return;
            }

            if (
                obj.richItemRenderer ||
                obj.videoRenderer ||
                obj.gridVideoRenderer ||
                obj.compactVideoRenderer ||
                obj.lockupViewModel
            ) {
                const videoData = extractVideoFromRenderer(obj);
                if (videoData.videoId) {
                    videoDataMap.set(videoData.videoId, videoData);
                }
            }

            if (Array.isArray(obj)) {
                for (const item of obj) {
                    traverseData(item);
                }
                return;
            }

            Object.keys(obj).forEach((key) => {
                traverseData(obj[key]);
            });
        }

        traverseData(ytInitialData);
        cachedInitialData = ytInitialData;
        cachedVideoDataMap = videoDataMap;
        return videoDataMap;
    } catch (error) {
        console.warn("[Filter] Error extracting from ytInitialData:", error);
        return null;
    }
}

/**
 * Get video data for a DOM element by preferring live Polymer data and falling
 * back to ytInitialData matching.
 */
function getVideoDataForElement(element) {
    const renderer = getElementRenderer(element);
    const directData = renderer ? extractVideoFromRenderer(renderer) : null;

    const dataMap = extractFromYTInitialData();
    if (!dataMap) {
        return directData;
    }

    const videoId = getVideoIdFromElement(element);
    if (videoId && dataMap.has(videoId)) {
        return mergeVideoData(dataMap.get(videoId), directData);
    }

    const titleText = normalizeText(
        element.querySelector("#video-title, a#video-title-link")?.textContent,
    );
    if (titleText) {
        for (const data of dataMap.values()) {
            if (data.title === titleText) {
                return mergeVideoData(data, directData);
            }
        }
    }

    return directData;
}

if (typeof window !== "undefined") {
    window.YouTubeDataExtractor = {
        extractFromYTInitialData,
        extractVideoFromRenderer,
        getVideoDataForElement,
        getVideoIdFromElement,
    };
}
