// Load and display current settings
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById("viewsFilterEnabled").checked =
      settings.viewsFilterEnabled;
    document.getElementById("durationFilterEnabled").checked =
      settings.durationFilterEnabled;
    document.getElementById("keywordFilterEnabled").checked =
      settings.keywordFilterEnabled;
    document.getElementById("ageFilterEnabled").checked =
      settings.ageFilterEnabled;
    document.getElementById("minViews").value = settings.minViews;
    document.getElementById("minDuration").value = settings.minDuration;
    document.getElementById("maxDuration").value = settings.maxDuration;
    document.getElementById("maxAgeYears").value = settings.maxAgeYears;
    displayKeywords(settings.keywords || []);
  });
}

// Display keywords in the UI
function displayKeywords(keywords) {
  const keywordsList = document.getElementById("keywordsList");
  keywordsList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  keywords.forEach((keyword) => {
    const keywordElement = document.createElement("span");
    keywordElement.className = "keyword-item";
    const textNode = document.createTextNode(keyword);
    keywordElement.appendChild(textNode);
    const removeButton = document.createElement("button");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeKeyword(keyword));
    keywordElement.appendChild(removeButton);
    fragment.appendChild(keywordElement);
  });
  keywordsList.appendChild(fragment);
}

// Open subscriptions page link
function openSubscriptionsPageLink() {
  chrome.tabs.create({ url: "https://www.youtube.com/feed/channels" });
}

// Extract subscriptions from active tab (via background script)
function extractSubscriptionsFromTab() {
  const statusDiv = document.getElementById("subscriptionStatus");
  const extractButton = document.getElementById("extractSubscriptionsButton");
  
  if (!extractButton) {
    console.error("Extract button not found");
    return;
  }
  
  extractButton.disabled = true;
  statusDiv.innerHTML = '<div class="status-text">⏳ Extracting subscriptions...<br><small>Using advanced method for full extraction</small></div>';
  
  // Set a timeout to prevent hanging forever
  let timeoutId = null;
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      statusDiv.innerHTML = '<div class="status-text error">❌ No active tab found</div>';
      extractButton.disabled = false;
      return;
    }
    
    const tab = tabs[0];
    console.log("[Popup] Active tab URL:", tab.url);
    
    if (!tab.url.includes("youtube.com/feed/channels")) {
      statusDiv.innerHTML = '<div class="status-text error">❌ Please navigate to YouTube subscriptions page first<br><small>Current: ' + (tab.url.split('/')[2] || 'unknown') + '</small></div>';
      extractButton.disabled = false;
      return;
    }
    
    // Set 10 second timeout
    timeoutId = setTimeout(() => {
      extractButton.disabled = false;
      statusDiv.innerHTML = '<div class="status-text error">❌ Extraction timeout<br><small>Try reloading the page and extension</small></div>';
      console.error("[Popup] Extraction timeout");
    }, 10000);
    
    // Send message to background script (not content script!)
    chrome.runtime.sendMessage(
      { action: "extractSubscriptions", tabId: tab.id },
      (response) => {
        // Clear timeout if we got a response
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        extractButton.disabled = false;
        
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError);
          statusDiv.innerHTML = '<div class="status-text error">❌ Failed to extract:<br><small>' + chrome.runtime.lastError.message + '</small></div>';
          return;
        }
        
        if (response && response.success) {
          statusDiv.innerHTML = `<div class="status-text success">✅ Successfully extracted ${response.count} subscriptions!<br><small>Full extraction using advanced method</small></div>`;
          displaySubscriptionsFromStorage();
        } else if (response) {
          statusDiv.innerHTML = '<div class="status-text error">❌ Extraction failed:<br><small>' + (response.error || "Unknown error") + '</small></div>';
        } else {
          statusDiv.innerHTML = '<div class="status-text error">❌ No response from background script<br><small>Try reloading the extension</small></div>';
        }
      }
    );
  });
}

// Display subscriptions from storage
function displaySubscriptionsFromStorage() {
  chrome.storage.local.get(["youtube_subscriptions"], (result) => {
    const subscriptionsList = document.getElementById("subscriptionsList");
    const subscriptionSection = document.getElementById("subscriptionSection");
    
    if (!subscriptionsList) return;
    
    const data = result.youtube_subscriptions;
    
    if (!data || !data.channels || data.channels.length === 0) {
      if (subscriptionSection) {
        subscriptionSection.classList.remove("visible");
      }
      return;
    }
    
    if (subscriptionSection) {
      subscriptionSection.classList.add("visible");
    }
    subscriptionsList.innerHTML = data.channels
      .map(ch => `<div class="subscription-item">${ch}</div>`)
      .join("");
  });
}

// Add a new keyword
function addKeyword() {
  const input = document.getElementById("newKeyword");
  const keyword = input.value.trim().toLowerCase();
  if (keyword) {
    chrome.storage.sync.get({ keywords: [] }, (result) => {
      if (!result.keywords.includes(keyword)) {
        const newKeywords = [...result.keywords, keyword];
        chrome.storage.sync.set({ keywords: newKeywords }, () => {
          displayKeywords(newKeywords);
          input.value = "";
        });
      }
    });
  }
}

// Remove a keyword
function removeKeyword(keyword) {
  chrome.storage.sync.get({ keywords: [] }, (result) => {
    const newKeywords = result.keywords.filter((k) => k !== keyword);
    chrome.storage.sync.set({ keywords: newKeywords }, () => {
      displayKeywords(newKeywords);
    });
  });
}

// Save all settings
function saveSettings() {
  const settings = {
    viewsFilterEnabled: document.getElementById("viewsFilterEnabled").checked,
    durationFilterEnabled: document.getElementById("durationFilterEnabled")
      .checked,
    keywordFilterEnabled: document.getElementById("keywordFilterEnabled")
      .checked,
    ageFilterEnabled: document.getElementById("ageFilterEnabled").checked,
    minViews: parseInt(document.getElementById("minViews").value) || 0,
    minDuration: parseInt(document.getElementById("minDuration").value) || 0,
    maxDuration: parseInt(document.getElementById("maxDuration").value) || 0,
    maxAgeYears: parseInt(document.getElementById("maxAgeYears").value) || 5,
  };

  chrome.storage.sync.get({ keywords: [] }, (result) => {
    settings.keywords = result.keywords;
    chrome.storage.sync.set(settings, () => {
      const saveButton = document.getElementById("saveSettings");
      const originalText = saveButton.textContent;
      saveButton.textContent = "Saved!";
      setTimeout(() => {
        saveButton.textContent = originalText;
      }, 1500);
    });
  });
}

// Display filtered videos
function displayFilteredVideos() {
  chrome.storage.local.get(["filteredVideos"], (result) => {
    const filteredVideosList = document.getElementById("filteredVideosList");
    const videos = result.filteredVideos || [];

    filteredVideosList.innerHTML = "";
    videos
      .slice(-100)
      .reverse()
      .forEach((video) => {
        const videoElement = document.createElement("div");
        videoElement.className = "filtered-video";
        videoElement.innerHTML = `
        <div>${video.title}</div>
        <div class="reason">${video.reason}</div>
      `;
        filteredVideosList.appendChild(videoElement);
      });
  });
}

// Clear filtered videos history
function clearFilteredVideos() {
  chrome.storage.local.set({ filteredVideos: [] }, () => {
    displayFilteredVideos();
  });
}

// Update stats display
function updateStats() {
  chrome.storage.local.get(["filterStats", "filteredVideos"], function (data) {
    const stats = data.filterStats || {
      views: 0,
      keywords: 0,
      duration: 0,
      age: 0,
      total: 0,
    };

    document.getElementById("views-count").textContent = stats.views;
    document.getElementById("keywords-count").textContent = stats.keywords;
    document.getElementById("duration-count").textContent = stats.duration;
    document.getElementById("age-count").textContent = stats.age;
    document.getElementById("total-count").textContent = stats.total;

    // Update filtered videos list
    displayFilteredVideos();
  });
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  updateStats();
  displaySubscriptionsFromStorage();
  setInterval(updateStats, 1000);
  setInterval(displaySubscriptionsFromStorage, 2000);

  // Add event listeners
  document
    .getElementById("saveSettings")
    .addEventListener("click", saveSettings);
  document
    .getElementById("clearFilteredVideos")
    .addEventListener("click", clearFilteredVideos);
  document
    .getElementById("addKeywordButton")
    .addEventListener("click", addKeyword);
  document
    .getElementById("openSubscriptionsLink")
    .addEventListener("click", openSubscriptionsPageLink);
  document
    .getElementById("extractSubscriptionsButton")
    .addEventListener("click", extractSubscriptionsFromTab);

  // Make functions available globally for keyword removal
  window.removeKeyword = removeKeyword;
});
