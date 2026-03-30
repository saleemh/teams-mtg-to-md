(function installTeamsTranscriptInterceptor() {
  if (window.__teamsTranscriptExporterInstalled) {
    return;
  }

  window.__teamsTranscriptExporterInstalled = true;

  function looksLikeTranscript(url) {
    return typeof url === "string" && /streamcontent|transcript/i.test(url);
  }

  function postTranscript(json, url, transport) {
    if (!json || json.type !== "Transcript" || !Array.isArray(json.entries)) {
      return;
    }

    window.postMessage(
      {
        source: "teams-transcript-exporter",
        type: "TEAMS_TRANSCRIPT_INTERCEPTED",
        url,
        transport,
        data: json
      },
      "*"
    );
  }

  async function inspectJsonResponse(response, url, transport) {
    if (!looksLikeTranscript(url) || !response) {
      return;
    }

    try {
      const clone = response.clone();
      const json = await clone.json();
      postTranscript(json, url, transport);
    } catch (_) {
      // Ignore non-JSON and unrelated responses.
    }
  }

  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(...args) {
    const response = await originalFetch.apply(this, args);
    const request = args[0];
    const url =
      typeof request === "string"
        ? request
        : request && typeof request.url === "string"
          ? request.url
          : "";

    inspectJsonResponse(response, url, "fetch");
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__teamsTranscriptUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    this.addEventListener("load", function onLoad() {
      if (!looksLikeTranscript(this.__teamsTranscriptUrl)) {
        return;
      }

      try {
        if (typeof this.responseText !== "string" || !this.responseText.trim()) {
          return;
        }

        const json = JSON.parse(this.responseText);
        postTranscript(json, this.__teamsTranscriptUrl, "xhr");
      } catch (_) {
        // Ignore non-JSON and unrelated responses.
      }
    });

    return originalSend.apply(this, args);
  };
})();
