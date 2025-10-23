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
  setInterval(updateStats, 1000);

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

  // Make functions available globally for keyword removal
  window.removeKeyword = removeKeyword;
});
