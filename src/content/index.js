/**
 * Content script — injected into every page.
 * Detects verification code input fields and handles autofill.
 */

// ── Configuration ──────────────────────────────────────────────────────────

const CODE_FIELD_SELECTORS = [
  // Explicit autocomplete hint (best signal)
  'input[autocomplete="one-time-code"]',
  // Common name/id patterns
  'input[name*="otp" i]',
  'input[name*="code" i]',
  'input[name*="verify" i]',
  'input[name*="token" i]',
  'input[name*="2fa" i]',
  'input[name*="mfa" i]',
  'input[name*="pin" i]',
  'input[id*="otp" i]',
  'input[id*="code" i]',
  'input[id*="verify" i]',
  'input[id*="2fa" i]',
  'input[id*="mfa" i]',
  'input[class*="otp" i]',
  'input[class*="code" i]',
  'input[class*="verify" i]',
  'input[data-testid*="code" i]',
  'input[data-testid*="otp" i]',
  'input[aria-label*="code" i]',
  'input[aria-label*="otp" i]',
  'input[aria-label*="verification" i]',
  'input[placeholder*="code" i]',
  'input[placeholder*="otp" i]',
  'input[placeholder*="verification" i]',
];

// Text patterns that suggest a page is asking for a code
const CONTEXT_PATTERNS = [
  /enter\s+(?:the\s+)?(?:verification|security|confirmation|login|sign[- ]?in)\s*code/i,
  /we\s+(?:sent|emailed)\s+(?:a\s+|you\s+a\s+)?code/i,
  /check\s+your\s+(?:email|inbox)/i,
  /one[- ]?time\s+(?:password|code|pin)/i,
  /enter\s+(?:the\s+)?(?:\d[- ]?digit\s+)?code/i,
  /verification\s+code/i,
  /confirm(?:ation)?\s+code/i,
  /two[- ]?factor/i,
  /2fa\s+code/i,
  /authentication\s+code/i,
];

// ── State ──────────────────────────────────────────────────────────────────

let detectedField = null;
let hasNotifiedBackground = false;
let splitInputs = null; // For split/segmented code inputs (one digit per box)

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * Find verification code input fields on the page.
 * @returns {HTMLInputElement|null}
 */
function findCodeField() {
  // Strategy 1: Direct selector match
  for (const selector of CODE_FIELD_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && isVisibleInput(el)) {
      return el;
    }
  }

  // Strategy 2: Look for split/segmented inputs (common pattern: 6 inputs in a row)
  const splits = findSplitCodeInputs();
  if (splits) {
    splitInputs = splits;
    return splits[0]; // Return first input as the "field"
  }

  // Strategy 3: Context-based — check if nearby text suggests a code is needed
  if (pageHasCodeContext()) {
    // Look for short, empty text/number/tel inputs that could be code fields
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="number"], input[type="tel"], input:not([type])'
    );
    for (const input of inputs) {
      if (
        isVisibleInput(input) &&
        !input.value &&
        (input.maxLength <= 8 || input.size <= 8 || hasSmallWidth(input))
      ) {
        return input;
      }
    }
  }

  return null;
}

/**
 * Find split/segmented code input groups (one digit per input).
 * @returns {HTMLInputElement[]|null}
 */
function findSplitCodeInputs() {
  // Look for groups of 4-8 single-character inputs
  const allInputs = document.querySelectorAll(
    'input[type="text"], input[type="number"], input[type="tel"], input:not([type])'
  );
  const visible = Array.from(allInputs).filter(isVisibleInput);

  // Group by parent container
  const groups = new Map();
  for (const input of visible) {
    if (input.maxLength === 1 || input.size === 1) {
      const parent = input.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(input);
    }
  }

  for (const [, inputs] of groups) {
    if (inputs.length >= 4 && inputs.length <= 8) {
      return inputs;
    }
  }

  return null;
}

/**
 * Check if surrounding page text suggests a verification code is expected.
 * @returns {boolean}
 */
function pageHasCodeContext() {
  const text = document.body?.innerText || '';
  return CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if an input element is visible and interactable.
 * @param {HTMLInputElement} el
 * @returns {boolean}
 */
function isVisibleInput(el) {
  if (el.type === 'hidden' || el.disabled || el.readOnly) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Check if input has a small width (likely a code field).
 * @param {HTMLInputElement} el
 * @returns {boolean}
 */
function hasSmallWidth(el) {
  const rect = el.getBoundingClientRect();
  return rect.width < 300;
}

// ── Autofill ───────────────────────────────────────────────────────────────

/**
 * Fill the detected field(s) with the code.
 * @param {string} code
 */
function fillCode(code) {
  if (splitInputs && splitInputs.length > 0) {
    fillSplitInputs(code);
  } else if (detectedField) {
    fillSingleInput(detectedField, code);
  }
}

/**
 * Fill a single input field, dispatching proper events for React/Vue/Angular.
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function fillSingleInput(input, value) {
  // Focus the input first
  input.focus();

  // Use native setter to bypass React's synthetic event system
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Dispatch events that frameworks listen to
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

/**
 * Fill split/segmented code inputs (one character per input).
 * @param {string} code
 */
function fillSplitInputs(code) {
  const chars = code.split('');
  splitInputs.forEach((input, i) => {
    if (i < chars.length) {
      fillSingleInput(input, chars[i]);
    }
  });
}

// ── Toast notification ─────────────────────────────────────────────────────

/**
 * Show a small toast notification on the page.
 * @param {string} message
 * @param {'success'|'info'|'error'} type
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('autofill-codes-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'autofill-codes-toast';
  toast.className = `autofill-codes-toast autofill-codes-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('autofill-codes-toast--visible');
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('autofill-codes-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Message handling ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTOFILL_CODE' && message.code) {
    fillCode(message.code);
    const source = message.source ? ` from "${message.source}"` : '';
    showToast(`Code ${message.code} filled${source}`, 'success');
  }

  if (message.type === 'POLL_TIMEOUT') {
    showToast('No verification code found in recent emails', 'error');
  }
});

// ── Main detection loop ────────────────────────────────────────────────────

function runDetection() {
  const field = findCodeField();

  if (field && !hasNotifiedBackground) {
    detectedField = field;
    hasNotifiedBackground = true;

    showToast('Checking email for verification code...', 'info');

    chrome.runtime.sendMessage({ type: 'CODE_FIELD_DETECTED' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[autofill-codes]', chrome.runtime.lastError.message);
        return;
      }

      if (response?.code) {
        fillCode(response.code);
        const source = response.source ? ` from "${response.source}"` : '';
        showToast(`Code ${response.code} filled${source}`, 'success');
      } else if (response?.polling) {
        showToast('Waiting for verification email...', 'info');
      }
    });
  }
}

// Run detection on load
runDetection();

// Watch for dynamically added content (SPAs, lazy-loaded forms)
const observer = new MutationObserver(() => {
  if (!hasNotifiedBackground) {
    runDetection();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Reset detection state when navigating within an SPA
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    hasNotifiedBackground = false;
    detectedField = null;
    splitInputs = null;
  }
});

urlObserver.observe(document, { subtree: true, childList: true });
