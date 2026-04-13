// Background service worker for YouTube Filter Extension
// Handles subscription extraction using chrome.scripting API

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.action === "extractSubscriptions") {
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

		return true; // Keep message channel open for async response
	}
});

// Extract subscriptions by injecting script into MAIN world (page context)
async function handleSubscriptionExtraction(tabId) {
	try {
		// Inject extraction script with full access to page-owned renderer data.
		const results = await chrome.scripting.executeScript({
			target: { tabId: tabId },
			world: "MAIN", // Critical: Runs in page context, bypasses CSP
			func: extractSubscriptionsInPageContext,
		});

		if (!results || results.length === 0) {
			throw new Error("No results from script execution");
		}

		const result = results[0].result;

		// Store in Chrome storage
		await chrome.storage.local.set({
			youtube_subscriptions: {
				extracted: new Date().toISOString(),
				channels: result.channels,
				channelNames: result.channels.map((channel) => channel.name),
				count: result.channels.length,
			},
		});

		return {
			success: true,
			count: result.channels.length,
			channels: result.channels,
		};
	} catch (error) {
		console.error("[Background] Extraction failed:", error);
		throw error;
	}
}

// This function runs in page context (MAIN world) with full access to window
async function extractSubscriptionsInPageContext() {
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
		if (!normalizedName) {
			return false;
		}

		if (normalizedName.length > 120) {
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

	function getChannelRecordFromRenderer(renderer) {
		const data =
			renderer?.data ||
			renderer?.__data?.data ||
			renderer?.__dataHost?.data ||
			null;
		const endpoint =
			data?.navigationEndpoint ||
			data?.longBylineText?.runs?.[0]?.navigationEndpoint ||
			data?.shortBylineText?.runs?.[0]?.navigationEndpoint ||
			null;

		return buildSubscriptionRecord({
			name:
				textFromNode(data?.title) ||
				normalizeText(
					renderer?.querySelector(
						"#main-link, a[href^='/@'], a[href^='/channel/']",
					)?.textContent,
				),
			channelId: data?.channelId || endpoint?.browseEndpoint?.browseId || null,
			channelPath:
				endpoint?.browseEndpoint?.canonicalBaseUrl ||
				endpoint?.commandMetadata?.webCommandMetadata?.url ||
				renderer
					?.querySelector("a[href^='/@'], a[href^='/channel/']")
					?.getAttribute("href") ||
				null,
			description:
				textFromNode(data?.descriptionSnippet) ||
				normalizeText(renderer?.querySelector("#description")?.textContent),
		});
	}

	async function loadAllSubscriptionRenderers() {
		const maxScrollPasses = 45;
		const stablePassesNeeded = 4;
		const originalScrollY = window.scrollY;
		let stablePasses = 0;
		let previousCount = 0;
		let previousScrollHeight = 0;

		for (let pass = 0; pass < maxScrollPasses; pass++) {
			const beforeCount = document.querySelectorAll(
				"ytd-channel-renderer",
			).length;
			const beforeScrollHeight = document.documentElement.scrollHeight;

			window.scrollTo(0, beforeScrollHeight);
			await sleep(900);

			const afterCount = document.querySelectorAll(
				"ytd-channel-renderer",
			).length;
			const afterScrollHeight = document.documentElement.scrollHeight;

			if (
				afterCount === beforeCount &&
				afterCount === previousCount &&
				afterScrollHeight === beforeScrollHeight &&
				afterScrollHeight === previousScrollHeight
			) {
				stablePasses += 1;
			} else {
				stablePasses = 0;
			}

			previousCount = afterCount;
			previousScrollHeight = afterScrollHeight;

			if (stablePasses >= stablePassesNeeded) {
				break;
			}
		}

		window.scrollTo(0, originalScrollY);
		await sleep(100);
	}

	const channelsByKey = new Map();

	function addChannel(channel) {
		if (!channel) {
			return;
		}

		const normalizedPath = channel.channelPath?.toLowerCase() || null;
		const normalizedName = channel.name?.toLowerCase() || null;
		const existingEntry = Array.from(channelsByKey.entries()).find(
			([, existingChannel]) =>
				(channel.channelId &&
					existingChannel.channelId === channel.channelId) ||
				(normalizedPath &&
					existingChannel.channelPath?.toLowerCase() === normalizedPath) ||
				(normalizedName &&
					existingChannel.name?.toLowerCase() === normalizedName),
		);
		if (existingEntry) {
			const [existingKey, existingChannel] = existingEntry;
			channelsByKey.set(
				existingKey,
				mergeChannelRecords(existingChannel, channel),
			);
			return;
		}

		const key = channel.channelId || normalizedPath || normalizedName;
		if (key) {
			channelsByKey.set(key, channel);
		}
	}

	await loadAllSubscriptionRenderers();

	try {
		document.querySelectorAll("ytd-channel-renderer").forEach((renderer) => {
			addChannel(getChannelRecordFromRenderer(renderer));
		});
	} catch (e) {
		console.error("[Extract] Renderer extraction error:", e);
	}

	// Fallback: harvest channel links that appear in the subscriptions nav/contents.
	if (channelsByKey.size === 0) {
		try {
			document
				.querySelectorAll("a[href^='/@'], a[href^='/channel/']")
				.forEach((link) => {
					addChannel(
						buildSubscriptionRecord({
							name: link.textContent,
							channelPath: link.getAttribute("href"),
						}),
					);
				});
		} catch (e) {
			console.error("[Extract] Link fallback error:", e);
		}
	}

	const result = Array.from(channelsByKey.values()).sort((left, right) =>
		(left.name || left.channelPath || left.channelId || "").localeCompare(
			right.name || right.channelPath || right.channelId || "",
		),
	);

	// Save to localStorage for backup
	try {
		localStorage.setItem(
			"youtube_subscriptions",
			JSON.stringify({
				extracted: new Date().toISOString(),
				channels: result,
				channelNames: result.map((channel) => channel.name),
				count: result.length,
			}),
		);
	} catch (e) {
		console.warn("[Extract] localStorage save failed:", e);
	}

	return {
		success: true,
		channels: result,
		count: result.length,
	};
}
