# Repo Notes

These notes are reference-only and capture the YouTube structures verified in a live Chrome DevTools MCP session on 2026-04-08.

## Home Feed

- In an anonymous session, `https://www.youtube.com/` can render an empty "Try searching to get started" state until the browser watches a public video.
- After watching a public video, Home cards were rendered as `ytd-rich-item-renderer`.
- The live Polymer data for a Home card was available on `element.data.content.lockupViewModel`.
- Verified paths from Home cards:
  - video id: `lockupViewModel.contentId`
  - title: `lockupViewModel.metadata.lockupMetadataViewModel.title.content`
  - channel / metadata rows: `lockupViewModel.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows`
  - duration badge: `lockupViewModel.contentImage.thumbnailViewModel.overlays[].thumbnailBottomOverlayViewModel.badges[].thumbnailBadgeViewModel.text`
- The Home card DOM still exposes useful fallbacks:
  - title: `#video-title`
  - metadata line: `#metadata-line`
  - duration badge text: `badge-shape .yt-badge-shape__text`

## Search Results

- Search result cards were rendered as `ytd-video-renderer`.
- The live Polymer data for a search result card was available directly on `element.data`.
- Verified fields from search cards:
  - video id: `data.videoId`
  - title: `data.title`
  - duration: `data.lengthText`
  - views: `data.viewCountText` or `data.shortViewCountText`
  - publish time: `data.publishedTimeText`
  - channel: `data.ownerText` or `data.longBylineText`
- Some search cards did not expose `[data-video-id]` in the DOM, so matching by thumbnail/watch URL is safer than relying on that attribute alone.

## DevTools References

- Home page inspected: `https://www.youtube.com/`
- Search page inspected: `https://www.youtube.com/results?search_query=javascript`
- Seed watch page used to populate anonymous Home feed: `https://www.youtube.com/watch?v=EerdGm-ehJQ`
- Google sign-in was rejected in the automated DevTools browser with the "This browser or app may not be secure" flow, so anonymous public pages are the reliable inspection path for this repo.
