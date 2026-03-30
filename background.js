const STORAGE_PREFIX = "transcript_";

function getStorageKey(tabId) {
  return `${STORAGE_PREFIX}${tabId}`;
}

async function storeTranscript(tabId, payload) {
  await chrome.storage.local.set({
    [getStorageKey(tabId)]: {
      ...payload,
      storedAt: new Date().toISOString()
    }
  });

  await chrome.action.setBadgeText({ text: "✓", tabId });
  await chrome.action.setBadgeBackgroundColor({ color: "#0f9d8a", tabId });
}

async function clearTranscript(tabId) {
  await chrome.storage.local.remove(getStorageKey(tabId));
  await chrome.action.setBadgeText({ text: "", tabId });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TRANSCRIPT_CAPTURED") {
    const tabId = sender.tab?.id;

    if (!tabId || !message.data?.entries) {
      sendResponse({ success: false, error: "Missing transcript payload." });
      return false;
    }

    storeTranscript(tabId, {
      transcript: message.data,
      pageTitle: message.pageTitle || sender.tab?.title || "Untitled Meeting",
      pageUrl: message.pageUrl || sender.tab?.url || "",
      capturedAt: message.capturedAt || new Date().toISOString(),
      source: message.source || "network"
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message?.type === "DOWNLOAD_TRANSCRIPT") {
    const markdown = typeof message.markdown === "string" ? message.markdown : "";
    const filename = message.filename || "transcript.md";

    chrome.downloads.download(
      {
        url: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
        filename,
        saveAs: true
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        sendResponse({ success: true, downloadId });
      }
    );

    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTranscript(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearTranscript(tabId).catch(() => {});
  }
});
