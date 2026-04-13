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

	const cleaned = text
		.replace(/views?/i, "")
		.replace(/,/g, "")
		.trim();
	const match = cleaned.match(/([\d.]+)\s*([KMB]?)/i);

	if (match) {
		let number = parseFloat(match[1]);
		const suffix = match[2].toUpperCase();
		if (suffix === "K") number *= 1000;
		else if (suffix === "M") number *= 1000000;
		else if (suffix === "B") number *= 1000000000;
		return number;
	}

	const directNumber = parseFloat(cleaned);
	return Number.isNaN(directNumber) ? 0 : directNumber;
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
		if (parts.some((part) => Number.isNaN(part))) return 0;

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

	if (hourMatch) totalSeconds += parseInt(hourMatch[1], 10) * 3600;
	if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
	if (secMatch) totalSeconds += parseInt(secMatch[1], 10);

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
	return match ? parseInt(match[1], 10) : 0;
}

const HAN_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const LATIN_LETTER_PATTERN = /[A-Za-z]/g;
const ENGLISH_WORD_PATTERN = /\b[A-Za-z]{2,}\b/g;
const VIEW_COUNT_PATTERN = /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*views?/i;
const NO_VIEWS_PATTERN = /No views?/i;
const PUBLISH_TIME_PATTERN =
	/(streamed\s+)?\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i;
const DURATION_TEXT_PATTERN = /^(?:\d+:)?\d{1,2}:\d{2}$/;
const CHANNEL_LINK_SELECTOR = "a[href^='/@'], a[href^='/channel/']";
const TITLE_SELECTORS = [
	"#video-title",
	"a#video-title-link",
	"#video-title-link",
	"h3[title]",
	".ytLockupMetadataViewModelHeadingReset",
	"h3 a",
	"yt-formatted-string#video-title",
	"[aria-label]",
];
const DURATION_SELECTORS = [
	"badge-shape .yt-badge-shape__text",
	"yt-thumbnail-bottom-overlay-view-model badge-shape .yt-badge-shape__text",
	".yt-badge-shape__text",
	"yt-thumbnail-badge-view-model",
	"ytd-thumbnail-overlay-time-status-renderer span",
	"span.ytd-thumbnail-overlay-time-status-renderer",
	"#time-status span",
	".badge-style-type-simple",
];
const METADATA_TEXT_SELECTORS = [
	"#metadata-line",
	"ytd-video-meta-block",
	"#channel-info",
];
const VIDEO_CARD_NODE_NAMES = new Set([
	"YTD-VIDEO-RENDERER",
	"YTD-RICH-ITEM-RENDERER",
	"YTD-GRID-VIDEO-RENDERER",
	"YT-LOCKUP-VIEW-MODEL",
]);
const SUBSCRIPTIONS_PAGE_PATH = "/feed/channels";
const ENGLISH_ONLY_LEGACY_MODE = "enOnly";

/**
 * Normalizes extracted UI text for pattern matching.
 * @param {string | null | undefined} text
 * @returns {string | null}
 */
function normalizeText(text) {
	if (typeof text !== "string") {
		return null;
	}

	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized || null;
}

/**
 * Returns the first regex match from text as a normalized string.
 * @param {string | null | undefined} text
 * @param {RegExp} pattern
 * @returns {string | null}
 */
function extractMatch(text, pattern) {
	const normalized = normalizeText(text);
	if (!normalized) {
		return null;
	}

	const match = normalized.match(pattern);
	return match ? normalizeText(match[0]) : null;
}

function detectTitleLanguage(title) {
	const normalizedTitle = normalizeText(title);
	if (!normalizedTitle) {
		return "unknown";
	}

	const hanCharacterCount =
		normalizedTitle.match(HAN_CHARACTER_PATTERN)?.length || 0;
	const latinLetterCount =
		normalizedTitle.match(LATIN_LETTER_PATTERN)?.length || 0;
	const englishWordCount =
		normalizedTitle.match(ENGLISH_WORD_PATTERN)?.length || 0;

	if (hanCharacterCount === 0 && latinLetterCount === 0) {
		return "unknown";
	}

	if (hanCharacterCount >= 2) {
		return "zh";
	}

	if (englishWordCount >= 1 || latinLetterCount >= 4) {
		return "en";
	}

	return "unknown";
}

function isEnglishOnlyEnabled(settings) {
	if (typeof settings.englishOnlyTitles === "boolean") {
		return settings.englishOnlyTitles;
	}

	return settings.languageFilterMode === ENGLISH_ONLY_LEGACY_MODE;
}

function normalizeChannelPath(path) {
	if (!path || typeof path !== "string") {
		return null;
	}

	try {
		const url = new URL(path, window.location.origin);
		const normalizedPath = url.pathname.replace(/\/+$/, "");
		if (
			normalizedPath.startsWith("/@") ||
			normalizedPath.startsWith("/channel/")
		) {
			return normalizedPath;
		}
	} catch {
		return null;
	}

	return null;
}

function getChannelIdFromPath(path) {
	const normalizedPath = normalizeChannelPath(path);
	if (!normalizedPath?.startsWith("/channel/")) {
		return null;
	}

	return normalizedPath.split("/channel/")[1] || null;
}

function createEmptySubscriptionLookup() {
	return {
		ids: new Set(),
		paths: new Set(),
		names: new Set(),
	};
}

function buildSubscriptionLookup(channels) {
	const lookup = createEmptySubscriptionLookup();

	for (const channel of channels || []) {
		if (typeof channel === "string") {
			const normalizedName = normalizeText(channel)?.toLowerCase();
			if (normalizedName) {
				lookup.names.add(normalizedName);
			}
			continue;
		}

		const channelId =
			typeof channel?.channelId === "string" &&
			channel.channelId.startsWith("UC")
				? channel.channelId
				: getChannelIdFromPath(channel?.channelPath);
		const channelPath = normalizeChannelPath(channel?.channelPath);
		const channelName = normalizeText(channel?.name)?.toLowerCase();

		if (channelId) {
			lookup.ids.add(channelId);
		}
		if (channelPath) {
			lookup.paths.add(channelPath.toLowerCase());
		}
		if (channelName) {
			lookup.names.add(channelName);
		}
	}

	return lookup;
}

function isSubscribedChannel(videoData) {
	const channelId = getNormalizedChannelId(videoData);
	const channelPath = normalizeChannelPath(
		videoData.channelPath,
	)?.toLowerCase();
	const channelName = normalizeText(videoData.channelName)?.toLowerCase();

	return Boolean(
		(channelId && subscribedChannels.ids.has(channelId)) ||
			(channelPath && subscribedChannels.paths.has(channelPath)) ||
			(channelName && subscribedChannels.names.has(channelName)),
	);
}

const VIDEO_CARD_SELECTOR =
	"ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, yt-lockup-view-model";
const MAX_METADATA_RETRY_COUNT = 6;
const METADATA_RETRY_DELAY_MS = 2000;
const SETTLING_RESCAN_DELAYS_MS = [1500, 4000, 8000];

/**
 * Returns whether hard hide filters are active for the current page type.
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {boolean}
 */
function hasActiveHideFilters(settings) {
	return Boolean(
		settings.viewsFilterEnabled ||
			settings.durationFilterEnabled ||
			settings.keywordFilterEnabled ||
			settings.ageFilterEnabled ||
			isEnglishOnlyEnabled(settings),
	);
}

/**
 * Marks a card as processed.
 * @param {HTMLElement} videoElement
 */
function markVideoCardProcessed(videoElement) {
	videoElement.setAttribute("data-filter-processed", "true");
}

/**
 * Clears transient filter markers so a future run can do a full rescan.
 * @param {ParentNode} [root=document]
 */
function resetProcessedVideoCards(root = document) {
	const videoCards = root.querySelectorAll?.(VIDEO_CARD_SELECTOR) || [];
	for (const videoElement of videoCards) {
		videoElement.removeAttribute("data-filter-processed");
		videoElement.removeAttribute("data-filtered");
		videoElement.removeAttribute("data-filter-reason");
		videoElement.removeAttribute("data-subscribed-channel");
		delete videoElement.dataset.titleLanguage;
		delete videoElement.dataset.filterRetryCount;
		videoElement.style.display = "";
		videoElement.style.opacity = "";
		videoElement.style.pointerEvents = "";
		videoElement.style.boxShadow = "";
		videoElement.style.borderRadius = "";
		videoElement.style.background = "";
	}
}

function getNormalizedChannelId(videoData) {
	return typeof videoData.channelId === "string" &&
		videoData.channelId.startsWith("UC")
		? videoData.channelId
		: getChannelIdFromPath(videoData.channelPath);
}

function getContainingVideoCard(node) {
	if (!(node instanceof Node)) {
		return null;
	}

	if (node.nodeType === Node.ELEMENT_NODE) {
		return node.matches?.(VIDEO_CARD_SELECTOR)
			? node
			: node.closest?.(VIDEO_CARD_SELECTOR) || null;
	}

	return node.parentElement?.closest?.(VIDEO_CARD_SELECTOR) || null;
}

function getFirstMatchingElement(root, selectors) {
	for (const selector of selectors) {
		const element = root.querySelector(selector);
		if (element) {
			return element;
		}
	}

	return null;
}

function getMetadataText(videoElement) {
	return normalizeText(
		METADATA_TEXT_SELECTORS.map(
			(selector) => videoElement.querySelector(selector)?.innerText,
		)
			.filter(Boolean)
			.join(" "),
	);
}

function extractDurationFromElement(videoElement) {
	for (const selector of DURATION_SELECTORS) {
		const text = normalizeText(
			videoElement.querySelector(selector)?.textContent,
		);
		if (text && DURATION_TEXT_PATTERN.test(text)) {
			return text;
		}
	}

	const thumbnailLink = videoElement.querySelector(
		"a#thumbnail, a[href*='/watch']",
	);
	const thumbnailText = normalizeText(thumbnailLink?.innerText);
	return thumbnailText?.match(DURATION_TEXT_PATTERN)?.[0] || null;
}

function fillMetadataFromText(videoData, metadataText) {
	if (!videoData.viewCount) {
		videoData.viewCount =
			extractMatch(metadataText, VIEW_COUNT_PATTERN) ||
			extractMatch(metadataText, NO_VIEWS_PATTERN);
	}

	if (!videoData.publishTime) {
		videoData.publishTime = extractMatch(metadataText, PUBLISH_TIME_PATTERN);
	}
}

function fillMetadataFromFullText(videoData, fullText) {
	if (!fullText) {
		return;
	}

	if (!videoData.viewCount) {
		const viewMatch = fullText.match(VIEW_COUNT_PATTERN);
		if (viewMatch) {
			videoData.viewCount = normalizeText(viewMatch[0]);
		} else if (fullText.match(NO_VIEWS_PATTERN)) {
			videoData.viewCount = "No views";
		}
	}

	if (!videoData.publishTime) {
		const timeMatch = fullText.match(PUBLISH_TIME_PATTERN);
		if (timeMatch) {
			videoData.publishTime = normalizeText(timeMatch[0]);
		}
	}
}

function fillChannelInfoFromLink(videoElement, videoData) {
	const channelLink = videoElement.querySelector(CHANNEL_LINK_SELECTOR);
	if (!channelLink) {
		return;
	}

	if (!videoData.channelPath) {
		videoData.channelPath = normalizeChannelPath(
			channelLink.getAttribute("href"),
		);
	}
	if (!videoData.channelId) {
		videoData.channelId = getChannelIdFromPath(videoData.channelPath);
	}
	if (!videoData.channelName) {
		videoData.channelName =
			normalizeText(channelLink.textContent) ||
			normalizeText(channelLink.getAttribute("title"));
	}
}

function fillLockupChannelNameFromText(videoElement, videoData) {
	if (
		videoData.channelName ||
		videoElement.tagName !== "YT-LOCKUP-VIEW-MODEL"
	) {
		return;
	}

	const lines = (videoElement.innerText || "")
		.split("\n")
		.map((line) => normalizeText(line))
		.filter(Boolean);
	if (lines.length >= 3) {
		videoData.channelName = lines[2];
	}
}

function queueVideoCardForReprocessing(videoElement) {
	if (!videoElement) {
		return;
	}

	videoElement.removeAttribute("data-filter-processed");
	delete videoElement.dataset.filterRetryCount;
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
	const structuredData =
		window.YouTubeDataExtractor?.getVideoDataForElement(videoElement) || {};
	const data = {
		title: structuredData.title || null,
		titleLanguage: null,
		viewCount: structuredData.viewCount || null,
		duration: structuredData.duration || null,
		publishTime: structuredData.publishTime || null,
		videoId: structuredData.videoId || null,
		channelName: structuredData.channelName || null,
		channelId: structuredData.channelId || null,
		channelPath: structuredData.channelPath || null,
	};

	try {
		if (!data.videoId) {
			data.videoId =
				window.YouTubeDataExtractor?.getVideoIdFromElement?.(videoElement) ||
				null;
		}

		if (!data.title) {
			const titleElement = getFirstMatchingElement(
				videoElement,
				TITLE_SELECTORS,
			);

			data.title =
				normalizeText(titleElement?.textContent) ||
				normalizeText(titleElement?.getAttribute("title")) ||
				normalizeText(titleElement?.getAttribute("aria-label"));
		}

		if (!data.duration) {
			data.duration = extractDurationFromElement(videoElement);
		}

		fillMetadataFromText(data, getMetadataText(videoElement));
		fillMetadataFromFullText(data, normalizeText(videoElement.innerText));
		fillChannelInfoFromLink(videoElement, data);
		fillLockupChannelNameFromText(videoElement, data);
	} catch (error) {
		console.warn("[Filter] Error extracting video data:", error);
	}

	data.titleLanguage = detectTitleLanguage(data.title);

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

	// Missing counts are common on some Home cards and ad-like items.
	// Don't treat them as low-view videos; only filter when we have a real count.
	if (!videoData.viewCount) {
		return { shouldFilter: false };
	}

	// Check if views are below threshold
	const viewCount = parseViewCount(videoData.viewCount);
	if (viewCount < settings.minViews) {
		return {
			shouldFilter: true,
			reason: "views",
			details: `Low views: ${videoData.viewCount} (${viewCount})`,
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
	const minOk =
		!settings.minDuration || durationSeconds >= settings.minDuration;
	const maxOk =
		!settings.maxDuration || durationSeconds <= settings.maxDuration;

	if (!minOk || !maxOk) {
		return {
			shouldFilter: true,
			reason: "duration",
			details: `Duration: ${videoData.duration} (${durationSeconds}s) outside range [${settings.minDuration || 0}, ${settings.maxDuration || "∞"}]`,
		};
	}

	return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by age
 * @returns {Object} { shouldFilter: boolean, reason: string }
 */
function checkAgeFilter(videoData, settings) {
	const maxAgeYears = settings.maxAgeYears ?? settings.maxAge ?? 0;

	if (!settings.ageFilterEnabled || maxAgeYears <= 0) {
		return { shouldFilter: false };
	}

	if (!videoData.publishTime) {
		return { shouldFilter: false }; // Can't filter without age
	}

	const videoAge = parseVideoAge(videoData.publishTime);
	if (videoAge >= maxAgeYears) {
		return {
			shouldFilter: true,
			reason: "age",
			details: `Too old: ${videoData.publishTime} (${videoAge} years)`,
		};
	}

	return { shouldFilter: false };
}

/**
 * Checks if video should be filtered by keywords
 * @returns {Object} { shouldFilter: boolean, reason: string }
 */
function checkKeywordsFilter(videoData, settings) {
	const bannedKeywords = settings.keywords || settings.bannedKeywords || [];

	if (!settings.keywordFilterEnabled || bannedKeywords.length === 0) {
		return { shouldFilter: false };
	}

	if (!videoData.title) {
		return { shouldFilter: false }; // Can't filter without title
	}

	const titleLower = videoData.title.toLowerCase();

	for (const keyword of bannedKeywords) {
		if (keyword && titleLower.includes(keyword.toLowerCase())) {
			return {
				shouldFilter: true,
				reason: "keyword",
				details: `Banned keyword: "${keyword}"`,
			};
		}
	}

	return { shouldFilter: false };
}

function checkLanguageFilter(videoData, settings) {
	if (!isEnglishOnlyEnabled(settings)) {
		return { shouldFilter: false };
	}

	if (!videoData.titleLanguage || videoData.titleLanguage === "unknown") {
		return {
			shouldFilter: true,
			reason: "language",
			details: "Title language: unknown (English only mode)",
		};
	}

	if (videoData.titleLanguage !== "en") {
		return {
			shouldFilter: true,
			reason: "language",
			details: `Title language: ${videoData.titleLanguage} (English only mode)`,
		};
	}

	return { shouldFilter: false };
}

function hasIncompleteMetadata(videoData, settings) {
	const maxAgeYears = settings.maxAgeYears ?? settings.maxAge ?? 0;
	const bannedKeywords = settings.keywords || settings.bannedKeywords || [];

	return Boolean(
		(settings.viewsFilterEnabled &&
			settings.minViews > 0 &&
			!videoData.viewCount) ||
			(settings.durationFilterEnabled &&
				(settings.minDuration || settings.maxDuration) &&
				!videoData.duration) ||
			(settings.ageFilterEnabled &&
				maxAgeYears > 0 &&
				!videoData.publishTime) ||
			(settings.keywordFilterEnabled &&
				bannedKeywords.length > 0 &&
				!videoData.title) ||
			(isEnglishOnlyEnabled(settings) && !videoData.title),
	);
}

function getTriggeredFilter(videoData, settings) {
	return [
		checkViewsFilter(videoData, settings),
		checkDurationFilter(videoData, settings),
		checkAgeFilter(videoData, settings),
		checkLanguageFilter(videoData, settings),
		checkKeywordsFilter(videoData, settings),
	].find((filterResult) => filterResult.shouldFilter);
}

function showVideoCard(videoElement) {
	videoElement.style.display = "";
	videoElement.style.opacity = "";
	videoElement.style.pointerEvents = "";
}

function hideVideoCard(videoElement, reason) {
	videoElement.style.display = "none";
	videoElement.style.opacity = "";
	videoElement.style.pointerEvents = "";
	videoElement.setAttribute("data-filtered", "true");
	videoElement.setAttribute("data-filter-reason", reason);
}

function updateFilterStats(currentStats) {
	filterStats.views += currentStats.views;
	filterStats.keywords += currentStats.keywords;
	filterStats.duration += currentStats.duration;
	filterStats.age += currentStats.age;
	filterStats.language += currentStats.language;
	filterStats.total += currentStats.total;

	chrome.storage.local.set({ filterStats });
}

// ============================================================================
// SECTION 4: FILTER APPLICATION
// Main filtering orchestration and DOM manipulation
// ============================================================================

// Global state
let filterSettings = DEFAULT_SETTINGS;
const filterStats = {
	views: 0,
	keywords: 0,
	duration: 0,
	age: 0,
	language: 0,
	total: 0,
};
let subscribedChannels = createEmptySubscriptionLookup();
let metadataRetryTimeout = null;
let settlingRescanTimeouts = [];

function clearSettlingRescans() {
	for (const timeoutId of settlingRescanTimeouts) {
		clearTimeout(timeoutId);
	}

	settlingRescanTimeouts = [];
}

function scheduleSettlingRescans(reason) {
	clearSettlingRescans();

	for (const delayMs of SETTLING_RESCAN_DELAYS_MS) {
		const timeoutId = setTimeout(() => {
			console.log(
				`[Filter] Running settling rescan after ${delayMs}ms (${reason})...`,
			);
			runAllFilters(true);
		}, delayMs);
		settlingRescanTimeouts.push(timeoutId);
	}
}

function reloadSubscriptions(channels) {
	subscribedChannels = buildSubscriptionLookup(channels || []);
}

function applySubscribedChannelState(videoElement, isSubscribed) {
	if (isSubscribed) {
		videoElement.setAttribute("data-subscribed-channel", "true");
	} else {
		videoElement.removeAttribute("data-subscribed-channel");
	}
}

function applyTitleLanguageState(videoElement, titleLanguage) {
	if (titleLanguage && titleLanguage !== "unknown") {
		videoElement.dataset.titleLanguage = titleLanguage;
		return;
	}

	delete videoElement.dataset.titleLanguage;
}

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
function runAllFilters(forceFullScan = false) {
	console.log("[Filter] Running all filters...");
	const startedAt = performance.now();

	if (!hasActiveHideFilters(filterSettings)) {
		console.log("[Filter] All filters disabled, skipping");
		return;
	}

	// Reset current run stats
	const currentStats = {
		views: 0,
		keywords: 0,
		duration: 0,
		age: 0,
		language: 0,
		total: 0,
	};
	let newFilters = false;
	let incompleteCards = 0;

	// Find all video card elements
	const videoCards = Array.from(document.querySelectorAll(VIDEO_CARD_SELECTOR));
	const targetCards = videoCards.filter(
		(videoElement) =>
			forceFullScan || !videoElement.hasAttribute("data-filter-processed"),
	);

	console.log(
		`[Filter] Found ${videoCards.length} video cards (${targetCards.length} pending)`,
	);
	console.log(`[Filter] Current settings:`, filterSettings);

	const processedCount = targetCards.length;
	let alreadyFilteredCount = 0;

	targetCards.forEach((videoElement) => {
		const wasFiltered = videoElement.hasAttribute("data-filtered");

		const videoData = extractVideoData(videoElement);
		const title = videoData.title || "Unknown title";
		const isSubscribed = isSubscribedChannel(videoData);
		applySubscribedChannelState(videoElement, isSubscribed);
		applyTitleLanguageState(videoElement, videoData.titleLanguage);

		const triggeredFilter = getTriggeredFilter(videoData, filterSettings);
		const shouldPreserveSubscribedVideo =
			isSubscribed && filterSettings.preserveSubscribedChannels;
		const retryCount = Number(videoElement.dataset.filterRetryCount || 0);
		const shouldRetryForMetadata =
			!triggeredFilter &&
			hasIncompleteMetadata(videoData, filterSettings) &&
			retryCount < MAX_METADATA_RETRY_COUNT;

		if (shouldRetryForMetadata) {
			videoElement.dataset.filterRetryCount = String(retryCount + 1);
			showVideoCard(videoElement);
			incompleteCards += 1;
			return;
		}

		delete videoElement.dataset.filterRetryCount;

		if (triggeredFilter && !shouldPreserveSubscribedVideo) {
			hideVideoCard(videoElement, triggeredFilter.reason);
			markVideoCardProcessed(videoElement);

			currentStats[triggeredFilter.reason]++;
			currentStats.total++;
			newFilters = true;

			storeFilteredVideo(title, triggeredFilter.details);
			console.log(
				`[Filter] ✓ ${triggeredFilter.reason}: Hidden "${title}" - ${triggeredFilter.details}`,
			);
			if (wasFiltered) {
				alreadyFilteredCount++;
			}
			return;
		}

		if (wasFiltered) {
			videoElement.removeAttribute("data-filtered");
			videoElement.removeAttribute("data-filter-reason");
		}

		showVideoCard(videoElement);
		markVideoCardProcessed(videoElement);
	});

	if (newFilters) {
		updateFilterStats(currentStats);
		console.log(
			`[Filter] Filtered ${currentStats.total} videos this run (${processedCount} new, ${alreadyFilteredCount} already filtered)`,
		);
	}

	console.log(
		`[Filter] Filtering complete in ${Math.round(performance.now() - startedAt)}ms. Total stats:`,
		filterStats,
	);

	if (incompleteCards > 0) {
		clearTimeout(metadataRetryTimeout);
		metadataRetryTimeout = setTimeout(() => {
			console.log(
				`[Filter] Retrying ${incompleteCards} card(s) with incomplete metadata...`,
			);
			runAllFilters();
		}, METADATA_RETRY_DELAY_MS);
	}
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

	if (location.pathname.includes(SUBSCRIPTIONS_PAGE_PATH)) {
		console.log(
			"[Filter] Skipping filters on subscriptions page - subscription extractor only",
		);
		return;
	}

	// Load settings and start filtering
	chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
		filterSettings = settings;
		chrome.storage.local.get(["youtube_subscriptions"], (localData) => {
			reloadSubscriptions(localData.youtube_subscriptions?.channels);
			console.log("[Filter] Settings loaded:", filterSettings);

			resetProcessedVideoCards();

			// Run initial filter
			setTimeout(() => runAllFilters(true), 1000); // Give YouTube time to render
			scheduleSettlingRescans("initial load");

			// Set up MutationObserver for dynamically loaded content
			let filterTimeout = null;
			const observer = new MutationObserver((mutations) => {
				const hasNewContent = mutations.some((mutation) => {
					if (mutation.type === "characterData") {
						const videoCard = getContainingVideoCard(mutation.target);
						if (videoCard) {
							queueVideoCardForReprocessing(videoCard);
							return true;
						}

						return false;
					}

					Array.from(mutation.addedNodes).forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							if (node.matches?.(VIDEO_CARD_SELECTOR)) {
								queueVideoCardForReprocessing(node);
								return;
							}

							node
								.querySelectorAll?.(VIDEO_CARD_SELECTOR)
								.forEach((videoCard) => {
									queueVideoCardForReprocessing(videoCard);
								});
						}
					});

					return Array.from(mutation.addedNodes).some(
						(node) =>
							VIDEO_CARD_NODE_NAMES.has(node.nodeName) ||
							node.querySelector?.(VIDEO_CARD_SELECTOR),
					);
				});

				if (hasNewContent) {
					// Debounce: clear existing timeout and set new one
					clearTimeout(filterTimeout);
					filterTimeout = setTimeout(() => {
						console.log("[Filter] New videos detected, re-running filters...");
						runAllFilters();
						scheduleSettlingRescans("content update");
					}, 800); // Batch multiple additions
				}
			});

			const contentRoot = document.querySelector("ytd-app") || document.body;
			if (contentRoot) {
				observer.observe(contentRoot, {
					childList: true,
					subtree: true,
					characterData: true,
				});
				console.log("[Filter] Observer started");
			} else {
				console.log("[Filter] Warning: Could not find content root");
			}
		});
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName === "local" && changes.youtube_subscriptions) {
			reloadSubscriptions(changes.youtube_subscriptions.newValue?.channels);
			console.log("[Filter] Subscription list changed, re-running filters...");
			resetProcessedVideoCards();
			runAllFilters(true);
			scheduleSettlingRescans("subscription update");
			return;
		}

		if (areaName !== "sync") {
			return;
		}

		if (!Object.keys(changes).some((key) => key in DEFAULT_SETTINGS)) {
			return;
		}

		chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
			filterSettings = settings;
			console.log("[Filter] Settings changed, re-running filters...");
			resetProcessedVideoCards();
			runAllFilters(true);
			scheduleSettlingRescans("settings change");
		});
	});

	// Re-run filters on YouTube navigation (SPA)
	let lastUrl = location.href;
	const navigationObserverTarget =
		document.querySelector("title") ||
		document.head ||
		document.documentElement;
	if (navigationObserverTarget) {
		new MutationObserver(() => {
			const currentUrl = location.href;
			if (currentUrl !== lastUrl) {
				lastUrl = currentUrl;
				console.log("[Filter] Page navigation detected, re-running filters...");
				resetProcessedVideoCards();
				clearSettlingRescans();
				setTimeout(() => runAllFilters(true), 1500);
				scheduleSettlingRescans("navigation");
			}
		}).observe(navigationObserverTarget, {
			subtree: true,
			characterData: true,
			childList: true,
		});
	}

	// Backup: Also re-run filters on scroll (for infinite scroll)
	let scrollTimeout = null;
	let lastVideoCount = 0;
	window.addEventListener(
		"scroll",
		() => {
			clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => {
				const currentVideoCount =
					document.querySelectorAll(VIDEO_CARD_SELECTOR).length;

				if (currentVideoCount > lastVideoCount) {
					console.log(
						`[Filter] Scroll detected new videos (${lastVideoCount} → ${currentVideoCount}), re-running filters...`,
					);
					lastVideoCount = currentVideoCount;
					runAllFilters();
					scheduleSettlingRescans("scroll growth");
				}
			}, 1000); // Wait 1s after scroll stops
		},
		{ passive: true },
	);
}

// Start the extension
init();
