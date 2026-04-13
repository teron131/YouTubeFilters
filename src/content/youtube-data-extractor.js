/**
 * YouTube Data Extractor
 * Content scripts cannot reliably read YouTube's page-world globals, so this
 * helper only exposes safe DOM-based helpers for the content script.
 */

const DURATION_BADGE_PATTERN = /^(?:\d+:)?\d{1,2}:\d{2}$/;

function normalizeText(value) {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized || null;
}

function firstNonEmpty(...values) {
	for (const value of values) {
		const normalized =
			typeof value === "string" ? normalizeText(value) : textFromNode(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

function textFromNode(value) {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return normalizeText(value);
	}

	if (Array.isArray(value)) {
		const joined = value
			.map((item) => textFromNode(item))
			.filter(Boolean)
			.join(" ");
		return normalizeText(joined);
	}

	if (typeof value !== "object") {
		return null;
	}

	return firstNonEmpty(
		value.simpleText,
		value.content,
		value.text,
		value.label,
		Array.isArray(value.runs)
			? value.runs.map((run) => textFromNode(run)).join(" ")
			: null,
	);
}

function flattenMetadataTexts(metadataRows) {
	if (!Array.isArray(metadataRows)) {
		return [];
	}

	return metadataRows
		.flatMap((row) => row?.metadataParts || [])
		.map((part) => textFromNode(part?.text || part))
		.filter(Boolean);
}

function findMetadataText(metadataTexts, pattern) {
	return metadataTexts.find((text) => pattern.test(text)) || null;
}

function normalizeDurationText(value) {
	const text = textFromNode(value);
	return text && DURATION_BADGE_PATTERN.test(text) ? text : null;
}

function extractHomeDuration(lockupViewModel) {
	const overlays =
		lockupViewModel?.contentImage?.thumbnailViewModel?.overlays || [];

	for (const overlay of overlays) {
		const badges =
			overlay?.thumbnailBottomOverlayViewModel?.badges ||
			overlay?.thumbnailOverlayBadgeViewModel?.badges ||
			[];

		for (const badge of badges) {
			const duration = normalizeDurationText(
				badge?.thumbnailBadgeViewModel?.text ||
					badge?.thumbnailBadgeViewModel?.label,
			);
			if (duration) {
				return duration;
			}
		}
	}

	return null;
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
		const watchVideoId = url.searchParams.get("v");
		if (watchVideoId) {
			return watchVideoId;
		}

		const shortsMatch = url.pathname.match(/^\/shorts\/([^/?]+)/);
		return shortsMatch?.[1] || null;
	} catch {
		return null;
	}
}

function extractFromYTInitialData() {
	return null;
}

function getRendererDataCandidates(element) {
	return [
		element?.data,
		element?.__data?.data,
		element?.__data?.content,
		element?.__data?.config,
		element?.__dataHost?.data,
		element?.__dataHost?.__data?.data,
		element?.__dataHost?.__data?.content,
	].filter(Boolean);
}

function extractVideoFromRenderer(rendererData) {
	if (!rendererData || typeof rendererData !== "object") {
		return null;
	}

	const searchRenderer =
		rendererData?.videoId ||
		(rendererData?.title &&
			(rendererData?.lengthText ||
				rendererData?.publishedTimeText ||
				rendererData?.viewCountText ||
				rendererData?.shortViewCountText ||
				rendererData?.ownerText ||
				rendererData?.longBylineText))
			? rendererData
			: null;
	if (searchRenderer) {
		return {
			videoId: searchRenderer.videoId || null,
			title: textFromNode(searchRenderer.title),
			duration: normalizeDurationText(searchRenderer.lengthText),
			viewCount: firstNonEmpty(
				textFromNode(searchRenderer.viewCountText),
				textFromNode(searchRenderer.shortViewCountText),
			),
			publishTime: textFromNode(searchRenderer.publishedTimeText),
			channelName: firstNonEmpty(
				textFromNode(searchRenderer.ownerText),
				textFromNode(searchRenderer.longBylineText),
			),
		};
	}

	const lockupViewModel =
		rendererData?.content?.lockupViewModel || rendererData?.lockupViewModel;
	if (!lockupViewModel) {
		return null;
	}

	const metadataRows =
		lockupViewModel?.metadata?.lockupMetadataViewModel?.metadata
			?.contentMetadataViewModel?.metadataRows || [];
	const metadataTexts = flattenMetadataTexts(metadataRows);

	return {
		videoId: lockupViewModel.contentId || null,
		title: textFromNode(
			lockupViewModel?.metadata?.lockupMetadataViewModel?.title,
		),
		duration: extractHomeDuration(lockupViewModel),
		viewCount: findMetadataText(metadataTexts, /views?/i),
		publishTime: findMetadataText(
			metadataTexts,
			/(streamed\s+)?\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i,
		),
		channelName: metadataTexts[0] || null,
	};
}

function getVideoDataForElement(element) {
	if (!element) {
		return null;
	}

	for (const rendererData of getRendererDataCandidates(element)) {
		const extracted = extractVideoFromRenderer(rendererData);
		if (extracted) {
			return {
				...extracted,
				videoId: extracted.videoId || getVideoIdFromElement(element),
			};
		}
	}

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
