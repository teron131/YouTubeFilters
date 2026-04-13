const FILTER_STAT_DEFAULTS = {
	views: 0,
	keywords: 0,
	duration: 0,
	age: 0,
	language: 0,
	total: 0,
};
const KEYWORD_STORAGE_DEFAULTS = { keywords: [] };
const SUBSCRIPTIONS_PAGE_URL = "https://www.youtube.com/feed/channels";
const SUBSCRIPTIONS_PAGE_MATCH = "youtube.com/feed/channels";
const EXTRACTION_TIMEOUT_MS = 45000;
const STATS_REFRESH_INTERVAL_MS = 1000;
const SUBSCRIPTIONS_REFRESH_INTERVAL_MS = 2000;

function getElement(id) {
	return document.getElementById(id);
}

function getCheckboxValue(id) {
	return Boolean(getElement(id)?.checked);
}

function getNumberValue(id, fallbackValue) {
	const value = parseInt(getElement(id)?.value || "", 10);
	return Number.isNaN(value) ? fallbackValue : value;
}

function setSubscriptionStatus(markup) {
	const statusElement = getElement("subscriptionStatus");
	if (statusElement) {
		statusElement.innerHTML = markup;
	}
}

function setSubscriptionSectionVisible(isVisible) {
	const sectionElement = getElement("subscriptionSection");
	if (!sectionElement) {
		return;
	}

	sectionElement.classList.toggle("visible", isVisible);
}

function labelFromPath(channelPath) {
	if (typeof channelPath !== "string") {
		return null;
	}

	if (channelPath.startsWith("/@")) {
		return channelPath.slice(2);
	}

	if (channelPath.startsWith("/channel/")) {
		return channelPath.slice("/channel/".length);
	}

	return null;
}

function normalizeSubscriptionRecord(channel) {
	if (!channel) {
		return null;
	}

	if (typeof channel === "string") {
		return {
			name: channel,
			channelId: null,
			channelPath: null,
		};
	}

	return {
		name:
			channel.name || labelFromPath(channel.channelPath) || "Unknown channel",
		channelId: channel.channelId || null,
		channelPath: channel.channelPath || null,
	};
}

function renderKeywords(keywords) {
	const keywordsList = getElement("keywordsList");
	if (!keywordsList) {
		return;
	}

	keywordsList.innerHTML = "";
	const fragment = document.createDocumentFragment();

	for (const keyword of keywords) {
		const keywordElement = document.createElement("span");
		keywordElement.className = "keyword-item";
		keywordElement.appendChild(document.createTextNode(keyword));

		const removeButton = document.createElement("button");
		removeButton.textContent = "×";
		removeButton.addEventListener("click", () => removeKeyword(keyword));
		keywordElement.appendChild(removeButton);
		fragment.appendChild(keywordElement);
	}

	keywordsList.appendChild(fragment);
}

function loadSettings() {
	chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
		getElement("viewsFilterEnabled").checked = settings.viewsFilterEnabled;
		getElement("durationFilterEnabled").checked =
			settings.durationFilterEnabled;
		getElement("keywordFilterEnabled").checked = settings.keywordFilterEnabled;
		getElement("ageFilterEnabled").checked = settings.ageFilterEnabled;
		getElement("englishOnlyTitles").checked = Boolean(
			settings.englishOnlyTitles,
		);
		getElement("preserveSubscribedChannels").checked =
			settings.preserveSubscribedChannels;
		getElement("minViews").value = settings.minViews;
		getElement("minDuration").value = settings.minDuration;
		getElement("maxDuration").value = settings.maxDuration;
		getElement("maxAgeYears").value = settings.maxAgeYears;
		renderKeywords(settings.keywords || []);
	});
}

function openSubscriptionsPageLink() {
	chrome.tabs.create({ url: SUBSCRIPTIONS_PAGE_URL });
}

function setExtractButtonDisabled(disabled) {
	const extractButton = getElement("extractSubscriptionsButton");
	if (extractButton) {
		extractButton.disabled = disabled;
	}
}

function getCurrentTabHostLabel(url) {
	return url?.split("/")[2] || "unknown";
}

function extractSubscriptionsFromTab() {
	const extractButton = getElement("extractSubscriptionsButton");
	if (!extractButton) {
		console.error("[Popup] Extract button not found");
		return;
	}

	setExtractButtonDisabled(true);
	setSubscriptionStatus(
		'<div class="status-text">⏳ Extracting subscriptions...<br><small>Scrolling to load the full subscriptions list before saving.</small></div>',
	);

	let timeoutId = null;

	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const activeTab = tabs[0];
		if (!activeTab) {
			setSubscriptionStatus(
				'<div class="status-text error">❌ No active tab found</div>',
			);
			setExtractButtonDisabled(false);
			return;
		}

		console.log("[Popup] Active tab URL:", activeTab.url);

		if (!activeTab.url.includes(SUBSCRIPTIONS_PAGE_MATCH)) {
			setSubscriptionStatus(
				'<div class="status-text error">❌ Please navigate to YouTube subscriptions page first<br><small>Current: ' +
					getCurrentTabHostLabel(activeTab.url) +
					"</small></div>",
			);
			setExtractButtonDisabled(false);
			return;
		}

		timeoutId = setTimeout(() => {
			setExtractButtonDisabled(false);
			setSubscriptionStatus(
				'<div class="status-text error">❌ Extraction timeout<br><small>Try reloading the page and extension</small></div>',
			);
			console.error("[Popup] Extraction timeout");
		}, EXTRACTION_TIMEOUT_MS);

		chrome.runtime.sendMessage(
			{ action: "extractSubscriptions", tabId: activeTab.id },
			(response) => {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}

				setExtractButtonDisabled(false);

				if (chrome.runtime.lastError) {
					console.error("[Popup] Extraction error:", chrome.runtime.lastError);
					setSubscriptionStatus(
						'<div class="status-text error">❌ Failed to extract:<br><small>' +
							chrome.runtime.lastError.message +
							"</small></div>",
					);
					return;
				}

				if (response?.success) {
					setSubscriptionStatus(
						`<div class="status-text success">✅ Successfully extracted ${response.count} subscriptions!<br><small>Full extraction using advanced method</small></div>`,
					);
					displaySubscriptionsFromStorage();
					return;
				}

				if (response) {
					setSubscriptionStatus(
						'<div class="status-text error">❌ Extraction failed:<br><small>' +
							(response.error || "Unknown error") +
							"</small></div>",
					);
					return;
				}

				setSubscriptionStatus(
					'<div class="status-text error">❌ No response from background script<br><small>Try reloading the extension</small></div>',
				);
			},
		);
	});
}

function renderSubscriptions(channels) {
	const subscriptionsList = getElement("subscriptionsList");
	if (!subscriptionsList) {
		return;
	}

	subscriptionsList.innerHTML = channels
		.map((channel) => {
			const meta = [channel.channelPath, channel.channelId]
				.filter(Boolean)
				.join(" • ");
			return `
				<div class="subscription-item">
					<strong>${channel.name}</strong>
					${meta ? `<div class="meta">${meta}</div>` : ""}
				</div>
			`;
		})
		.join("");
}

function displaySubscriptionsFromStorage() {
	chrome.storage.local.get(["youtube_subscriptions"], (result) => {
		const subscriptionData = result.youtube_subscriptions;
		const channels = (subscriptionData?.channels || [])
			.map((channel) => normalizeSubscriptionRecord(channel))
			.filter(Boolean);

		if (channels.length === 0) {
			setSubscriptionSectionVisible(false);
			return;
		}

		setSubscriptionSectionVisible(true);
		if (subscriptionData?.extracted) {
			setSubscriptionStatus(
				`<div class="status-text success">Loaded ${channels.length} subscriptions<br><small>Updated ${new Date(subscriptionData.extracted).toLocaleString()}</small></div>`,
			);
		}
		renderSubscriptions(channels);
	});
}

function addKeyword() {
	const keywordInput = getElement("newKeyword");
	const keyword = keywordInput.value.trim().toLowerCase();
	if (!keyword) {
		return;
	}

	chrome.storage.sync.get(KEYWORD_STORAGE_DEFAULTS, (result) => {
		if (result.keywords.includes(keyword)) {
			return;
		}

		const keywords = [...result.keywords, keyword];
		chrome.storage.sync.set({ keywords }, () => {
			renderKeywords(keywords);
			keywordInput.value = "";
		});
	});
}

function removeKeyword(keyword) {
	chrome.storage.sync.get(KEYWORD_STORAGE_DEFAULTS, (result) => {
		const keywords = result.keywords.filter(
			(storedKeyword) => storedKeyword !== keyword,
		);
		chrome.storage.sync.set({ keywords }, () => {
			renderKeywords(keywords);
		});
	});
}

function collectSettings() {
	return {
		viewsFilterEnabled: getCheckboxValue("viewsFilterEnabled"),
		durationFilterEnabled: getCheckboxValue("durationFilterEnabled"),
		keywordFilterEnabled: getCheckboxValue("keywordFilterEnabled"),
		ageFilterEnabled: getCheckboxValue("ageFilterEnabled"),
		englishOnlyTitles: getCheckboxValue("englishOnlyTitles"),
		preserveSubscribedChannels: getCheckboxValue("preserveSubscribedChannels"),
		minViews: getNumberValue("minViews", 0),
		minDuration: getNumberValue("minDuration", 0),
		maxDuration: getNumberValue("maxDuration", 0),
		maxAgeYears: getNumberValue("maxAgeYears", 5),
	};
}

function saveSettings() {
	const settings = collectSettings();

	chrome.storage.sync.get(KEYWORD_STORAGE_DEFAULTS, (result) => {
		chrome.storage.sync.set(
			{
				...settings,
				keywords: result.keywords,
			},
			() => {
				const saveButton = getElement("saveSettings");
				const originalText = saveButton.textContent;
				saveButton.textContent = "Saved!";
				setTimeout(() => {
					saveButton.textContent = originalText;
				}, 1500);
			},
		);
	});
}

function renderFilteredVideos(videos) {
	const filteredVideosList = getElement("filteredVideosList");
	if (!filteredVideosList) {
		return;
	}

	filteredVideosList.innerHTML = "";
	for (const video of videos.slice(-100).reverse()) {
		const videoElement = document.createElement("div");
		videoElement.className = "filtered-video";
		videoElement.innerHTML = `
			<div>${video.title}</div>
			<div class="reason">${video.reason}</div>
		`;
		filteredVideosList.appendChild(videoElement);
	}
}

function displayFilteredVideos() {
	chrome.storage.local.get(["filteredVideos"], (result) => {
		renderFilteredVideos(result.filteredVideos || []);
	});
}

function clearFilteredVideos() {
	chrome.storage.local.set({ filteredVideos: [] }, () => {
		displayFilteredVideos();
	});
}

function updateStats() {
	chrome.storage.local.get(["filterStats"], (result) => {
		const stats = {
			...FILTER_STAT_DEFAULTS,
			...(result.filterStats || {}),
		};

		getElement("views-count").textContent = stats.views;
		getElement("keywords-count").textContent = stats.keywords;
		getElement("duration-count").textContent = stats.duration;
		getElement("age-count").textContent = stats.age;
		getElement("language-count").textContent = stats.language;
		getElement("total-count").textContent = stats.total;
	});

	displayFilteredVideos();
}

function initializePopup() {
	loadSettings();
	updateStats();
	displaySubscriptionsFromStorage();

	setInterval(updateStats, STATS_REFRESH_INTERVAL_MS);
	setInterval(
		displaySubscriptionsFromStorage,
		SUBSCRIPTIONS_REFRESH_INTERVAL_MS,
	);

	getElement("saveSettings").addEventListener("click", saveSettings);
	getElement("clearFilteredVideos").addEventListener(
		"click",
		clearFilteredVideos,
	);
	getElement("addKeywordButton").addEventListener("click", addKeyword);
	getElement("openSubscriptionsLink").addEventListener(
		"click",
		openSubscriptionsPageLink,
	);
	getElement("extractSubscriptionsButton").addEventListener(
		"click",
		extractSubscriptionsFromTab,
	);

	window.removeKeyword = removeKeyword;
}

document.addEventListener("DOMContentLoaded", initializePopup);
