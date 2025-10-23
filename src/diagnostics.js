/**
 * YouTube Filter Extension - Diagnostic Toolkit
 * 
 * Use these scripts in YouTube console to diagnose data extraction issues
 * when YouTube changes their layout.
 * 
 * HOW TO USE:
 * 1. Go to YouTube (any page with video cards)
 * 2. Open Chrome DevTools (F12)
 * 3. Copy and paste the desired diagnostic function below into the console
 * 4. Share the output with developers to fix extraction issues
 */

// ============================================================================
// DIAGNOSTIC 1: Quick Extraction Test
// Tests if all fields are being extracted correctly
// ============================================================================

function quickExtractionTest() {
  console.log("=== QUICK EXTRACTION TEST ===\n");
  
  const videos = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
  console.log(`Found ${videos.length} videos\n`);
  
  if (videos.length === 0) {
    console.log("❌ No video cards found! Are you on a YouTube page with videos?");
    return;
  }
  
  // Test first non-ad video
  let testVideo = null;
  for (const vid of videos) {
    const title = vid.querySelector('#video-title')?.textContent?.trim();
    if (title && title !== "Unknown") {
      testVideo = vid;
      break;
    }
  }
  
  if (!testVideo) {
    console.log("❌ No valid test video found (all are ads?)");
    return;
  }
  
  // Extract data
  const fullText = testVideo.innerText || "";
  const titleEl = testVideo.querySelector('#video-title, h3 a, a[title]');
  const title = titleEl?.textContent?.trim() || titleEl?.title || "❌ NOT FOUND";
  
  const badgeText = testVideo.querySelector('badge-shape .yt-badge-shape__text');
  const duration = badgeText?.textContent?.trim() || "❌ NOT FOUND";
  
  const viewMatch = fullText.match(/(\d+(?:\.\d+)?[KMB]?)\s*views?/i);
  const views = viewMatch?.[0] || "❌ NOT FOUND";
  
  const timeMatch = fullText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  const publishTime = timeMatch?.[0] || "❌ NOT FOUND";
  
  const link = testVideo.querySelector('a[href*="/watch?v="]');
  const videoId = link?.href.match(/[?&]v=([^&]+)/)?.[1] || "❌ NOT FOUND";
  
  // Display results
  console.log("📊 Extraction Results:");
  console.log("┌─────────────┬──────────────────────────────────────────┐");
  console.log("│ Field       │ Value                                    │");
  console.log("├─────────────┼──────────────────────────────────────────┤");
  console.log(`│ Title       │ ${(title.substring(0, 40)).padEnd(40)} │`);
  console.log(`│ Video ID    │ ${(videoId).padEnd(40)} │`);
  console.log(`│ Duration    │ ${(duration).padEnd(40)} │`);
  console.log(`│ Views       │ ${(views).padEnd(40)} │`);
  console.log(`│ Publish Time│ ${(publishTime).padEnd(40)} │`);
  console.log("└─────────────┴──────────────────────────────────────────┘");
  
  const allFound = ![title, videoId, duration, views, publishTime].includes("❌ NOT FOUND");
  
  if (allFound) {
    console.log("\n✅ ALL FIELDS EXTRACTED SUCCESSFULLY!");
  } else {
    console.log("\n⚠️ SOME FIELDS MISSING - YouTube layout may have changed!");
    console.log("\n💡 Next steps:");
    console.log("   1. Run diagnosticDeepInspection() to find new selectors");
    console.log("   2. Check console logs for errors");
    console.log("   3. Share this output with developers");
  }
}


// ============================================================================
// DIAGNOSTIC 2: Deep Inspection
// Finds where data is actually located in the DOM
// ============================================================================

function diagnosticDeepInspection() {
  console.log("=== DEEP DOM INSPECTION ===\n");
  
  const videos = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
  if (videos.length === 0) {
    console.log("❌ No videos found");
    return;
  }
  
  const video = videos[1] || videos[0]; // Skip first (might be ad)
  console.log("Inspecting video element:", video);
  
  // 1. Find duration
  console.log("\n1️⃣ DURATION SEARCH:");
  console.log("   Trying badge-shape selector...");
  const badgeShape = video.querySelector('badge-shape .yt-badge-shape__text');
  if (badgeShape) {
    console.log(`   ✅ Found in: badge-shape .yt-badge-shape__text`);
    console.log(`   Value: "${badgeShape.textContent.trim()}"`);
  } else {
    console.log("   ❌ badge-shape not found, searching all elements...");
    const allElements = video.querySelectorAll('*');
    let found = false;
    for (const el of allElements) {
      const text = el.textContent?.trim();
      if (text && text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
        console.log(`   ✅ Found in: <${el.tagName} class="${el.className}" id="${el.id}">`);
        console.log(`   Value: "${text}"`);
        console.log(`   Parent: <${el.parentElement?.tagName}>`);
        found = true;
        break;
      }
    }
    if (!found) console.log("   ❌ Duration not found anywhere");
  }
  
  // 2. Find views and time
  console.log("\n2️⃣ VIEWS & TIME SEARCH:");
  const fullText = video.innerText || "";
  console.log(`   Full innerText (first 200 chars): "${fullText.substring(0, 200)}"`);
  
  const viewMatch = fullText.match(/(\d+(?:\.\d+)?[KMB]?)\s*views?/i);
  console.log(`   Views regex match: ${viewMatch ? '✅ "' + viewMatch[0] + '"' : '❌ Not found'}`);
  
  const timeMatch = fullText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  console.log(`   Time regex match: ${timeMatch ? '✅ "' + timeMatch[0] + '"' : '❌ Not found'}`);
  
  // 3. Check metadata elements
  console.log("\n3️⃣ METADATA ELEMENTS:");
  const metadataLine = video.querySelector('#metadata-line');
  console.log(`   #metadata-line: ${metadataLine ? '✅ Exists' : '❌ Not found'}`);
  
  const metaBlock = video.querySelector('ytd-video-meta-block');
  console.log(`   ytd-video-meta-block: ${metaBlock ? '✅ Exists' : '❌ Not found'}`);
  
  // 4. List all spans with content
  console.log("\n4️⃣ ALL SPANS WITH CONTENT:");
  const spans = video.querySelectorAll('span');
  let spanCount = 0;
  spans.forEach((span) => {
    const text = span.textContent?.trim();
    if (text && text.length < 100) {
      spanCount++;
      if (spanCount <= 10) { // Show first 10
        console.log(`   ${spanCount}. "${text}" | class="${span.className.substring(0, 30)}"`);
      }
    }
  });
  console.log(`   ... ${spans.length} total spans found`);
  
  console.log("\n💡 Use this information to update selectors in src/content/main.js");
}


// ============================================================================
// DIAGNOSTIC 3: Filter Status Check
// Shows what's being filtered and why
// ============================================================================

function diagnosticFilterStatus() {
  console.log("=== FILTER STATUS CHECK ===\n");
  
  const videos = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
  const filtered = document.querySelectorAll('[data-filtered="true"]');
  const visible = videos.length - filtered.length;
  
  console.log(`📊 Summary:`);
  console.log(`   Total videos: ${videos.length}`);
  console.log(`   ✅ Visible: ${visible}`);
  console.log(`   🚫 Filtered: ${filtered.length}`);
  
  if (filtered.length === 0) {
    console.log("\n💡 No videos filtered. Check:");
    console.log("   1. Are filters enabled in extension popup?");
    console.log("   2. Check browser console for [Filter] logs");
    return;
  }
  
  // Group by reason
  const reasons = {};
  filtered.forEach((vid) => {
    const reason = vid.getAttribute('data-filter-reason') || 'unknown';
    reasons[reason] = (reasons[reason] || 0) + 1;
  });
  
  console.log(`\n🚫 Filtered by reason:`);
  Object.entries(reasons).forEach(([reason, count]) => {
    console.log(`   ${reason}: ${count}`);
  });
  
  console.log(`\n📝 Sample filtered videos (first 5):`);
  let count = 0;
  filtered.forEach((vid) => {
    if (count >= 5) return;
    const title = vid.querySelector('#video-title')?.textContent?.trim() || "Unknown";
    const reason = vid.getAttribute('data-filter-reason');
    console.log(`   ${count + 1}. "${title.substring(0, 50)}" - Reason: ${reason}`);
    count++;
  });
}


// ============================================================================
// DIAGNOSTIC 4: Extraction Comparison Test
// Tests first 5 videos and shows extraction success rate
// ============================================================================

function diagnosticExtractionTest() {
  console.log("=== EXTRACTION TEST (5 VIDEOS) ===\n");
  
  const videos = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer');
  console.log(`Found ${videos.length} videos\n`);
  
  let successCount = 0;
  let testCount = 0;
  
  for (let i = 0; i < Math.min(5, videos.length); i++) {
    const vid = videos[i];
    const titleEl = vid.querySelector('#video-title, h3 a, a[title]');
    const title = titleEl?.textContent?.trim() || titleEl?.title;
    
    // Skip ads
    if (!title || title === "Unknown") continue;
    
    testCount++;
    
    const fullText = vid.innerText || "";
    const badgeText = vid.querySelector('badge-shape .yt-badge-shape__text');
    const duration = badgeText?.textContent?.trim();
    const viewMatch = fullText.match(/(\d+(?:\.\d+)?[KMB]?)\s*views?/i);
    const views = viewMatch?.[0];
    const timeMatch = fullText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
    const publishTime = timeMatch?.[0];
    
    const allFound = title && duration && views && publishTime;
    if (allFound) successCount++;
    
    console.log(`Video ${testCount}: ${allFound ? '✅' : '❌'}`);
    console.log(`  Title: ${title ? '✅' : '❌'} "${title?.substring(0, 40)}"`);
    console.log(`  Duration: ${duration ? '✅' : '❌'} "${duration}"`);
    console.log(`  Views: ${views ? '✅' : '❌'} "${views}"`);
    console.log(`  Time: ${publishTime ? '✅' : '❌'} "${publishTime}"\n`);
  }
  
  const rate = testCount > 0 ? Math.round((successCount / testCount) * 100) : 0;
  console.log(`📊 Success Rate: ${successCount}/${testCount} (${rate}%)`);
  
  if (rate >= 80) {
    console.log("✅ Extraction working well!");
  } else if (rate >= 50) {
    console.log("⚠️ Partial extraction - some fields missing");
  } else {
    console.log("❌ Extraction failing - YouTube layout changed!");
    console.log("💡 Run diagnosticDeepInspection() to find new selectors");
  }
}


// ============================================================================
// DIAGNOSTIC 5: Live Scroll Test
// Monitors filter activity during scrolling
// ============================================================================

function diagnosticLiveScrollTest() {
  console.log("=== LIVE SCROLL TEST ===");
  console.log("Monitoring filter activity... (scroll down to test)\n");
  
  let lastCount = 0;
  const interval = setInterval(() => {
    const filtered = document.querySelectorAll('[data-filtered="true"]').length;
    const visible = document.querySelectorAll('ytd-rich-item-renderer:not([data-filtered="true"])').length;
    const total = filtered + visible;
    
    if (total !== lastCount) {
      console.log(`[${new Date().toLocaleTimeString()}] Total: ${total} | ✅ Visible: ${visible} | 🚫 Filtered: ${filtered}`);
      lastCount = total;
    }
  }, 1000);
  
  console.log("💡 Scroll down to load more videos");
  console.log("💡 Watch for count changes (means filters are running)");
  console.log("💡 To stop: clearInterval() or refresh page");
  
  // Auto-stop after 60 seconds
  setTimeout(() => {
    clearInterval(interval);
    console.log("\n⏱️ Test ended after 60 seconds");
  }, 60000);
  
  return interval;
}


// ============================================================================
// QUICK START GUIDE
// ============================================================================

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              YouTube Filter Extension - Diagnostics Loaded             ║
╚════════════════════════════════════════════════════════════════════════╝

Available diagnostic functions:

1️⃣  quickExtractionTest()
   → Quick check if data extraction is working
   → START HERE if filters aren't working

2️⃣  diagnosticDeepInspection()
   → Find where data is located in DOM
   → Use when YouTube layout changes

3️⃣  diagnosticFilterStatus()
   → See what's filtered and why
   → Check if filters are active

4️⃣  diagnosticExtractionTest()
   → Test extraction on 5 videos
   → Get success rate percentage

5️⃣  diagnosticLiveScrollTest()
   → Monitor filtering during scroll
   → Verify infinite scroll filtering

Usage: Just type the function name and press Enter
Example: quickExtractionTest()

═══════════════════════════════════════════════════════════════════════
`);

