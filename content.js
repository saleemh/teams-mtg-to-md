let interceptorInjected = false;

function injectInterceptor() {
  if (interceptorInjected || !document.documentElement) {
    return;
  }

  interceptorInjected = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-interceptor.js");
  script.dataset.teamsTranscriptExporter = "true";
  script.onload = () => script.remove();
  (document.head || document.documentElement).prepend(script);
}

function normalizeDomText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function parseDomNode(node, index) {
  const rawText = node.innerText || node.textContent || "";
  const text = normalizeDomText(rawText);

  if (!text) {
    return null;
  }

  const timedSpeakerMatch = text.match(
    /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.+?):\s+(.+)$/s
  );

  if (timedSpeakerMatch) {
    const [, timestamp, speaker, body] = timedSpeakerMatch;
    return {
      id: `dom-${index}`,
      text: normalizeDomText(body),
      speakerDisplayName: normalizeDomText(speaker) || "Unknown Speaker",
      speakerId: null,
      confidence: null,
      startOffset: timestamp.length === 5 ? `00:${timestamp}.0000000` : `${timestamp}.0000000`,
      endOffset: null,
      hasBeenEdited: false,
      spokenLanguageTag: null
    };
  }

  const lines = rawText
    .split("\n")
    .map((line) => normalizeDomText(line))
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      id: `dom-${index}`,
      text: lines.slice(1).join(" "),
      speakerDisplayName: lines[0] || "Unknown Speaker",
      speakerId: null,
      confidence: null,
      startOffset: null,
      endOffset: null,
      hasBeenEdited: false,
      spokenLanguageTag: null
    };
  }

  return {
    id: `dom-${index}`,
    text,
    speakerDisplayName: "Unknown Speaker",
    speakerId: null,
    confidence: null,
    startOffset: null,
    endOffset: null,
    hasBeenEdited: false,
    spokenLanguageTag: null
  };
}

function scrapeTranscriptFromDOM() {
  const selectorGroups = [
    '[class*="transcript"] [role="listitem"]',
    '[data-tid="closed-caption-text"]',
    '[class*="caption-line"]',
    '[class*="transcriptText"]',
    '[class*="transcript"] span'
  ];

  for (const selector of selectorGroups) {
    const elements = Array.from(document.querySelectorAll(selector)).filter(
      (element) => normalizeDomText(element.innerText || element.textContent || "").length > 0
    );

    if (!elements.length) {
      continue;
    }

    const entries = elements
      .map((element, index) => parseDomNode(element, index))
      .filter((entry) => entry && entry.text);

    if (entries.length) {
      return {
        type: "Transcript",
        version: "1.0.0",
        entries,
        events: []
      };
    }
  }

  return null;
}

function sendTranscriptToBackground(data, source) {
  return chrome.runtime.sendMessage({
    type: "TRANSCRIPT_CAPTURED",
    data,
    source,
    pageTitle: document.title,
    pageUrl: window.location.href,
    capturedAt: new Date().toISOString()
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  if (
    event.data?.source === "teams-transcript-exporter" &&
    event.data?.type === "TEAMS_TRANSCRIPT_INTERCEPTED"
  ) {
    sendTranscriptToBackground(event.data.data, "network").catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCRAPE_TRANSCRIPT") {
    return false;
  }

  const transcript = scrapeTranscriptFromDOM();

  if (!transcript) {
    sendResponse({ success: false, error: "No transcript-like DOM content found." });
    return false;
  }

  sendTranscriptToBackground(transcript, "dom-scrape")
    .then(() => sendResponse({ success: true, transcript }))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  return true;
});

injectInterceptor();

if (document.readyState === "loading") {
  document.addEventListener("readystatechange", injectInterceptor, { once: true });
}
