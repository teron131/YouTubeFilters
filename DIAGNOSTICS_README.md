# Diagnostic Toolkit - Quick Reference

## 🚨 When to Use

Use diagnostics when:
- Videos aren't being filtered
- Extension logs show extraction errors
- YouTube updates their layout
- Filter statistics show 0 filtered videos

## 🔧 Quick Start

1. Open YouTube
2. Open Chrome DevTools (F12) → Console tab
3. Copy **entire** `diagnostics.js` file
4. Paste into console and press Enter
5. Run any diagnostic function

## 📋 Available Functions

### 1. `quickExtractionTest()`
**Purpose:** Quick health check  
**When:** First thing to run when filters stop working  
**Shows:** Whether title, duration, views, time are being extracted  

```javascript
quickExtractionTest()
// Output:
// ✅ ALL FIELDS EXTRACTED SUCCESSFULLY!
// or
// ⚠️ SOME FIELDS MISSING - YouTube layout may have changed!
```

---

### 2. `diagnosticDeepInspection()`
**Purpose:** Find where data is located in DOM  
**When:** YouTube changed layout, need to update selectors  
**Shows:** Exact element paths and classes where data lives  

```javascript
diagnosticDeepInspection()
// Output:
// ✅ Found in: badge-shape .yt-badge-shape__text
// ✅ Found in: <SPAN class="..." id="...">
```

---

### 3. `diagnosticFilterStatus()`
**Purpose:** See what's being filtered  
**When:** Filters seem inactive or over-aggressive  
**Shows:** Filtered count, reasons, sample titles  

```javascript
diagnosticFilterStatus()
// Output:
// 🚫 Filtered by reason:
//    views: 14
//    duration: 3
//    no-views: 2
```

---

### 4. `diagnosticExtractionTest()`
**Purpose:** Test extraction success rate  
**When:** Want quantitative measure of extraction health  
**Shows:** Success rate percentage on 5 videos  

```javascript
diagnosticExtractionTest()
// Output:
// 📊 Success Rate: 5/5 (100%)
// ✅ Extraction working well!
```

---

### 5. `diagnosticLiveScrollTest()`
**Purpose:** Monitor filtering during scroll  
**When:** Testing infinite scroll filtering  
**Shows:** Real-time count updates as you scroll  

```javascript
diagnosticLiveScrollTest()
// Output (live updates):
// [10:23:45] Total: 36 | ✅ Visible: 22 | 🚫 Filtered: 14
// [10:23:48] Total: 48 | ✅ Visible: 30 | 🚫 Filtered: 18
```

---

## 🔍 Troubleshooting Workflow

### Problem: No videos being filtered

```javascript
// 1. Check if extension is running
diagnosticFilterStatus()
// If shows "0 filtered" → filters not active

// 2. Check if extraction works
quickExtractionTest()
// If fields missing → YouTube layout changed

// 3. Find new selectors
diagnosticDeepInspection()
// Use output to update content.js selectors
```

### Problem: YouTube layout changed

```javascript
// 1. Identify what's broken
quickExtractionTest()
// Example output: Duration: ❌ NOT FOUND

// 2. Find where duration moved to
diagnosticDeepInspection()
// Look in "DURATION SEARCH" section
// Example: "Found in: <SPAN class="new-duration-class">"

// 3. Update content.js with new selector
// Old: querySelector('badge-shape .yt-badge-shape__text')
// New: querySelector('.new-duration-class')

// 4. Verify fix
quickExtractionTest()
// Should show: Duration: ✅ 12:05
```

### Problem: Filtering stops after scrolling

```javascript
// Monitor scroll filtering in real-time
diagnosticLiveScrollTest()
// Scroll down slowly
// Watch console for count increases
// If no increases → MutationObserver not firing
```

---

## 💡 Tips

- **Always start with `quickExtractionTest()`** - fastest diagnosis
- **Share diagnostic output** when reporting issues
- **Run diagnostics after YouTube updates** to catch breaking changes early
- **Use `diagnosticDeepInspection()`** output to update selectors in `content.js`

---

## 📝 Example: Fixing Duration Extraction

```javascript
// 1. Discover duration is broken
quickExtractionTest()
// Duration: ❌ NOT FOUND

// 2. Find where it is
diagnosticDeepInspection()
// Output: ✅ Found in: <DIV class="time-badge" id="duration-text">

// 3. Update content.js
// Find this section:
const durationSelectors = [
  "badge-shape .yt-badge-shape__text",
  // Add new selector here:
  ".time-badge #duration-text",
  // ...
];

// 4. Reload extension and verify
quickExtractionTest()
// Duration: ✅ 12:05
```

---

## 🎯 Quick Reference Card

| Function | Use When | Time | Output |
|----------|----------|------|--------|
| `quickExtractionTest()` | Filters not working | 5 sec | ✅/❌ per field |
| `diagnosticDeepInspection()` | Need to update selectors | 10 sec | Element paths |
| `diagnosticFilterStatus()` | Check what's filtered | 5 sec | Counts + samples |
| `diagnosticExtractionTest()` | Measure health | 10 sec | Success % |
| `diagnosticLiveScrollTest()` | Test scroll filtering | 60 sec | Real-time counts |

---

**Pro Tip:** Keep `diagnostics.js` handy - YouTube changes their layout frequently!

