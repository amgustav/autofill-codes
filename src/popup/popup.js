/**
 * Popup script — handles UI state, login/logout, manual code fetch.
 */

// ── Elements ───────────────────────────────────────────────────────────────

const viewLogin = document.getElementById('view-login');
const viewMain = document.getElementById('view-main');
const viewLoading = document.getElementById('view-loading');

const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnFetch = document.getElementById('btn-fetch');
const btnCopy = document.getElementById('btn-copy');

const emailDisplay = document.getElementById('email-display');
const toggleEnabled = document.getElementById('toggle-enabled');
const codeDisplay = document.getElementById('code-display');
const codeValue = document.getElementById('code-value');

// ── View management ────────────────────────────────────────────────────────

function showView(view) {
  viewLogin.hidden = true;
  viewMain.hidden = true;
  viewLoading.hidden = true;
  view.hidden = false;
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  showView(viewLoading);

  const response = await sendMessage({ type: 'GET_STATUS' });

  if (response?.authenticated) {
    emailDisplay.textContent = response.email || 'Connected';
    toggleEnabled.checked = response.enabled !== false;
    showView(viewMain);
  } else {
    showView(viewLogin);
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

btnLogin.addEventListener('click', async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = 'Connecting...';

  const response = await sendMessage({ type: 'LOGIN' });

  if (response?.success) {
    emailDisplay.textContent = response.email || 'Connected';
    showView(viewMain);
  } else {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Sign in with Google';
    alert(response?.error || 'Login failed. Please try again.');
  }
});

btnLogout.addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  codeDisplay.hidden = true;
  showView(viewLogin);
  btnLogin.disabled = false;
  btnLogin.textContent = 'Sign in with Google';
});

btnFetch.addEventListener('click', async () => {
  btnFetch.disabled = true;
  btnFetch.textContent = 'Checking email...';

  const response = await sendMessage({ type: 'FETCH_CODE' });

  btnFetch.disabled = false;
  btnFetch.textContent = 'Fetch code now';

  if (response?.code) {
    codeValue.textContent = response.code;
    codeDisplay.hidden = false;
  } else {
    codeValue.textContent = '—';
    codeDisplay.hidden = false;
    setTimeout(() => {
      codeDisplay.hidden = true;
    }, 3000);
  }
});

btnCopy.addEventListener('click', () => {
  const code = codeValue.textContent;
  if (code && code !== '—') {
    navigator.clipboard.writeText(code);
    btnCopy.title = 'Copied!';
    setTimeout(() => {
      btnCopy.title = 'Copy';
    }, 1500);
  }
});

toggleEnabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggleEnabled.checked });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

// ── Start ──────────────────────────────────────────────────────────────────

init();
