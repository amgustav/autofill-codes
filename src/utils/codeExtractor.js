/**
 * Extracts verification codes from email message bodies.
 * Handles HTML and plain text, various code formats (4-8 digits, alphanumeric).
 */

/**
 * Decode a base64url-encoded string (Gmail uses URL-safe base64).
 * @param {string} data
 * @returns {string}
 */
function decodeBase64Url(data) {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

/**
 * Recursively extract the body text from a Gmail message payload.
 * Prefers text/plain, falls back to text/html (stripped of tags).
 * @param {object} payload - Gmail message payload object.
 * @returns {string} Decoded body text.
 */
export function extractBodyText(payload) {
  // Direct body on the payload
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      return stripHtml(decoded);
    }
    return decoded;
  }

  // Multipart — recurse into parts
  if (payload.parts) {
    // Prefer plain text
    const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plainPart) {
      return extractBodyText(plainPart);
    }

    // Fall back to HTML
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart) {
      return extractBodyText(htmlPart);
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }

  return '';
}

/**
 * Strip HTML tags and decode common entities.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the subject line from a Gmail message.
 * @param {object} message - Full Gmail message object.
 * @returns {string}
 */
export function extractSubject(message) {
  const headers = message.payload?.headers || [];
  const subjectHeader = headers.find(
    (h) => h.name.toLowerCase() === 'subject'
  );
  return subjectHeader?.value || '';
}

/**
 * Extract a verification code from email text.
 *
 * Strategy (ordered by confidence):
 * 1. Code explicitly called out: "your code is 123456", "code: 123456"
 * 2. Standalone large number (4-8 digits) surrounded by whitespace/punctuation
 * 3. Alphanumeric codes (e.g., "A1B2C3") when preceded by "code" context
 *
 * @param {string} text - Email body text.
 * @param {string} subject - Email subject line.
 * @returns {string|null} The extracted code, or null.
 */
export function extractVerificationCode(text, subject = '') {
  const combined = `${subject} ${text}`;

  // Pattern 1: Explicit code callouts
  // "code is 123456", "code: 123456", "code — 123456", "your code: ABC123"
  const explicitPatterns = [
    /(?:verification|security|confirm(?:ation)?|login|sign[- ]?in|one[- ]?time|auth(?:entication)?|2fa|two[- ]?factor)?\s*(?:code|pin|otp)\s*(?:is|:|—|–|-|=)\s*[:\s]*([A-Z0-9]{4,8})/gi,
    /(?:enter|use|input|type|submit)\s+(?:the\s+)?(?:code\s+)?([A-Z0-9]{4,8})/gi,
    /\b([0-9]{4,8})\b\s*(?:is your|is the)/gi,
  ];

  for (const pattern of explicitPatterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const match = pattern.exec(combined);
    if (match?.[1]) {
      return match[1];
    }
  }

  // Pattern 2: Code formatted prominently (often on its own line or in large text)
  // Look for 4-8 digit numbers that aren't years, phone numbers, or amounts
  const standalonePattern = /(?:^|\s|>|\n)(\d{4,8})(?:\s|$|<|\n|\.)/gm;
  const candidates = [];
  let m;

  standalonePattern.lastIndex = 0;
  while ((m = standalonePattern.exec(combined)) !== null) {
    const num = m[1];
    // Filter out likely non-codes
    if (isLikelyCode(num, combined)) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    // Prefer 6-digit codes (most common), then 4, then 8
    const preferred = candidates.find((c) => c.length === 6)
      || candidates.find((c) => c.length === 4)
      || candidates[0];
    return preferred;
  }

  // Pattern 3: Alphanumeric codes near "code" context
  const alphanumPattern = /\b([A-Z0-9]{6,8})\b/g;
  const codeContextPattern = /code|verify|confirm|otp|pin/i;

  if (codeContextPattern.test(combined)) {
    alphanumPattern.lastIndex = 0;
    while ((m = alphanumPattern.exec(combined)) !== null) {
      const candidate = m[1];
      // Must contain both letters and numbers to be alphanumeric code
      if (/[A-Z]/i.test(candidate) && /\d/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Heuristic to determine if a number is likely a verification code vs noise.
 * @param {string} numStr
 * @param {string} context
 * @returns {boolean}
 */
function isLikelyCode(numStr, context) {
  const num = parseInt(numStr, 10);

  // Filter years (1900-2099)
  if (numStr.length === 4 && num >= 1900 && num <= 2099) {
    // Only keep if "code" is mentioned nearby
    return /code|verify|confirm|otp|pin/i.test(context);
  }

  // Filter phone-like numbers (10+ digits handled by length limit)
  // Filter amounts (preceded by $ or followed by .00)
  const idx = context.indexOf(numStr);
  if (idx > 0) {
    const before = context.substring(Math.max(0, idx - 5), idx);
    const after = context.substring(idx + numStr.length, idx + numStr.length + 5);
    if (/\$|€|£|¥|USD|EUR/.test(before) || /\.\d{2}/.test(after)) {
      return false;
    }
  }

  return true;
}
