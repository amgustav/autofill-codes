/**
 * Background service worker.
 * Handles Gmail API calls, code extraction, and communication with content scripts.
 */

import { getAuthToken, removeCachedToken, searchVerificationEmails, getMessageContent, getProfile } from '../utils/gmail.js';
import { extractBodyText, extractSubject, extractVerificationCode } from '../utils/codeExtractor.js';

// ── State ──────────────────────────────────────────────────────────────────

let isPolling = false;
let pollIntervalId = null;

// ── Message handlers ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    LOGIN: handleLogin,
    LOGOUT: handleLogout,
    GET_STATUS: handleGetStatus,
    FETCH_CODE: handleFetchCode,
    CODE_FIELD_DETECTED: handleCodeFieldDetected,
  };

  const handler = handlers[message.type];
  if (handler) {
    handler(message, sender).then(sendResponse).catch((err) => {
      console.error(`[bg] Error handling ${message.type}:`, err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  }
});

// ── Handlers ───────────────────────────────────────────────────────────────

async function handleLogin() {
  try {
    const token = await getAuthToken(true);
    const profile = await getProfile(token);

    await chrome.storage.local.set({
      authenticated: true,
      email: profile.emailAddress,
    });

    return { success: true, email: profile.emailAddress };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleLogout() {
  try {
    const token = await getAuthToken(false);
    if (token) {
      await removeCachedToken(token);
      // Also revoke the token server-side
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    }
  } catch {
    // Ignore errors during logout
  }

  await chrome.storage.local.set({
    authenticated: false,
    email: null,
  });

  return { success: true };
}

async function handleGetStatus() {
  const data = await chrome.storage.local.get(['authenticated', 'email', 'enabled']);
  return {
    success: true,
    authenticated: data.authenticated || false,
    email: data.email || null,
    enabled: data.enabled !== false, // Default to enabled
  };
}

/**
 * Manually fetch the latest verification code from Gmail.
 */
async function handleFetchCode() {
  return fetchLatestCode();
}

/**
 * Content script detected a verification code field.
 * Start polling for codes and attempt autofill.
 */
async function handleCodeFieldDetected(_message, sender) {
  const { authenticated, enabled } = await chrome.storage.local.get(['authenticated', 'enabled']);

  if (!authenticated || enabled === false) {
    return { success: false, error: 'Not authenticated or disabled' };
  }

  // Attempt immediate fetch
  const result = await fetchLatestCode();

  if (result.success && result.code) {
    // Send code to the content script that detected the field
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'AUTOFILL_CODE',
      code: result.code,
      source: result.source,
    });
    return result;
  }

  // No code yet — start polling
  startPolling(sender.tab.id);
  return { success: true, code: null, polling: true };
}

// ── Core logic ─────────────────────────────────────────────────────────────

/**
 * Fetch the most recent verification code from Gmail.
 * @returns {Promise<{success: boolean, code?: string, source?: string, error?: string}>}
 */
async function fetchLatestCode() {
  let token;
  try {
    token = await getAuthToken(false);
  } catch {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const messages = await searchVerificationEmails(token, 5, 5);

    if (messages.length === 0) {
      return { success: true, code: null };
    }

    // Check messages from newest to oldest
    for (const msg of messages) {
      const fullMessage = await getMessageContent(token, msg.id);
      const subject = extractSubject(fullMessage);
      const bodyText = extractBodyText(fullMessage.payload);
      const code = extractVerificationCode(bodyText, subject);

      if (code) {
        return {
          success: true,
          code,
          source: subject || 'Email',
        };
      }
    }

    return { success: true, code: null };
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      // Retry once with fresh token
      try {
        token = await getAuthToken(true);
        return fetchLatestCode();
      } catch {
        return { success: false, error: 'Authentication expired' };
      }
    }
    return { success: false, error: err.message };
  }
}

/**
 * Poll Gmail every 3 seconds for up to 60 seconds looking for a new code.
 * @param {number} tabId - Tab to send the code to when found.
 */
function startPolling(tabId) {
  if (isPolling) return;
  isPolling = true;

  let elapsed = 0;
  const interval = 3000;
  const maxDuration = 60000;

  pollIntervalId = setInterval(async () => {
    elapsed += interval;

    if (elapsed > maxDuration) {
      stopPolling();
      chrome.tabs.sendMessage(tabId, {
        type: 'POLL_TIMEOUT',
      });
      return;
    }

    const result = await fetchLatestCode();
    if (result.success && result.code) {
      stopPolling();
      chrome.tabs.sendMessage(tabId, {
        type: 'AUTOFILL_CODE',
        code: result.code,
        source: result.source,
      });
    }
  }, interval);
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  isPolling = false;
}

// ── Install handler ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      authenticated: false,
      email: null,
      enabled: true,
    });
  }
});
