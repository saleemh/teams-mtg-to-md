const statusEl = document.getElementById("status");
const optionsEl = document.getElementById("options");
const summaryEl = document.getElementById("summary");
const fallbackActionsEl = document.getElementById("fallbackActions");
const saveBtn = document.getElementById("saveBtn");
const scrapeBtn = document.getElementById("scrapeBtn");

const controls = {
  groupSpeakers: document.getElementById("groupSpeakers"),
  includeTimestamps: document.getElementById("includeTimestamps"),
  compactTimestamps: document.getElementById("compactTimestamps"),
  includeMetadata: document.getElementById("includeMetadata"),
  removeFillers: document.getElementById("removeFillers")
};

let activeTab = null;
let currentRecord = null;

function storageKey(tabId) {
  return `transcript_${tabId}`;
}

function setStatus(message, variant = "") {
  statusEl.textContent = message;
  statusEl.className = variant ? `status ${variant}` : "status";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeEntry(entry, index) {
  const text = typeof entry?.text === "string" ? entry.text.replace(/\s+/g, " ").trim() : "";

  if (!text) {
    return null;
  }

  return {
    id: entry.id || `entry-${index}`,
    text,
    speakerDisplayName:
      typeof entry.speakerDisplayName === "string" && entry.speakerDisplayName.trim()
        ? entry.speakerDisplayName.trim()
        : "Unknown Speaker",
    speakerId: entry.speakerId || null,
    confidence: typeof entry.confidence === "number" ? entry.confidence : null,
    startOffset: typeof entry.startOffset === "string" ? entry.startOffset : null,
    endOffset: typeof entry.endOffset === "string" ? entry.endOffset : null,
    spokenLanguageTag: entry.spokenLanguageTag || null,
    hasBeenEdited: Boolean(entry.hasBeenEdited)
  };
}

function parseOffsetToSeconds(offset) {
  if (!offset || typeof offset !== "string") {
    return null;
  }

  const match = offset.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);

  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds, fraction = "0"] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(`0.${fraction}`)
  );
}

function formatClock(seconds, compactWhenZeroHour) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) {
    return "";
  }

  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  if (compactWhenZeroHour && hours === 0) {
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(secs).padStart(2, "0")
  ].join(":");
}

function formatOffset(offset, compactWhenZeroHour) {
  const seconds = parseOffsetToSeconds(offset);
  if (seconds === null) {
    return "";
  }

  return formatClock(seconds, compactWhenZeroHour);
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "Unknown";
  }

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }

  if (minutes) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }

  if (!parts.length || secs) {
    parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  }

  return parts.join(", ");
}

function formatDate(dateLike, options = {}) {
  const date = new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function collectEntries(record, options = {}) {
  const removeFillers = Boolean(options.removeFillers);
  const fillerPattern = /^(uh|um|ah|hmm|mhm)\.?$/i;
  const entries = Array.isArray(record?.transcript?.entries) ? record.transcript.entries : [];

  return entries
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => {
      if (!removeFillers) {
        return true;
      }

      return !(entry.confidence !== null && entry.confidence < 0.3 && fillerPattern.test(entry.text));
    });
}

function summarizeTranscript(record, options = {}) {
  const entries = collectEntries(record, options);
  const speakers = [];
  const seenSpeakers = new Set();
  let earliest = null;
  let latest = null;

  for (const entry of entries) {
    if (!seenSpeakers.has(entry.speakerDisplayName)) {
      seenSpeakers.add(entry.speakerDisplayName);
      speakers.push(entry.speakerDisplayName);
    }

    const start = parseOffsetToSeconds(entry.startOffset);
    const end = parseOffsetToSeconds(entry.endOffset);

    if (start !== null && (earliest === null || start < earliest)) {
      earliest = start;
    }

    const latestCandidate = end ?? start;
    if (latestCandidate !== null && (latest === null || latestCandidate > latest)) {
      latest = latestCandidate;
    }
  }

  return {
    title: inferMeetingTitle(record),
    entries,
    speakers,
    durationSeconds:
      earliest !== null && latest !== null && latest >= earliest ? latest - earliest : null,
    entryCount: entries.length
  };
}

function inferMeetingTitle(record) {
  const rawTitle =
    (record?.pageTitle || "").replace(/\s*[-|]\s*(Microsoft Stream|SharePoint)$/i, "").trim() ||
    "Untitled Meeting";

  return rawTitle;
}

function extractDateFromTitle(title) {
  const isoMatch = title.match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const longDateMatch = title.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/i
  );

  if (longDateMatch) {
    return new Date(`${longDateMatch[1]} ${longDateMatch[2]}, ${longDateMatch[3]}`);
  }

  return null;
}

function sanitizeFilenamePart(value) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || "meeting";
}

function buildFilename(record) {
  const title = inferMeetingTitle(record);
  const explicitDate = extractDateFromTitle(title);
  const fallbackDate = record?.capturedAt ? new Date(record.capturedAt) : new Date();
  const date = explicitDate && !Number.isNaN(explicitDate.getTime()) ? explicitDate : fallbackDate;
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");

  return `${datePart}_${sanitizeFilenamePart(title)}_transcript.md`;
}

function buildGroupedBlocks(entries, options) {
  const blocks = [];

  for (const entry of entries) {
    const current = blocks[blocks.length - 1];

    if (current && current.speakerDisplayName === entry.speakerDisplayName) {
      current.text += ` ${entry.text}`;
      if (!current.startOffset && entry.startOffset) {
        current.startOffset = entry.startOffset;
      }
      continue;
    }

    blocks.push({
      speakerDisplayName: entry.speakerDisplayName,
      startOffset: entry.startOffset,
      text: entry.text
    });
  }

  return blocks
    .map((block) => {
      const timestamp =
        options.includeTimestamps && block.startOffset
          ? ` - ${formatOffset(block.startOffset, options.compactTimestamps)}`
          : "";

      return `## ${block.speakerDisplayName}${timestamp}\n\n${block.text}`;
    })
    .join("\n\n");
}

function buildIndividualBlocks(entries, options) {
  return entries
    .map((entry) => {
      const timestamp =
        options.includeTimestamps && entry.startOffset
          ? `[${formatOffset(entry.startOffset, options.compactTimestamps)}] `
          : "";

      return `**${timestamp}${entry.speakerDisplayName}:** ${entry.text}`;
    })
    .join("\n\n");
}

function buildMetadata(record, summary) {
  const meetingDate =
    extractDateFromTitle(summary.title) ||
    (record?.capturedAt ? new Date(record.capturedAt) : new Date());
  const exportedAt = new Date();

  return [
    `# ${summary.title}`,
    "",
    `**Date:** ${formatDate(meetingDate, {
      year: "numeric",
      month: "long",
      day: "numeric"
    })}`,
    `**Duration:** ${formatDuration(summary.durationSeconds)}`,
    `**Speakers:** ${summary.speakers.join(", ") || "Unknown Speaker"}`,
    `**Exported:** ${formatDate(exportedAt, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })}`,
    "",
    "---"
  ].join("\n");
}

function buildMarkdown(record, options) {
  const summary = summarizeTranscript(record, options);
  const body = options.groupSpeakers
    ? buildGroupedBlocks(summary.entries, options)
    : buildIndividualBlocks(summary.entries, options);

  if (!body.trim()) {
    return "";
  }

  return options.includeMetadata
    ? `${buildMetadata(record, summary)}\n\n${body}\n`
    : `${body}\n`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getStoredRecord(tabId) {
  const key = storageKey(tabId);
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

function renderSummary(record) {
  const summary = summarizeTranscript(record, {
    removeFillers: controls.removeFillers.checked
  });

  summaryEl.innerHTML = `
    <h2>${escapeHtml(summary.title)}</h2>
    <p><strong>Source:</strong> ${escapeHtml(record.source || "network")}</p>
    <p><strong>Entries:</strong> ${summary.entryCount}</p>
    <p><strong>Speakers:</strong> ${escapeHtml(summary.speakers.join(", ") || "Unknown Speaker")}</p>
    <p><strong>Duration:</strong> ${escapeHtml(formatDuration(summary.durationSeconds))}</p>
  `;

  optionsEl.hidden = false;
  fallbackActionsEl.hidden = true;
  setStatus("Transcript ready to export.", "success");
}

function renderEmptyState(tab) {
  const onSupportedPage = /^https:\/\/[^/]+\.sharepoint\.com\//i.test(tab?.url || "");

  optionsEl.hidden = true;
  fallbackActionsEl.hidden = !onSupportedPage;

  if (!onSupportedPage) {
    setStatus("Open a Microsoft Teams recording in the SharePoint Stream player, then try again.");
    return;
  }

  setStatus(
    "No transcript found on this page. Wait for the transcript panel to load, then reopen this popup or try a DOM scrape."
  );
}

async function refreshState() {
  activeTab = await getActiveTab();

  if (!activeTab?.id) {
    renderEmptyState(activeTab);
    return;
  }

  currentRecord = await getStoredRecord(activeTab.id);

  if (!currentRecord) {
    renderEmptyState(activeTab);
    return;
  }

  renderSummary(currentRecord);
}

async function tryDomScrape() {
  if (!activeTab?.id) {
    return;
  }

  setStatus("Trying transcript DOM scrape...", "");

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "SCRAPE_TRANSCRIPT"
    });

    if (!response?.success) {
      throw new Error(response?.error || "DOM scrape failed.");
    }

    currentRecord = await getStoredRecord(activeTab.id);

    if (!currentRecord) {
      throw new Error("Transcript was scraped but not stored.");
    }

    renderSummary(currentRecord);
  } catch (error) {
    setStatus(`Transcript not captured. ${error.message}`, "error");
    fallbackActionsEl.hidden = false;
  }
}

async function saveTranscript() {
  if (!currentRecord) {
    setStatus("No transcript is available to export.", "error");
    return;
  }

  const options = {
    groupSpeakers: controls.groupSpeakers.checked,
    includeTimestamps: controls.includeTimestamps.checked,
    compactTimestamps: controls.compactTimestamps.checked,
    includeMetadata: controls.includeMetadata.checked,
    removeFillers: controls.removeFillers.checked
  };
  const markdown = buildMarkdown(currentRecord, options);

  if (!markdown.trim()) {
    setStatus("Transcript has no exportable text after filtering.", "error");
    return;
  }

  setStatus("Preparing Markdown download...", "");

  const response = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_TRANSCRIPT",
    markdown,
    filename: buildFilename(currentRecord)
  });

  if (!response?.success) {
    setStatus(`Download failed. ${response?.error || "Unknown error."}`, "error");
    return;
  }

  setStatus("Transcript saved.", "success");
}

for (const control of Object.values(controls)) {
  control.addEventListener("change", () => {
    if (currentRecord) {
      renderSummary(currentRecord);
    }
  });
}

saveBtn.addEventListener("click", saveTranscript);
scrapeBtn.addEventListener("click", tryDomScrape);

refreshState().catch((error) => {
  setStatus(`Unable to load popup state. ${error.message}`, "error");
});
