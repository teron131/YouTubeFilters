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
	const channelId =
		typeof videoData.channelId === "string" &&
		videoData.channelId.startsWith("UC")
			? videoData.channelId
			: getChannelIdFromPath(videoData.channelPath);
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

/**
 * Sorting has been removed for this extension.
 * @param {typeof DEFAULT_SETTINGS} _settings
 * @returns {boolean}
 */
function isSortEnabled(_settings) {
	return false;
}

/**
 * Filtering applies to supported YouTube pages, including Home.
 * @returns {boolean}
 */
function shouldApplyHideFilters() {
	return true;
}

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
			settings.highlightSubscribedChannels,
	);
}

/**
 * Marks cards as pending so they stay hidden until the next sort pass completes.
 * @param {ParentNode} [root=document]
 */
function stageVideoCardsForSort(root = document) {
	if (!isSortEnabled(filterSettings)) {
		return;
	}

	const videoCards = [];
	if (root.matches?.(VIDEO_CARD_SELECTOR)) {
		videoCards.push(root);
	}
	videoCards.push(...(root.querySelectorAll?.(VIDEO_CARD_SELECTOR) || []));
	for (const videoElement of videoCards) {
		if (
			videoElement.hasAttribute("data-filtered") ||
			videoElement.hasAttribute("data-filter-processed") ||
			videoElement.hasAttribute("data-sort-pending")
		) {
			continue;
		}

		videoElement.setAttribute("data-sort-pending", "true");
		videoElement.style.visibility = "hidden";
	}
}

/**
 * Removes any temporary hiding used while a card is waiting to be sorted.
 * @param {HTMLElement} videoElement
 */
function revealVideoCard(videoElement) {
	videoElement.removeAttribute("data-sort-pending");
	videoElement.style.visibility = "";
}

/**
 * Marks a card as processed and stores its last sort key so later sort passes
 * don't need to re-extract metadata for every existing card.
 * @param {HTMLElement} videoElement
 * @param {ReturnType<typeof extractVideoData>} videoData
 * @param {typeof DEFAULT_SETTINGS} settings
 */
function markVideoCardProcessed(videoElement, videoData, settings) {
	videoElement.setAttribute("data-filter-processed", "true");
	videoElement.dataset.sortValue = String(getSortValue(videoData, settings));
}

/**
 * Clears transient filter/sort markers so a future run can do a full rescan.
 * @param {ParentNode} [root=document]
 */
function resetProcessedVideoCards(root = document) {
	const videoCards = root.querySelectorAll?.(VIDEO_CARD_SELECTOR) || [];
	for (const videoElement of videoCards) {
		videoElement.removeAttribute("data-filter-processed");
		videoElement.removeAttribute("data-filtered");
		videoElement.removeAttribute("data-filter-reason");
		videoElement.removeAttribute("data-subscribed-channel");
		videoElement.removeAttribute("data-sort-pending");
		delete videoElement.dataset.sortValue;
		videoElement.style.display = "";
		videoElement.style.visibility = "";
		videoElement.style.opacity = "";
		videoElement.style.pointerEvents = "";
		videoElement.style.boxShadow = "";
		videoElement.style.borderRadius = "";
		videoElement.style.background = "";
	}
}

/**
 * Computes a sortable numeric value for the current sort mode.
 * @param {ReturnType<typeof extractVideoData>} videoData
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {number}
 */
function getSortValue(videoData, settings) {
	switch (settings.sortMode) {
		case "newestFirst":
			return -parseVideoAge(videoData.publishTime);
		case "shortestFirst":
			return parseDuration(videoData.duration);
		case "longestFirst":
			return -parseDuration(videoData.duration);
		default:
			return -parseViewCount(videoData.viewCount);
	}
}

/**
 * Reorders cards within each parent container using the selected sort mode.
 * @param {HTMLElement[]} videoCards
 * @param {typeof DEFAULT_SETTINGS} settings
 */
function sortVisibleVideoCards(videoCards, settings) {
	if (!isSortEnabled(settings) || videoCards.length < 2) {
		return;
	}

	const groups = new Map();
	videoCards.forEach((videoElement, originalIndex) => {
		if (videoElement.hasAttribute("data-filtered")) {
			return;
		}

		const parent = videoElement.parentElement;
		if (!parent) {
			return;
		}

		if (!groups.has(parent)) {
			groups.set(parent, []);
		}
		groups.get(parent).push({
			element: videoElement,
			originalIndex,
			sortValue: Number(videoElement.dataset.sortValue || 0),
		});
	});

	for (const groupEntries of groups.values()) {
		if (groupEntries.length < 2) {
			continue;
		}

		groupEntries.sort((left, right) => {
			const valueDiff = left.sortValue - right.sortValue;
			if (valueDiff !== 0) {
				return valueDiff;
			}

			return left.originalIndex - right.originalIndex;
		});

		for (const entry of groupEntries) {
			entry.element.parentElement?.appendChild(entry.element);
		}
	}
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
		viewCount: structuredData.viewCount || null,
		duration: structuredData.duration || null,
		publishTime: structuredData.publishTime || null,
		videoId: structuredData.videoId || null,
		channelName: structuredData.channelName || null,
		channelId: structuredData.channelId || null,
		channelPath: structuredData.channelPath || null,
	};

	try {
		// Extract Video ID
		if (!data.videoId) {
			data.videoId =
				window.YouTubeDataExtractor?.getVideoIdFromElement?.(videoElement) ||
				null;
		}

		// Extract Title
		if (!data.title) {
			const titleElement =
				videoElement.querySelector("#video-title") ||
				videoElement.querySelector("a#video-title-link") ||
				videoElement.querySelector("#video-title-link") ||
				videoElement.querySelector("h3[title]") ||
				videoElement.querySelector(".ytLockupMetadataViewModelHeadingReset") ||
				videoElement.querySelector("h3 a") ||
				videoElement.querySelector("yt-formatted-string#video-title") ||
				videoElement.querySelector("[aria-label]");

			data.title =
				normalizeText(titleElement?.textContent) ||
				normalizeText(titleElement?.getAttribute("title")) ||
				normalizeText(titleElement?.getAttribute("aria-label"));
		}

		// Extract Duration (Modern YouTube 2025+ uses badge-shape custom elements)
		if (!data.duration) {
			const durationSelectors = [
				"badge-shape .yt-badge-shape__text", // Modern layout (Home/Search)
				"yt-thumbnail-bottom-overlay-view-model badge-shape .yt-badge-shape__text",
				".yt-badge-shape__text",
				"yt-thumbnail-badge-view-model",
				"ytd-thumbnail-overlay-time-status-renderer span", // Legacy
				"span.ytd-thumbnail-overlay-time-status-renderer",
				"#time-status span",
				".badge-style-type-simple",
			];

			for (const selector of durationSelectors) {
				const element = videoElement.querySelector(selector);
				const text = normalizeText(element?.textContent);
				if (text && /^(?:\d+:)?\d{1,2}:\d{2}$/.test(text)) {
					data.duration = text;
					break;
				}
			}
		}

		// Fallback: Use innerText from thumbnail link
		if (!data.duration) {
			const thumbLink = videoElement.querySelector(
				"a#thumbnail, a[href*='/watch']",
			);
			if (thumbLink) {
				const thumbText = thumbLink.innerText?.trim();
				const timeMatch = thumbText?.match(/\d+:\d+/);
				if (timeMatch) {
					data.duration = timeMatch[0];
				}
			}
		}

		const metadataText = normalizeText(
			[
				videoElement.querySelector("#metadata-line")?.innerText,
				videoElement.querySelector("ytd-video-meta-block")?.innerText,
				videoElement.querySelector("#channel-info")?.innerText,
			]
				.filter(Boolean)
				.join(" "),
		);

		// Extract view count
		if (!data.viewCount) {
			data.viewCount =
				extractMatch(metadataText, /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*views?/i) ||
				extractMatch(metadataText, /No views?/i);
		}

		// Extract publish time
		if (!data.publishTime) {
			data.publishTime = extractMatch(
				metadataText,
				/(streamed\s+)?\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i,
			);
		}

		// Final fallback: broad text parsing only when scoped metadata was absent.
		const fullText = normalizeText(videoElement.innerText);

		if (!data.viewCount && fullText) {
			const viewMatch = fullText.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*views?/i);
			if (viewMatch) {
				data.viewCount = normalizeText(viewMatch[0]);
			} else if (fullText.match(/No views?/i)) {
				data.viewCount = "No views";
			}
		}

		if (!data.publishTime && fullText) {
			const timeMatch = fullText.match(
				/(streamed\s+)?(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i,
			);
			if (timeMatch) {
				data.publishTime = normalizeText(timeMatch[0]);
			}
		}

		const channelLink = videoElement.querySelector(
			"a[href^='/@'], a[href^='/channel/']",
		);
		if (channelLink) {
			if (!data.channelPath) {
				data.channelPath = normalizeChannelPath(
					channelLink.getAttribute("href"),
				);
			}
			if (!data.channelId) {
				data.channelId = getChannelIdFromPath(data.channelPath);
			}
			if (!data.channelName) {
				data.channelName =
					normalizeText(channelLink.textContent) ||
					normalizeText(channelLink.getAttribute("title"));
			}
		}

		if (!data.channelName && videoElement.tagName === "YT-LOCKUP-VIEW-MODEL") {
			const lines = (videoElement.innerText || "")
				.split("\n")
				.map((line) => normalizeText(line))
				.filter(Boolean);
			if (lines.length >= 3) {
				data.channelName = lines[2];
			}
		}
	} catch (error) {
		console.warn("[Filter] Error extracting video data:", error);
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

	// Missing counts are common on some Home cards and ad-like items.
	// Don't treat them as low-view videos; only filter when we have a real count.
	if (!videoData.viewCount) {
		return { shouldFilter: false };
	}

	// Check if views are below threshold
	const views = parseViewCount(videoData.viewCount);
	if (views < settings.minViews) {
		return {
			shouldFilter: true,
			reason: "views",
			details: `Low views: ${videoData.viewCount} (${views})`,
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

// ============================================================================
// SECTION 4: FILTER APPLICATION
// Main filtering orchestration and DOM manipulation
// ============================================================================

// Global state
let filterSettings = DEFAULT_SETTINGS;
const filterStats = { views: 0, keywords: 0, duration: 0, age: 0, total: 0 };
let subscribedChannels = createEmptySubscriptionLookup();

function applySubscribedChannelState(videoElement, isSubscribed, settings) {
	if (isSubscribed) {
		videoElement.setAttribute("data-subscribed-channel", "true");
	} else {
		videoElement.removeAttribute("data-subscribed-channel");
	}

	if (isSubscribed && settings.highlightSubscribedChannels) {
		videoElement.style.boxShadow = "0 0 0 2px rgba(47, 143, 99, 0.65)";
		videoElement.style.borderRadius = "14px";
		videoElement.style.background = "rgba(47, 143, 99, 0.08)";
		return;
	}

	videoElement.style.boxShadow = "";
	videoElement.style.borderRadius = "";
	videoElement.style.background = "";
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

	if (!hasActiveHideFilters(filterSettings) && !isSortEnabled(filterSettings)) {
		console.log("[Filter] All filters disabled, skipping");
		return;
	}

	// Reset current run stats
	const currentStats = {
		views: 0,
		keywords: 0,
		duration: 0,
		age: 0,
		total: 0,
	};
	let newFilters = false;

	// Find all video card elements
	const videoCards = Array.from(document.querySelectorAll(VIDEO_CARD_SELECTOR));
	const targetCards = videoCards.filter(
		(videoElement) =>
			forceFullScan ||
			videoElement.hasAttribute("data-sort-pending") ||
			!videoElement.hasAttribute("data-filter-processed"),
	);

	console.log(
		`[Filter] Found ${videoCards.length} video cards (${targetCards.length} pending)`,
	);
	console.log(`[Filter] Current settings:`, filterSettings);

	const processedCount = targetCards.length;
	let alreadyFilteredCount = 0;

	targetCards.forEach((videoElement) => {
		const wasFiltered = videoElement.hasAttribute("data-filtered");

		// Extract video data
		const videoData = extractVideoData(videoElement);
		const title = videoData.title || "Unknown title";
		const isSubscribed = isSubscribedChannel(videoData);
		applySubscribedChannelState(videoElement, isSubscribed, filterSettings);

		// Apply each filter in order
		const filters = shouldApplyHideFilters()
			? [
					checkViewsFilter(videoData, filterSettings),
					checkDurationFilter(videoData, filterSettings),
					checkAgeFilter(videoData, filterSettings),
					checkKeywordsFilter(videoData, filterSettings),
				]
			: [];

		// Find first filter that triggers
		const triggeredFilter = filters.find((f) => f.shouldFilter);
		const shouldPreserveSubscribedVideo =
			isSubscribed && filterSettings.preserveSubscribedChannels;

		if (triggeredFilter && !shouldPreserveSubscribedVideo) {
			videoElement.style.display = "none";
			videoElement.style.visibility = "";
			videoElement.style.opacity = "";
			videoElement.style.pointerEvents = "";
			videoElement.setAttribute("data-filtered", "true");
			videoElement.setAttribute("data-filter-reason", triggeredFilter.reason);
			videoElement.removeAttribute("data-sort-pending");
			markVideoCardProcessed(videoElement, videoData, filterSettings);

			// Update stats
			currentStats[triggeredFilter.reason]++;
			currentStats.total++;
			newFilters = true;

			// Store and log
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

		videoElement.style.display = "";
		videoElement.style.opacity = "";
		videoElement.style.pointerEvents = "";
		markVideoCardProcessed(videoElement, videoData, filterSettings);
		revealVideoCard(videoElement);
	});

	if (targetCards.length > 0) {
		sortVisibleVideoCards(videoCards, filterSettings);
	}

	// Update global stats
	if (newFilters) {
		filterStats.views += currentStats.views;
		filterStats.keywords += currentStats.keywords;
		filterStats.duration += currentStats.duration;
		filterStats.age += currentStats.age;
		filterStats.total += currentStats.total;

		chrome.storage.local.set({ filterStats });
		console.log(
			`[Filter] Filtered ${currentStats.total} videos this run (${processedCount} new, ${alreadyFilteredCount} already filtered)`,
		);
	}

	console.log(
		`[Filter] Filtering complete in ${Math.round(performance.now() - startedAt)}ms. Total stats:`,
		filterStats,
	);
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

	// Skip filtering on subscriptions page - only subscription extractor runs there
	if (location.href.includes("/feed/channels")) {
		console.log(
			"[Filter] Skipping filters on subscriptions page - subscription extractor only",
		);
		return;
	}

	// Load settings and start filtering
	chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
		filterSettings = settings;
		chrome.storage.local.get(["youtube_subscriptions"], (localData) => {
			subscribedChannels = buildSubscriptionLookup(
				localData.youtube_subscriptions?.channels || [],
			);
			console.log("[Filter] Settings loaded:", filterSettings);

			resetProcessedVideoCards();
			stageVideoCardsForSort();

			// Run initial filter
			setTimeout(() => runAllFilters(true), 1000); // Give YouTube time to render

			// Set up MutationObserver for dynamically loaded content
			let filterTimeout = null;
			const observer = new MutationObserver((mutations) => {
				const hasNewContent = mutations.some((mutation) => {
					Array.from(mutation.addedNodes).forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							if (node.matches?.(VIDEO_CARD_SELECTOR)) {
								stageVideoCardsForSort(node);
								return;
							}

							stageVideoCardsForSort(node);
						}
					});

					return Array.from(mutation.addedNodes).some((node) => {
						// Check if node itself is a video card
						if (
							node.nodeName === "YTD-VIDEO-RENDERER" ||
							node.nodeName === "YTD-RICH-ITEM-RENDERER" ||
							node.nodeName === "YTD-GRID-VIDEO-RENDERER" ||
							node.nodeName === "YT-LOCKUP-VIEW-MODEL"
						) {
							return true;
						}
						// Or if it contains video cards
						return node.querySelector?.(VIDEO_CARD_SELECTOR);
					});
				});

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
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName === "local" && changes.youtube_subscriptions) {
			subscribedChannels = buildSubscriptionLookup(
				changes.youtube_subscriptions.newValue?.channels || [],
			);
			console.log("[Filter] Subscription list changed, re-running filters...");
			resetProcessedVideoCards();
			stageVideoCardsForSort();
			runAllFilters(true);
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
			stageVideoCardsForSort();
			runAllFilters(true);
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
				stageVideoCardsForSort();
				setTimeout(() => runAllFilters(true), 1500);
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
				}
			}, 1000); // Wait 1s after scroll stops
		},
		{ passive: true },
	);
}

// Start the extension
init();
