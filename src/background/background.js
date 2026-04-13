// Background service worker for YouTube Filter Extension.
// Handles subscription extraction using chrome.scripting in the page context.

const EXTRACT_SUBSCRIPTIONS_ACTION = "extractSubscriptions";
const SUBSCRIPTIONS_STORAGE_KEY = "youtube_subscriptions";

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.action !== EXTRACT_SUBSCRIPTIONS_ACTION) {
		return undefined;
	}

	handleSubscriptionExtraction(request.tabId)
		.then((result) => {
			sendResponse({
				success: true,
				count: result.count,
				channels: result.channels,
			});
		})
		.catch((error) => {
			console.error("[Background] Extraction error:", error);
			sendResponse({ success: false, error: error.message });
		});

	return true;
});

function buildStoredSubscriptions(
	channels,
	extractedAt = new Date().toISOString(),
) {
	return {
		extracted: extractedAt,
		channels,
		channelNames: channels.map((channel) => channel.name),
		count: channels.length,
	};
}

async function runPageSubscriptionExtraction(tabId) {
	const results = await chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: extractSubscriptionsInPageContext,
	});

	if (!results?.length) {
		throw new Error("No results from script execution");
	}

	const pageResult = results[0].result;
	if (!pageResult?.channels) {
		throw new Error("No channels returned from page extraction");
	}

	return pageResult.channels;
}

async function handleSubscriptionExtraction(tabId) {
	try {
		const channels = await runPageSubscriptionExtraction(tabId);
		await chrome.storage.local.set({
			[SUBSCRIPTIONS_STORAGE_KEY]: buildStoredSubscriptions(channels),
		});

		return {
			success: true,
			count: channels.length,
			channels,
		};
	} catch (error) {
		console.error("[Background] Extraction failed:", error);
		throw error;
	}
}

// This function runs in page context (MAIN world) with full access to window.
async function extractSubscriptionsInPageContext() {
	const CHANNEL_RENDERER_SELECTOR = "ytd-channel-renderer";
	const CHANNEL_LINK_SELECTOR = "a[href^='/@'], a[href^='/channel/']";
	const LOCAL_STORAGE_KEY = "youtube_subscriptions";
	const MAX_SCROLL_PASSES = 45;
	const STABLE_PASSES_NEEDED = 4;
	const SCROLL_WAIT_MS = 900;
	const SCROLL_RESTORE_WAIT_MS = 100;

	function sleep(ms) {
		return new Promise((resolve) => {
			window.setTimeout(resolve, ms);
		});
	}

	function normalizeText(value) {
		if (typeof value !== "string") {
			return null;
		}

		const normalized = value.replace(/\s+/g, " ").trim();
		return normalized || null;
	}

	function textFromNode(value) {
		if (!value) {
			return null;
		}

		if (typeof value === "string") {
			return normalizeText(value);
		}

		if (Array.isArray(value)) {
			return normalizeText(
				value
					.map((item) => textFromNode(item))
					.filter(Boolean)
					.join(" "),
			);
		}

		if (typeof value !== "object") {
			return null;
		}

		return normalizeText(
			[
				value.simpleText,
				value.content,
				value.text,
				Array.isArray(value.runs)
					? value.runs.map((run) => textFromNode(run)).join(" ")
					: null,
			]
				.filter(Boolean)
				.join(" "),
		);
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

	function extractHandle(path) {
		const normalizedPath = normalizeChannelPath(path);
		if (!normalizedPath?.startsWith("/@")) {
			return null;
		}

		return normalizedPath.slice(2);
	}

	function isPlausibleChannelName(name) {
		const normalizedName = normalizeText(name);
		if (!normalizedName || normalizedName.length > 120) {
			return false;
		}

		return !(
			normalizedName.includes("subscribers") ||
			normalizedName.includes("Subscribe") ||
			normalizedName.includes("Subscribed")
		);
	}

	function chooseBetterName(existingName, nextName) {
		if (!isPlausibleChannelName(existingName)) {
			return isPlausibleChannelName(nextName) ? normalizeText(nextName) : null;
		}

		if (!isPlausibleChannelName(nextName)) {
			return normalizeText(existingName);
		}

		const normalizedExisting = normalizeText(existingName);
		const normalizedNext = normalizeText(nextName);
		if (!normalizedExisting) {
			return normalizedNext;
		}
		if (!normalizedNext) {
			return normalizedExisting;
		}

		return normalizedNext.length < normalizedExisting.length
			? normalizedNext
			: normalizedExisting;
	}

	function buildSubscriptionRecord({
		name,
		channelId,
		channelPath,
		description,
	}) {
		const normalizedName = isPlausibleChannelName(name)
			? normalizeText(name)
			: null;
		const normalizedPath = normalizeChannelPath(channelPath);
		const finalChannelId =
			typeof channelId === "string" && channelId.startsWith("UC")
				? channelId
				: normalizedPath?.startsWith("/channel/")
					? normalizedPath.split("/channel/")[1]
					: null;

		if (!normalizedName && !finalChannelId && !normalizedPath) {
			return null;
		}

		return {
			name: normalizedName,
			channelId: finalChannelId,
			channelPath: normalizedPath,
			channelUrl: normalizedPath
				? new URL(normalizedPath, window.location.origin).href
				: null,
			handle: extractHandle(normalizedPath),
			description: normalizeText(description),
		};
	}

	function mergeChannelRecords(existingChannel, nextChannel) {
		return {
			name: chooseBetterName(existingChannel.name, nextChannel.name),
			channelId: nextChannel.channelId || existingChannel.channelId || null,
			channelPath:
				nextChannel.channelPath || existingChannel.channelPath || null,
			channelUrl: nextChannel.channelUrl || existingChannel.channelUrl || null,
			handle: nextChannel.handle || existingChannel.handle || null,
			description:
				nextChannel.description || existingChannel.description || null,
		};
	}

	function getRendererData(renderer) {
		return (
			renderer?.data ||
			renderer?.__data?.data ||
			renderer?.__dataHost?.data ||
			null
		);
	}

	function getChannelRecordFromRenderer(renderer) {
		const data = getRendererData(renderer);
		const endpoint =
			data?.navigationEndpoint ||
			data?.longBylineText?.runs?.[0]?.navigationEndpoint ||
			data?.shortBylineText?.runs?.[0]?.navigationEndpoint ||
			null;

		return buildSubscriptionRecord({
			name:
				textFromNode(data?.title) ||
				normalizeText(
					renderer?.querySelector(`#main-link, ${CHANNEL_LINK_SELECTOR}`)
						?.textContent,
				),
			channelId: data?.channelId || endpoint?.browseEndpoint?.browseId || null,
			channelPath:
				endpoint?.browseEndpoint?.canonicalBaseUrl ||
				endpoint?.commandMetadata?.webCommandMetadata?.url ||
				renderer?.querySelector(CHANNEL_LINK_SELECTOR)?.getAttribute("href") ||
				null,
			description:
				textFromNode(data?.descriptionSnippet) ||
				normalizeText(renderer?.querySelector("#description")?.textContent),
		});
	}

	async function loadAllSubscriptionRenderers() {
		const originalScrollY = window.scrollY;
		let stablePassCount = 0;
		let previousChannelCount = 0;
		let previousScrollHeight = 0;

		for (let passIdx = 0; passIdx < MAX_SCROLL_PASSES; passIdx += 1) {
			const channelCountBeforeScroll = document.querySelectorAll(
				CHANNEL_RENDERER_SELECTOR,
			).length;
			const scrollHeightBeforeScroll = document.documentElement.scrollHeight;

			window.scrollTo(0, scrollHeightBeforeScroll);
			await sleep(SCROLL_WAIT_MS);

			const channelCountAfterScroll = document.querySelectorAll(
				CHANNEL_RENDERER_SELECTOR,
			).length;
			const scrollHeightAfterScroll = document.documentElement.scrollHeight;

			if (
				channelCountAfterScroll === channelCountBeforeScroll &&
				channelCountAfterScroll === previousChannelCount &&
				scrollHeightAfterScroll === scrollHeightBeforeScroll &&
				scrollHeightAfterScroll === previousScrollHeight
			) {
				stablePassCount += 1;
			} else {
				stablePassCount = 0;
			}

			previousChannelCount = channelCountAfterScroll;
			previousScrollHeight = scrollHeightAfterScroll;

			if (stablePassCount >= STABLE_PASSES_NEEDED) {
				break;
			}
		}

		window.scrollTo(0, originalScrollY);
		await sleep(SCROLL_RESTORE_WAIT_MS);
	}

	function getChannelAliases(channel) {
		return [
			channel.channelId,
			channel.channelPath?.toLowerCase() || null,
			channel.name?.toLowerCase() || null,
		].filter(Boolean);
	}

	const channelsByKey = new Map();
	const channelKeyByAlias = new Map();

	function addChannel(channel) {
		if (!channel) {
			return;
		}

		const aliases = getChannelAliases(channel);
		if (aliases.length === 0) {
			return;
		}

		const existingKey = aliases.find((alias) => channelKeyByAlias.has(alias));
		const channelKey = existingKey
			? channelKeyByAlias.get(existingKey)
			: aliases[0];
		const mergedChannel = channelsByKey.has(channelKey)
			? mergeChannelRecords(channelsByKey.get(channelKey), channel)
			: channel;

		channelsByKey.set(channelKey, mergedChannel);
		for (const alias of getChannelAliases(mergedChannel)) {
			channelKeyByAlias.set(alias, channelKey);
		}
	}

	function collectChannelsFromRenderers() {
		try {
			document
				.querySelectorAll(CHANNEL_RENDERER_SELECTOR)
				.forEach((renderer) => {
					addChannel(getChannelRecordFromRenderer(renderer));
				});
		} catch (error) {
			console.error("[Extract] Renderer extraction error:", error);
		}
	}

	function collectChannelsFromLinks() {
		if (channelsByKey.size > 0) {
			return;
		}

		try {
			document.querySelectorAll(CHANNEL_LINK_SELECTOR).forEach((link) => {
				addChannel(
					buildSubscriptionRecord({
						name: link.textContent,
						channelPath: link.getAttribute("href"),
					}),
				);
			});
		} catch (error) {
			console.error("[Extract] Link fallback error:", error);
		}
	}

	function sortChannels(channels) {
		return channels.sort((left, right) =>
			(left.name || left.channelPath || left.channelId || "").localeCompare(
				right.name || right.channelPath || right.channelId || "",
			),
		);
	}

	function buildStoredSubscriptionsPayload(
		channels,
		extractedAt = new Date().toISOString(),
	) {
		return {
			extracted: extractedAt,
			channels,
			channelNames: channels.map((channel) => channel.name),
			count: channels.length,
		};
	}

	function saveChannelsToLocalStorage(channels) {
		try {
			localStorage.setItem(
				LOCAL_STORAGE_KEY,
				JSON.stringify(buildStoredSubscriptionsPayload(channels)),
			);
		} catch (error) {
			console.warn("[Extract] localStorage save failed:", error);
		}
	}

	await loadAllSubscriptionRenderers();
	collectChannelsFromRenderers();
	collectChannelsFromLinks();

	const channels = sortChannels(Array.from(channelsByKey.values()));
	saveChannelsToLocalStorage(channels);

	return {
		success: true,
		channels,
		count: channels.length,
	};
}
