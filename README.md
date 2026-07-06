# Tab Recall

> Keyboard-driven tab search for Firefox — search, switch, close, and deduplicate open tabs instantly.

**Repository:** https://github.com/fcjreed/tab-search-extension

---

## Overview

Tab Recall adds a fast, keyboard-accessible search overlay to Firefox. Press **Ctrl+Space** on any page to see all open tabs sorted by most recent access. Filter by title or URL, navigate with arrow keys, and switch or close tabs without touching the mouse.

## Features

- **Instant activation** — `Ctrl+Space` works on any page, any time
- **Live search** — filters by tab title and URL; supports partial and whole-word matches
- **Keyboard navigation** — `↑` / `↓` to move, `Enter` to switch, `Esc` to dismiss
- **Per-tab close** — remove any tab from the overlay without leaving your current page
- **Close Duplicates** — removes duplicate tabs across all windows in one click, keeping the active or most-recently-accessed copy
- **Privacy-first** — no data collection; requires only the `tabs` permission

## Installation (Developer / Temporary Load)

1. Navigate to `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.
4. The extension is active immediately — press `Ctrl+Space` on any tab to verify.

> To persist across browser restarts, sign and install the extension permanently (see [Publishing](#publishing-to-addonsfirefoxcom)) or use Firefox Developer Edition / Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

## Running Tests

The test suite covers duplicate-detection logic and has no external dependencies:

```bash
node tests/duplicate-logic.test.js
```

Each test prints its name followed by `PASS`; a summary line is printed at the end.

## Publishing to addons.firefox.com

1. Zip the extension files:
   ```bash
   zip -r tab-recall.zip manifest.json background.js content.js overlay.css icons/
   ```
   *(Exclude `.git/`, `memory/`, `tests/`, and `README.md`.)*
2. Sign in to [addons.mozilla.org](https://addons.mozilla.org/developers/) and submit the zip as a new add-on or upload a new version to an existing listing.
3. The `gecko.id` in `manifest.json` (`tab-search@vedavox`) is the stable add-on identifier — keep it consistent across versions.
4. Increment `version` in `manifest.json` for every new submission.

## License

This project is licensed under the [MIT License](LICENSE).
