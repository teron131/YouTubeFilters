// Background service worker for YouTube Filter Extension
console.log("[Background] Service worker loaded");

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Background] Message received:", request);
  
  if (request.action === "extractSubscriptions") {
    handleSubscriptionExtraction(request.tabId)
      .then(result => {
        console.log("[Background] Extraction successful:", result.count, "channels");
        sendResponse({ success: true, count: result.count, channels: result.channels });
      })
      .catch(error => {
        console.error("[Background] Extraction failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
});

// Handle subscription extraction by injecting script into MAIN world
async function handleSubscriptionExtraction(tabId) {
  console.log("[Background] Starting extraction for tab:", tabId);
  
  try {
    // Inject extraction script into MAIN world (page context)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN", // Critical: Run in page context to access window.ytInitialData
      func: extractChannelNamesInPageContext
    });
    
    if (!results || results.length === 0) {
      throw new Error("No results from script execution");
    }
    
    const result = results[0].result;
    console.log("[Background] Extraction result:", result);
    
    // Store in Chrome storage
    await chrome.storage.local.set({
      youtube_subscriptions: {
        extracted: new Date().toISOString(),
        channels: result.channels,
        count: result.channels.length
      }
    });
    
    console.log("[Background] Stored in chrome.storage.local");
    
    return {
      success: true,
      count: result.channels.length,
      channels: result.channels
    };
    
  } catch (error) {
    console.error("[Background] Error during extraction:", error);
    throw error;
  }
}

// This function will be injected and run in the page context (MAIN world)
// It has access to window.ytInitialData!
function extractChannelNamesInPageContext() {
  console.log("🔍 [Injected] Extracting subscription channel names in MAIN world...");
  
  const channels = new Set();
  
  // Method 1: Extract from visible text nodes with channel handles
  try {
    const allText = document.body.innerText;
    const lines = allText.split('\n').map(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/^@[\w\.]+/)) {
        const prevLine = i > 0 ? lines[i - 1] : '';
        if (prevLine && 
            prevLine.length > 2 && 
            prevLine.length < 100 &&
            !prevLine.includes('Subscribed') &&
            !prevLine.match(/^[\d\+M K B]*$/)) {
          channels.add(prevLine);
        }
      }
    }
    console.log("✓ [Injected] Method 1 found:", channels.size);
  } catch (e) {
    console.error("[Injected] Text extraction error:", e);
  }
  
  // Method 2: DOM-based extraction
  const beforeMethod2 = channels.size;
  try {
    document.querySelectorAll('a[href*="/channel/"], a[href*="/@"]').forEach(link => {
      const text = link.textContent?.trim();
      if (text && text.length > 2 && text.length < 100 && !text.match(/^@/)) {
        channels.add(text);
      }
    });
    console.log("✓ [Injected] Method 2 added:", channels.size - beforeMethod2, "new channels (total now:", channels.size + ")");
  } catch (e) {
    console.error("[Injected] Link extraction error:", e);
  }
  
  // Method 3: Access window.ytInitialData directly (works in MAIN world!)
  const beforeMethod3 = channels.size;
  if (window.ytInitialData) {
    try {
      const json = JSON.stringify(window.ytInitialData);
      const titleMatches = json.match(/"title":\{"simpleText":"([^"]{2,100})"/g) || [];
      titleMatches.forEach(match => {
        const name = match.split('"simpleText":"')[1].split('"')[0];
        if (name && !name.match(/^@|Subscribed|Subscribe/i)) {
          channels.add(name);
        }
      });
      console.log("✓ [Injected] Method 3 added:", channels.size - beforeMethod3, "new channels (total now:", channels.size + ")");
    } catch (e) {
      console.error("[Injected] ytInitialData error:", e);
    }
  } else {
    console.warn("⚠️ [Injected] window.ytInitialData not available");
  }
  
  // Clean and filter results
  console.log("[Injected] Raw channels before filtering:", channels.size);
  const result = Array.from(channels)
    .filter(name => {
      if (name.length < 2 || name.length > 100) return false;
      if (name.match(/^[\d\s\.\-\+K M B]+$/i)) return false;
      if (name.toLowerCase().includes('subscribe') || 
          name.toLowerCase().includes('subscribed') ||
          name.includes('@')) return false;
      return true;
    })
    .sort();
  
  console.log(`✅ [Injected] Found ${result.length} subscription channel names (filtered from ${channels.size} raw)`);
  
  // Save to localStorage as well
  try {
    localStorage.setItem('youtube_subscriptions', JSON.stringify({
      extracted: new Date().toISOString(),
      channels: result,
      count: result.length
    }));
    console.log("💾 [Injected] Saved to localStorage");
  } catch (e) {
    console.warn("[Injected] Could not save to localStorage:", e);
  }
  
  return {
    success: true,
    channels: result,
    count: result.length
  };
}
