# YouTube Recommendation Filter

A robust Chrome extension that filters YouTube videos based on views, duration, keywords, and age.

## Features

- **View Count Filter**: Hide videos below a minimum view threshold
  - **Auto-filters Mix playlists**: Content without view counts (Mix playlists, live streams) automatically filtered
- **Duration Filter**: Filter videos by length (min/max duration)
- **Keyword Filter**: Block videos containing specific banned keywords
- **Age Filter**: Hide videos older than a specified number of years
- **Real-time Filtering**: Automatically filters new videos as you scroll (infinite scroll support)
- **Dynamic Updates**: Dual-layer detection (MutationObserver + scroll events) ensures filtering works on lazy-loaded content
- **Statistics Dashboard**: Track how many videos were filtered by each criterion

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The YouTube Filter extension will appear in your toolbar

## Usage

1. Click the extension icon to open the settings popup
2. Enable/disable filters using the checkboxes
3. Configure filter thresholds:
   - **Minimum Views**: Set the minimum number of views (e.g., 10000)
     - **Note**: Also hides Mix playlists and content without view counts
   - **Duration Range**: Set min/max duration in seconds (e.g., 60-3600 = 1 min to 60 min)
   - **Maximum Age**: Set max video age in years (e.g., 5)
   - **Keywords**: Add keywords to ban (case-insensitive)
4. Click "Save Settings" to apply
5. Browse YouTube - videos will be automatically filtered!

## For Developers

**📚 Want to understand the code?** See [`ARCHITECTURE.md`](ARCHITECTURE.md) for:
- Complete code structure breakdown (5 sections)
- Data flow diagrams
- How to add new filters
- Debugging guide

**🔧 Want to add a feature?** Follow the pattern in [`ARCHITECTURE.md`](ARCHITECTURE.md):
1. Add extraction logic (Section 2)
2. Add filter function (Section 3)
3. Add to filter array (Section 4)
4. Update settings & UI

## Technical Implementation

### Robust Data Extraction

The extension uses multiple strategies to extract video data reliably:

#### 1. **Direct DOM Access** (`content.js`)
- **Modern Layout (2025+)**: 
  - **Duration**: `badge-shape .yt-badge-shape__text` custom element
  - **Views/Time**: Regex extraction from video card `innerText`
  - No longer uses `#metadata-line` (doesn't exist on home page)
- **Extraction Method**:
  - `innerText` + regex patterns for views: `/(\d+(?:\.\d+)?[KMB]?)\s*views?/i`
  - `innerText` + regex patterns for time: `/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i`
- **Legacy Selectors**: Still supports older YouTube layouts as fallbacks
- Handles YouTube's dynamic class names and structure changes

#### 2. **YouTube Internal Data** (`youtube-data-extractor.js`)
- Accesses `ytInitialData` - YouTube's internal JSON structure
- Duration stored in: `thumbnailBadgeViewModel.text`
- Parses structured data from `lockupViewModel` and `videoRenderer` objects
- Extracts from `contentMetadataViewModel.metadataRows` for metadata
- More reliable than string matching

### Key Improvements (2025 Update)

**Before**: Used simple string matching like `textContent.includes(" views")` and DOM selectors like `#metadata-line`

**After**: 
- **Duration Extraction**: Discovered YouTube's `badge-shape` custom elements (2025 layout)
- **Metadata Extraction**: Uses `innerText` + regex instead of DOM selectors
  - Home page doesn't have `#metadata-line` or `ytd-video-meta-block`
  - Direct regex extraction is more reliable and faster
- Proper handling of "No views", "K" suffix (thousands), "M" suffix (millions), "B" (billions)
- Multiple fallback methods for maximum compatibility
- Handles both modern (2025+) and legacy YouTube layouts

### Data Structure Examples

#### JSON Data (ytInitialData)
```javascript
// YouTube stores video data like this:
{
  "lockupViewModel": {
    "contentId": "n06BLBDgbHY",  // Video ID
    "metadata": {
      "lockupMetadataViewModel": {
        "title": {
          "content": "Video Title Here"
        },
        "metadata": {
          "contentMetadataViewModel": {
            "metadataRows": [
              {
                "metadataParts": [
                  {"text": {"content": "6K views"}},
                  {"text": {"content": "24 minutes ago"}}
                ]
              }
            ]
          }
        }
      }
    }
  },
  "thumbnailBadgeViewModel": {
    "text": "12:05",  // Duration
    "badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT"
  }
}
```

#### Rendered DOM Structure
```html
<!-- Modern YouTube (2025+) renders duration as: -->
<ytd-rich-item-renderer>
  <a id="thumbnail" href="/watch?v=...">
    <yt-thumbnail-view-model>
      <yt-thumbnail-overlay-badge-view-model>
        <yt-thumbnail-badge-view-model>
          <badge-shape class="yt-badge-shape">
            <div class="yt-badge-shape__text">17:55</div>
          </badge-shape>
        </yt-thumbnail-badge-view-model>
      </yt-thumbnail-overlay-badge-view-model>
    </yt-thumbnail-view-model>
  </a>
</ytd-rich-item-renderer>
```

## File Structure

```
YouTubeFilters/
├── manifest.json              # Extension configuration
├── setting.js                 # Default settings and constants
├── content.js                 # Main filtering logic (see ARCHITECTURE.md)
├── youtube-data-extractor.js  # Advanced data extraction utilities
├── popup.html                 # Settings UI
├── popup.js                   # Settings UI logic
├── diagnostics.js             # Full diagnostic toolkit (paste in console)
├── DIAGNOSTICS_README.md      # Detailed diagnostic guide
├── QUICK_TEST.txt             # One-liner tests for quick debugging
├── ARCHITECTURE.md            # Code architecture documentation
├── icon.png                   # Extension icon
└── README.md                  # This file
```

## Configuration

Default settings (can be modified in `setting.js`):

```javascript
{
  viewsFilterEnabled: true,
  durationFilterEnabled: true,
  keywordFilterEnabled: true,
  ageFilterEnabled: true,
  minViews: 10000,
  minDuration: 60,
  maxDuration: 6000,
  maxAgeYears: 5,
  keywords: ["spoiler", "clickbait", "sponsor"]
}
```

## Debugging

The extension logs detailed information to the browser console:

```javascript
[Filter] Content script injected!
[Filter] Settings loaded: {...}
[Filter] Observer started
[Filter] Views: Hidden "Video Title" (5000 views)
[Filter] Duration: Hidden "Video Title" (0:45)
[Filter] Keyword: Hidden "Video Title" (keyword: clickbait)
[Filter] Stats updated - Total: 47
```

To view logs:
1. Open YouTube
2. Press F12 to open DevTools
3. Go to the Console tab
4. Filter by `[Filter]` to see extension activity

## Known Limitations

- Filters apply to the current page view - YouTube may load more videos as you scroll
- Some sponsored content may have different DOM structures
- YouTube's DOM structure may change, requiring updates to selectors
- Filtering happens client-side, so videos still load before being hidden

## Troubleshooting

**Videos not being filtered?**
1. Reload the extension: `chrome://extensions/` → Click refresh icon
2. Reload the YouTube page
3. Check console for errors
4. Verify settings are enabled and saved

**Popup not showing?**
1. Click the extension icon again
2. Reload the extension
3. Check if the extension has proper permissions

**"Unknown title" in logs?**
- The extension is working but couldn't extract the title
- Video will still be filtered if it matches other criteria
- This may happen on ads or special content cards

## Privacy

This extension:
- ✅ Works entirely locally in your browser
- ✅ Does not collect or transmit any data
- ✅ Does not make external network requests
- ✅ Only accesses YouTube.com pages
- ✅ Stores settings in Chrome's local storage

## Contributing

Contributions welcome! Key areas for improvement:
- Add more filter types (channel-based, language, etc.)
- Improve selector robustness for YouTube layout changes
- Add whitelist functionality
- Export/import filter settings
- Performance optimizations

## Diagnostics & Troubleshooting

When YouTube changes their layout and filters stop working, use the diagnostic toolkit:

**📁 Diagnostic Files:**
- `diagnostics.js` - Full diagnostic toolkit (paste entire file in console)
- `DIAGNOSTICS_README.md` - Detailed guide for each diagnostic function
- `QUICK_TEST.txt` - One-liner tests for quick copy-paste

### How to Use Diagnostics:

1. **Open YouTube** in Chrome
2. **Open DevTools** (F12)
3. **Go to Console tab**
4. **Copy and paste** the entire `diagnostics.js` file contents into console
5. **Run diagnostic functions:**

```javascript
// Quick check if extraction is working
quickExtractionTest()

// Find where data is located in DOM (when YouTube changes layout)
diagnosticDeepInspection()

// See what's being filtered and why
diagnosticFilterStatus()

// Test extraction on 5 videos
diagnosticExtractionTest()

// Monitor filtering during scroll
diagnosticLiveScrollTest()
```

### When YouTube Changes Layout:

1. Run `quickExtractionTest()` - identifies missing fields
2. Run `diagnosticDeepInspection()` - finds new DOM locations
3. Update selectors in `content.js` based on diagnostic output
4. Test with `diagnosticExtractionTest()` to verify fixes

**Example output:**
```
=== QUICK EXTRACTION TEST ===
📊 Extraction Results:
│ Title       │ ✅ Video Title Here
│ Duration    │ ✅ 12:05
│ Views       │ ✅ 1.2K views
│ Publish Time│ ✅ 2 hours ago

✅ ALL FIELDS EXTRACTED SUCCESSFULLY!
```

## License

MIT License - Feel free to use and modify as needed.

## Version History

### v1.0 (Current)
- Initial release
- View count, duration, keyword, and age filters
- Robust data extraction with multiple fallback strategies
- Statistics tracking
- Filtered videos history

## Credits

Built to handle YouTube's complex and frequently-changing DOM structure with maximum reliability.
