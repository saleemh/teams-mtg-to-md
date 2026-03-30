# Teams Transcript Exporter

## Overview
Teams Transcript Exporter is a Chrome extension for side-loaded developer-mode use that captures transcript data from Microsoft Teams meeting recordings in the SharePoint Stream player and saves the transcript as a clean Markdown file.

## Installation
1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select this extension folder.
5. Pin the extension to the toolbar for quick access.

## Usage
1. Navigate to a Teams meeting recording in Chrome using the SharePoint Stream player.
2. Wait for the transcript panel or transcript data to load.
3. Watch for the extension badge to show `✓` when a transcript is captured.
4. Click the extension icon.
5. Configure the export options for grouping, timestamps, metadata, and filler cleanup.
6. Click **Save as Markdown**.

## Output Format
Example grouped Markdown output:

```markdown
# Example Meeting

**Date:** March 25, 2026
**Duration:** 29 minutes, 18 seconds
**Speakers:** Speaker One, Speaker Two
**Exported:** March 30, 2026, 10:53 AM

---

## Speaker One - 00:03:10

All right. Thank you all for joining.

## Speaker Two - 00:03:24

Just to clarify on the invite, I have a Teams calendar invite for this.
```

## Troubleshooting
- **No transcript detected:** Refresh the recording page, make sure the transcript panel is visible, wait for it to load, then open the popup again.
- **Transcript not captured:** The transcript may have loaded before the extension interceptor was active. Click **Try DOM Scrape** in the popup or refresh the page.
- **Extension not appearing:** Verify the extension is loaded and enabled in `chrome://extensions/`.

## Development
Edit the extension files in this repository, then return to `chrome://extensions/` and click the refresh icon on the extension card to reload the latest changes.

## Limitations
- Only works with the SharePoint Stream player in Chrome, not the Teams desktop app.
- Requires the recording transcript to be available.
- Designed for recorded meetings; live meeting transcript behavior is not a target for this version.

## Testing Checklist
- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] Content script injects on SharePoint Stream pages
- [ ] Fetch interceptor captures `streamContent` response
- [ ] Badge shows `✓` after transcript is captured
- [ ] Popup displays the correct speaker count and duration
- [ ] Grouped mode merges consecutive same-speaker entries
- [ ] Individual mode shows one entry per line
- [ ] Timestamps display correctly in both modes
- [ ] Metadata header includes the expected date, duration, and speaker list
- [ ] Filename follows the `YYYY-MM-DD_Title_transcript.md` pattern
- [ ] File downloads successfully through `chrome.downloads`
- [ ] DOM scrape fallback works when interception misses
- [ ] Multiple recording tabs behave independently
- [ ] No console errors appear on unrelated pages
- [ ] Stored transcript data clears when a tab closes
