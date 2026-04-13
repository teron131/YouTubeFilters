/**
 * YouTube Data Extractor
 * Content scripts cannot reliably read YouTube's page-world globals, so this
 * helper only exposes safe DOM-based helpers for the content script.
 */

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
	} catch {
		return null;
	}
}

function extractFromYTInitialData() {
	return null;
}

function extractVideoFromRenderer() {
	return null;
}

function getVideoDataForElement() {
	return null;
}

if (typeof window !== "undefined") {
	window.YouTubeDataExtractor = {
		extractFromYTInitialData,
		extractVideoFromRenderer,
		getVideoDataForElement,
		getVideoIdFromElement,
	};
}
