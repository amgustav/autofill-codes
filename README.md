# Autofill Codes

Chrome extension that automatically detects when a website is asking for a verification code, reads your email, finds the most recent code, and fills it in — no more tab-switching.

## Features

- **Auto-detection** — identifies verification code input fields on any website (single inputs, split/segmented inputs, dynamically loaded forms)
- **Gmail integration** — securely reads recent emails via Gmail API (read-only, OAuth2)
- **Smart extraction** — parses 4-8 digit codes and alphanumeric codes from email subjects and bodies
- **Instant fill** — fills the code automatically with proper event dispatching (works with React, Vue, Angular)
- **Polling** — if no code is found immediately, polls every 3s for up to 60s
- **Manual fetch** — grab the latest code from the popup anytime
- **Privacy-first** — no data leaves your browser, no external servers, just direct Gmail API calls

## Setup

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Chrome Extension**
6. Enter your extension ID (found at `chrome://extensions` after loading the unpacked extension)
7. Copy the **Client ID**

### 2. Configure the extension

Open `manifest.json` and replace the placeholder:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

### 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `autofill-codes` directory
5. Click the extension icon and sign in with Google

## How it works

1. **Content script** runs on every page, scanning for inputs that look like verification code fields (autocomplete hints, name/id patterns, nearby text context, split input groups)
2. When a code field is detected, it notifies the **background service worker**
3. The service worker fetches recent emails from Gmail API, searching for common verification patterns
4. The **code extractor** parses email bodies to find 4-8 digit/alphanumeric codes
5. The code is sent back to the content script and filled into the input with proper DOM events

## Project structure

```
autofill-codes/
├── manifest.json              # Extension manifest (MV3)
├── src/
│   ├── background/
│   │   └── index.js           # Service worker — Gmail API, polling, message routing
│   ├── content/
│   │   └── index.js           # Content script — field detection, autofill, toast UI
│   ├── popup/
│   │   ├── popup.html         # Popup UI
│   │   ├── popup.css          # Popup styles
│   │   └── popup.js           # Popup logic — auth, manual fetch, settings
│   ├── utils/
│   │   ├── gmail.js           # Gmail API helpers — auth, search, message fetch
│   │   └── codeExtractor.js   # Code extraction — regex patterns, heuristics
│   └── styles/
│       └── toast.css          # Toast notification styles
└── public/
    └── icons/                 # Extension icons
```

## Roadmap

- [ ] Outlook / Microsoft 365 support
- [ ] Multi-account support
- [ ] Custom code patterns
- [ ] Firefox port
- [ ] Chrome Web Store listing

## License

MIT
