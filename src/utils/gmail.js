/**
 * Gmail API helper — handles OAuth token retrieval and email searching.
 */

const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me';

/**
 * Get OAuth2 token via chrome.identity.
 * @param {boolean} interactive - Whether to show the auth prompt.
 * @returns {Promise<string>} Access token.
 */
export async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Remove cached auth token (for logout or token refresh).
 * @param {string} token
 */
export async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

/**
 * Make an authenticated Gmail API request.
 * @param {string} endpoint - API path after /users/me/
 * @param {string} token - OAuth access token
 * @returns {Promise<object>} Parsed JSON response.
 */
async function gmailRequest(endpoint, token) {
  const res = await fetch(`${GMAIL_API_BASE}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token expired — remove and throw so caller can retry
    await removeCachedToken(token);
    throw new Error('TOKEN_EXPIRED');
  }

  if (!res.ok) {
    throw new Error(`Gmail API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Search for recent verification emails.
 * Looks at emails from the last N minutes matching common verification patterns.
 * @param {string} token
 * @param {number} minutesAgo - How far back to search (default 5).
 * @param {number} maxResults - Max emails to check (default 5).
 * @returns {Promise<Array>} List of message objects with id and threadId.
 */
export async function searchVerificationEmails(token, minutesAgo = 5, maxResults = 5) {
  const afterEpoch = Math.floor((Date.now() - minutesAgo * 60 * 1000) / 1000);

  // Query combines time filter with common verification email patterns
  const queries = [
    'verification code',
    'verify your',
    'confirmation code',
    'security code',
    'one-time',
    'OTP',
    'login code',
    'sign in code',
    'authentication code',
    '2FA',
    'two-factor',
  ];

  const q = `after:${afterEpoch} {${queries.join(' ')}}`;
  const endpoint = `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;

  const data = await gmailRequest(endpoint, token);
  return data.messages || [];
}

/**
 * Fetch the full content of a specific email message.
 * @param {string} token
 * @param {string} messageId
 * @returns {Promise<object>} Full message object.
 */
export async function getMessageContent(token, messageId) {
  return gmailRequest(`messages/${messageId}?format=full`, token);
}

/**
 * Get the user's Gmail profile (email address, etc.).
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function getProfile(token) {
  return gmailRequest('profile', token);
}
