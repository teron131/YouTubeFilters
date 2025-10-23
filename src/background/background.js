// Background service worker for YouTube Filter Extension
// Handles subscription extraction using chrome.scripting API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractSubscriptions") {
    handleSubscriptionExtraction(request.tabId)
      .then(result => {
        sendResponse({ success: true, count: result.count, channels: result.channels });
      })
      .catch(error => {
        console.error("[Background] Extraction error:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
});

// Extract subscriptions by injecting script into MAIN world (page context)
async function handleSubscriptionExtraction(tabId) {
  try {
    // Inject extraction script with full access to window.ytInitialData
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN", // Critical: Runs in page context, bypasses CSP
      func: extractChannelNamesInPageContext
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
        count: result.channels.length
      }
    });
    
    return {
      success: true,
      count: result.channels.length,
      channels: result.channels
    };
    
  } catch (error) {
    console.error("[Background] Extraction failed:", error);
    throw error;
  }
}

// This function runs in page context (MAIN world) with full access to window
function extractChannelNamesInPageContext() {
  const channels = new Set();
  
  // Method 1: Extract from text nodes using @handle pattern
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
  } catch (e) {
    console.error("[Extract] Text method error:", e);
  }
  
  // Method 2: Extract from DOM links
  try {
    document.querySelectorAll('a[href*="/channel/"], a[href*="/@"]').forEach(link => {
      const text = link.textContent?.trim();
      if (text && text.length > 2 && text.length < 100 && !text.match(/^@/)) {
        channels.add(text);
      }
    });
  } catch (e) {
    console.error("[Extract] DOM method error:", e);
  }
  
  // Method 3: Extract from window.ytInitialData (most comprehensive)
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
    } catch (e) {
      console.error("[Extract] ytInitialData method error:", e);
    }
  }
  
  // Filter and clean results
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
  
  // Save to localStorage for backup
  try {
    localStorage.setItem('youtube_subscriptions', JSON.stringify({
      extracted: new Date().toISOString(),
      channels: result,
      count: result.length
    }));
  } catch (e) {
    console.warn("[Extract] localStorage save failed:", e);
  }
  
  return {
    success: true,
    channels: result,
    count: result.length
  };
}
