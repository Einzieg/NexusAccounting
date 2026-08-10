// Receives API requests from the extension background and executes them from
// the logged-in game origin. Keeping this bridge independent lets the
// background inject it into game tabs that were already open when an unpacked
// extension was installed or reloaded.
(function installNexusGameApiBridge() {
  'use strict';

  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
  const runtime = extensionApi.runtime;

  function normalizeRetreatThreshold(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ratio = n > 1 ? n / 100 : n;
    return Math.min(1, Math.max(0.01, ratio));
  }

  function normalizeGameFetchBody(msg) {
    const body = msg.body;
    if (!body || typeof body !== 'object') return body;
    const path = String(msg.path || '');
    if (!/\/api\/fleet\/mine$/.test(path) && !/\/fleet\/mine$/.test(path)) return body;

    const out = { ...body };
    const last = globalThis.__nxLastMineAttachLeader;
    const sameRecentMine = last &&
      Number(out.targetFieldId) === Number(last.targetFieldId) &&
      Date.now() - last.at < 60000;
    if (!Object.prototype.hasOwnProperty.call(out, 'attachLeader')) {
      out.attachLeader = sameRecentMine ? !!last.attachLeader : !!msg.attachLeader;
    }
    if (Object.prototype.hasOwnProperty.call(out, 'escortRetreatThreshold')) {
      const threshold = normalizeRetreatThreshold(out.escortRetreatThreshold);
      if (threshold == null) delete out.escortRetreatThreshold;
      else out.escortRetreatThreshold = threshold;
    } else {
      const threshold = sameRecentMine
        ? normalizeRetreatThreshold(last.escortRetreatThreshold)
        : normalizeRetreatThreshold(msg.escortRetreatThreshold);
      if (threshold != null) out.escortRetreatThreshold = threshold;
    }
    if (!Object.prototype.hasOwnProperty.call(out, 'hangarAssignments')) {
      out.hangarAssignments = {};
    }
    return out;
  }

  function onGameFetch(msg, sender, sendResponse) {
    void sender;
    if (!msg || msg.type !== 'GAME_FETCH') return;

    const body = normalizeGameFetchBody(msg);
    fetch(msg.path, {
      method: msg.method || 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    }).then(async response => {
      const text = await response.text();
      const meta = {
        status: response.status,
        retryAfter: response.headers.get('Retry-After'),
        rateLimitRemaining: response.headers.get('RateLimit-Remaining'),
        rateLimitReset: response.headers.get('RateLimit-Reset'),
      };
      if (!response.ok) {
        let message = `${response.status}`;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || message;
        } catch {
          if (text) message = `${response.status}: ${text.slice(0, 200)}`;
        }
        sendResponse({ error: message, ...meta });
        return;
      }

      let data = {};
      try { data = JSON.parse(text); } catch { /* empty/non-JSON response */ }
      sendResponse({ ok: true, data, ...meta });
    }).catch(error => sendResponse({ error: error.message }));
    return true;
  }

  // Re-running the file is intentional: remove the listener from the current
  // context before registering it again. This also recovers after an extension
  // reload invalidates the listener owned by the old context.
  const previousListener = globalThis.__nexusGameApiBridgeListener;
  if (previousListener) {
    try { runtime.onMessage.removeListener(previousListener); } catch { /* old context */ }
  }
  runtime.onMessage.addListener(onGameFetch);
  globalThis.__nexusGameApiBridgeListener = onGameFetch;
})();
