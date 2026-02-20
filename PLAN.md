# Shoyu Feeds — Modernization Plan

**Scope:** Two Chrome extensions (`preview/` and `update/`) currently broken due to Manifest V2 deprecation.
**Goal:** Restore functionality (MV3), add Firefox support, fix security/bugs, and add tests.
**Format:** Each task is self-contained and suitable for a small, focused agent.

---

## Codebase Snapshot

```
preview/   – Shoyu RSS/Atom Feed Preview (v2.0.3.18, MV2)
update/    – Shoyu RSS/Atom Feed Updates (v1.0.4.5, MV2)
```

### Key Files

| File | Role |
|---|---|
| `preview/manifest.json` | Extension manifest (MV2) |
| `preview/background.js` | Persistent background page — message hub, tab state |
| `preview/doc_start.js` | Content script (document_start) — sniffs raw feed documents |
| `preview/feed_finder.js` | Content script — finds `<link rel=alternate>` feed tags |
| `preview/sniff_common.js` | Shared content script utility (`containsFeed`, `debugMsg`) |
| `preview/subscribe.js` | Feed viewer page — fetches XML, creates iframe with feed data |
| `preview/iframe.js` | Feed renderer — builds DOM from parsed XML inside iframe |
| `preview/common.js` | Shared utilities — `defaultReaderList`, `isDefaultReader`, `storageEnabled` |
| `preview/popup.js` | Page-action popup — lists discovered feeds on current page |
| `preview/options.js` | Options page — reader list management, display preferences |
| `update/manifest.json` | Extension manifest (MV2) |
| `update/background.js` | Persistent background — feed update polling via XHR |
| `update/us.js` | Utilities — ISO8601 parser, `getDate`, `feedUnreadList` |
| `update/popup.js` | Browser-action popup — bookmark-based feed list, update trigger |
| `update/locale.js` | String constants, folder names, default feed list |
| `update/viewselect.js` | View routing — which extension renders the preview |
| `update/options.js` | Options page — view mode, tab behavior |
| `update/subscribe.js` | Subscribe page — minimal, just reads query params |

---

## Why It's Broken

Chrome removed Manifest V2 support.[^1] The critical breakages:

- `chrome.extension.*` messaging APIs removed
- `chrome.pageAction` / `chrome.browserAction` removed → replaced by unified `chrome.action`
- `chrome.tabs.executeScript` removed → `chrome.scripting.executeScript`
- `chrome.tabs.getSelected` removed → `chrome.tabs.query`
- Persistent background pages removed → replaced by service workers
- `window.localStorage` not available in service workers
- `data:` URI iframes blocked in MV3 extension pages (biggest architectural issue)
- Synchronous XHR blocked in service workers

---

## Phase 1 — Manifest V3 Migration (Chrome)

*These tasks make the extensions functional in modern Chrome. Work top-to-bottom within each extension; Preview should be done before Update since it is simpler.*

---

### P1-T1 · Preview: Update manifest.json to MV3

**Files:** `preview/manifest.json`

**Changes:**

1. Set `"manifest_version": 3`
2. Replace `"background": {"persistent": true, "scripts": ["background.js"]}` with `"background": {"service_worker": "background.js"}`
3. Split `"permissions"` host wildcards into `"host_permissions": ["http://*/*", "https://*/*"]`; keep only named permissions in `"permissions"`: `["tabs", "storage", "scripting", "declarativeContent"]`
4. Replace `"page_action"` block with `"action"` block; keep `default_icon`, `default_title`, `default_popup`. Add `"default_state": "disabled"` so the icon starts grayed out on every tab.[^2]
5. Update `"web_accessible_resources"` to MV3 format:
   ```json
   "web_accessible_resources": [{"resources": ["*"], "matches": ["<all_urls>"]}]
   ```
   Add `viewer.html` explicitly once P1-T5 creates it.
6. Remove `manifest_version: 2`-only fields (`web_accessible_resources` catch-all `"*"` string).

**Acceptance:** `chrome://extensions` loads the extension without errors after this task. (Other functionality will still be broken until subsequent tasks.)

---

### P1-T2 · Preview: Convert background.js to a service worker

**Files:** `preview/background.js`

**Changes:**

1. Replace `chrome.extension.onMessage.addListener` → `chrome.runtime.onMessage.addListener`.[^3]
2. Replace `chrome.pageAction.setTitle(...)` → `chrome.action.setTitle(...)`.
3. Replace `chrome.pageAction.show(tabId)` → `chrome.action.enable(tabId)`.
4. Replace URL validation via `document.createElement('a')` (DOM not available in service workers) with:
   ```js
   function isValidFeedUrl(href) {
     try {
       const u = new URL(href);
       return u.protocol === 'http:' || u.protocol === 'https:';
     } catch { return false; }
   }
   ```
5. Replace `chrome.tabs.executeScript(tabId, {code: ...})` → `chrome.scripting.executeScript({target: {tabId}, func: () => { if (history.length > 1) history.go(-1); else window.close(); }})`. Requires `"scripting"` permission (added in P1-T1).
6. Replace `chrome.extension.getURL(url)` → `chrome.runtime.getURL(url)`.
7. Add a `chrome.tabs.onUpdated` listener to call `chrome.action.disable(tabId)` on navigation start, so the icon resets when the user navigates away from a page with feeds.[^4]
8. Remove any `window.*` or `document.*` usage (none currently, but verify).

**Acceptance:** Background service worker registers without errors. Feeds are detected and the toolbar icon becomes active. Clicking icon opens popup.

---

### P1-T3 · Preview: Fix deprecated messaging in content scripts

**Files:** `preview/doc_start.js`, `preview/feed_finder.js`

**Changes:**

Both files use `chrome.extension.sendMessage` (removed in MV3).

Replace all occurrences with `chrome.runtime.sendMessage`.[^3] No other changes needed.

`preview/sniff_common.js` has no Chrome API calls and requires no changes.

**Acceptance:** Content scripts inject without console errors. Background receives `feedIcon` and `feedDocument` messages.

---

### P1-T4 · Preview: Fix deprecated APIs in popup.js

**Files:** `preview/popup.js`

**Changes:**

1. Replace `chrome.tabs.getSelected(callback)` → `chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => {...})`.[^5]
2. Replace `setTimeout("window.close();", 500)` (implicit eval, blocked by CSP) → `setTimeout(() => window.close(), 500)`.
3. `chrome.windows.create` and `chrome.tabs.create` still work in MV3; no change needed.

**Acceptance:** Popup opens and correctly lists feeds for the current tab.

---

### P1-T5 · Preview: Replace data: URI iframe with viewer.html

**Background:** This is the largest single architectural change for the preview extension.

Currently, `subscribe.js` creates an iframe with `src="data:text/html;..."`, stuffing the full HTML (CSS, scripts, token, feed content) into the URI. MV3 extension pages block `data:` URI iframes via Content Security Policy.[^6]

**Solution:** Create a real `preview/viewer.html` extension page that replaces the `data:` iframe. The existing `MessageChannel` handshake in `iframe.js` already provides a secure channel — only the delivery mechanism changes.

**Files:** Create `preview/viewer.html`; modify `preview/subscribe.js`

**New `preview/viewer.html`:**
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css">
  <link id="color" rel="stylesheet">
</head>
<body>
  <script src="iframe.js"></script>
</body>
</html>
```

**Changes to `preview/subscribe.js`:**

1. In `createFrame(frame_id, html)`, replace the `data:` URI construction with:
   ```js
   function createFrame(frame_id, html) {
     const frame = document.createElement('iframe');
     frame.id = frame_id;
     frame.src = chrome.runtime.getURL('viewer.html');
     frame.scrolling = 'auto';
     frame.frameBorder = '0';
     frame.marginWidth = '0';
     return frame;
   }
   ```
2. The frame's content is no longer pre-populated — `iframe.js` must request XML via the `MessageChannel`. The existing `mc.port1.onmessage` / `window.addEventListener("message", ...)` handshake in `iframe.js` and `subscribe.js` already does this; it just now operates between two extension pages instead of between a page and a data: iframe.
3. Replace `chrome.extension.getURL(...)` → `chrome.runtime.getURL(...)` everywhere in the file.
4. The `synchronousRequest` test path used `data:` injection of scripts. It can be removed — tests should load `viewer.html` directly.
5. The `extension_id` variable referenced in the token comment (`<!--Token:...-->`) must be set: `const extension_id = chrome.runtime.id;`.

**Update `preview/manifest.json`:**
Add `viewer.html` to `web_accessible_resources` if external pages ever need to frame it; otherwise not required since it is only framed by the same extension.

**Note on sandbox:** `viewer.html` renders untrusted RSS content. This is a security concern addressed in Phase 4 (P4-T1).

**Acceptance:** Feed preview page renders feed content without console errors or blank iframes.

---

### P1-T6 · Preview: Migrate localStorage to chrome.storage — subscribe.js and common.js

**Background:** `window.localStorage` is synchronous and unavailable in service workers. Extension UI pages can still use it, but `chrome.storage.local` is more reliable across browsers and survives extension updates without clearing. More importantly, `iframe.js` (now running in `viewer.html`, an extension page) needs access to the same settings.

**Files:** `preview/subscribe.js`, `preview/common.js`

**Strategy:** Replace `window.localStorage` reads/writes with `chrome.storage.local`. Wrap the `main()` startup sequence with a single `chrome.storage.local.get([...keys])` call to fetch all settings at once, then proceed synchronously using the in-memory result.

**Keys to migrate:**

| localStorage key | Default |
|---|---|
| `showPreviewPage` | `undefined` (treated as "show") |
| `readerList` | `defaultReaderList()` |
| `defaultReader` | first reader URL |
| `colorStyle` | `""` |
| `disableEmbed` | `"Yes"` |
| `sortFeeds` | `undefined` |

**Pattern:**
```js
chrome.storage.local.get(
  ['showPreviewPage','readerList','defaultReader','colorStyle','disableEmbed','sortFeeds'],
  (settings) => {
    // use settings.showPreviewPage, settings.readerList, etc.
    runMain(settings);
  }
);
```

Replace all `window.localStorage.foo = bar` writes with `chrome.storage.local.set({foo: bar})`.

In `common.js`, remove `var storageEnabled = window.localStorage != null` — storage is always available via `chrome.storage`.

**Acceptance:** Options persist across page loads. Feed preview reflects saved settings.

---

### P1-T7 · Preview: Migrate localStorage — options.js and popup.js

**Files:** `preview/options.js`, `preview/popup.js`

Apply the same `chrome.storage.local` migration pattern from P1-T6 to these two files.

- `options.js` reads/writes `readerList`, `defaultReader`, `showPreviewPage`, `colorStyle`, `disableEmbed`, `sortFeeds`.
- `popup.js` reads `showPreviewPage`, `defaultReader`.

Wrap each page's `main()` in a `chrome.storage.local.get(keys, callback)`. Replace all `window.localStorage` writes with `chrome.storage.local.set(...)`.

**Acceptance:** Options page loads saved values and saves changes correctly.

---

### P1-T8 · Preview: Migrate localStorage — iframe.js (viewer.html)

**Files:** `preview/iframe.js`

Now that `iframe.js` runs as a full extension page, it can call `chrome.storage.local` directly.

**Changes:**
1. Wrap `buildPreview()` call inside `chrome.storage.local.get(['disableEmbed','sortFeeds'], (s) => buildPreview(doc, feedUrl, s))`.
2. Pass `settings` into `buildPreview` and use `settings.disableEmbed` / `settings.sortFeeds` instead of `window.localStorage.*`.
3. Remove `NodeList.prototype.toArray` extension (use `Array.from()` instead, or just iterate directly).

**Acceptance:** Feed items sort correctly; embeds are stripped per user preference.

---

### P1-T9 · Update: Update manifest.json to MV3

**Files:** `update/manifest.json`

**Changes:**

1. Set `"manifest_version": 3`
2. Replace `"background": {"scripts": ["background.js","us.js"], "persistent": true}` with `"background": {"service_worker": "background.js"}`. MV3 only allows one service worker file; `us.js` will be imported via `importScripts()` (see P1-T10).
3. Replace `"browser_action"` with `"action"`.
4. Move `"http://*/*"`, `"https://*/*"` to `"host_permissions"`. Keep `"bookmarks"` and `"tabs"` in `"permissions"`.
5. Update icons from `"browser_action"` to `"action"`.

**Acceptance:** Extension loads without manifest errors.

---

### P1-T10 · Update: Convert background.js and us.js to a service worker

**Files:** `update/background.js`, `update/us.js`

**Changes:**

1. Add `importScripts('us.js');` at the top of `background.js`. Service workers support `importScripts()` for loading auxiliary scripts.[^7]
2. Replace `chrome.extension.onConnect.addListener` → `chrome.runtime.onConnect.addListener`.[^3]
3. Replace `chrome.browserAction.setIcon(...)` → `chrome.action.setIcon(...)` (in `us.js`, inside `feedUnreadList.refresh()`).
4. Replace all `window.localStorage` usage in both files with `chrome.storage.local`. The two key objects are:
   - `feedDate`: `{[feedUrl]: timestamp}` — persisted between service worker wakes
   - `feedUnread`: `{[bookmarkId]: "update"|"error"|"noupdate"}` — persisted

   **Pattern for initialization:**
   ```js
   let feedDate = {};
   let feedUnread;

   chrome.storage.local.get(['feedDate','feedUnread'], (data) => {
     feedDate = data.feedDate || {};
     feedUnread = new feedUnreadList(data.feedUnread || {});
   });
   ```
   **Pattern for persistence:** replace `window.localStorage.feedDate = JSON.stringify(this)` with `chrome.storage.local.set({feedDate: this})`.
5. Service workers are ephemeral — the port-based connection (`chrome.runtime.onConnect`) keeps the service worker alive during an update cycle. Verify this works; if not, use `chrome.runtime.connect` keepalive pattern.[^8]
6. Remove prototype mutation on `Date` (`Date.prototype.setISO8601`) — this should be a standalone function instead (see P2-T1).
7. The `for(x in l)` loop in `feedUnreadList` iterates object keys; replace with `Object.keys(l).forEach(k => ...)` to avoid iterating prototype properties.

**Acceptance:** Feed updates check and persist correctly across service worker restarts.

---

### P1-T11 · Update: Fix deprecated APIs in popup.js

**Files:** `update/popup.js`

**Changes:**

1. Replace `chrome.extension.connect({name: "feedUpdate"})` → `chrome.runtime.connect({name: "feedUpdate"})`.
2. Replace `chrome.tabs.getSelected(null, callback)` → `chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => callback(tab))`.
3. The `reSubscribeLink` regex `chrome-extension://.*\/subscribe.html\?(.*)` is hardcoded. Replace the hostname portion with `chrome.runtime.id`:
   ```js
   const reSubscribeLink = new RegExp(`chrome-extension://${chrome.runtime.id}/subscribe\\.html\\?(.*)`);
   ```
   Or better: check if the URL starts with `chrome.runtime.getURL('subscribe.html')`.
4. Migrate `window.localStorage.listWidth`, `window.localStorage.openInCurrentTab`, `window.localStorage.defaultView`, `window.localStorage.extensionPath`, `window.localStorage.updateBookmarks` → `chrome.storage.local`.
5. Wrap `main()` in a `chrome.storage.local.get(...)` call to load all settings before rendering.

**Acceptance:** Popup loads bookmark feed list; update button works.

---

### P1-T12 · Update: Migrate localStorage in viewselect.js and options.js

**Files:** `update/viewselect.js`, `update/options.js`

**Changes:**

1. In `viewselect.js`, `defaultView`, `extensionPath` are read from `window.localStorage` at module load time. Since this is a non-background page, `localStorage` technically still works, but migrate to `chrome.storage.local` for consistency and Firefox compatibility (Phase 3). Wrap initialization in `chrome.storage.local.get(...)`.
2. In `options.js`, migrate checkbox state and view choice reads/writes to `chrome.storage.local`.

**Acceptance:** Options page saves and loads correctly.

---

## Phase 2 — Refactoring

*Reduces duplication and prepares for Firefox and testing. Not strictly required for Chrome MV3 but strongly recommended before Phase 3.*

---

### P2-T1 · Extract shared date parsing utility

**Problem:** The ISO8601 parser (`Date.prototype.setISO8601`, `reISO8601`, `getDate`) is duplicated verbatim in `preview/iframe.js` and `update/us.js`. Mutating `Date.prototype` is considered bad practice.[^9]

**Files:** Create `shared/date-utils.js`; modify `preview/iframe.js`, `update/us.js`

**Changes:**

Create `shared/date-utils.js`:
```js
const ISO8601_RE = /(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2}):?(\d{2})(\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))/;
const RFC2822_RE = /\w+,\s+\d+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+[+-]\d{4}/;

export function parseDate(dString) {
  if (!dString) return null;
  // Try native Date.parse first (handles ISO8601 and RFC2822)
  const ts = Date.parse(dString);
  if (!isNaN(ts)) return new Date(ts);
  // Fallback to custom ISO8601 parser for edge cases
  // ... (move existing logic here, return a Date instead of mutating)
  return null;
}

export function getItemDate(item) {
  const tags = ['pubDate', 'published', 'updated'];
  const nsDate = item.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'date')[0];
  for (const tag of tags) {
    const el = item.getElementsByTagName(tag)[0];
    if (el) return parseDate(el.textContent);
  }
  if (nsDate) return parseDate(nsDate.textContent);
  return null;
}
```

Remove the duplicated code from both source files and import from `shared/date-utils.js` (requires ES modules — see P2-T4, or use `importScripts` for service workers).

---

### P2-T2 · Extract shared feed parser

**Problem:** Feed parsing logic (`getLink`, `getDescription`, `containsFeed`, `buildPreview`) lives only in the preview extension but logically belongs to both.

**Files:** Create `shared/feed-parser.js`; modify `preview/iframe.js`

Move `getLink`, `getDescription`, `containsFeed` to `shared/feed-parser.js`. `buildPreview` has DOM dependencies (it builds the UI) and should stay in `iframe.js`, but it can call the shared functions.

---

### P2-T3 · Remove NodeList.prototype mutation

**Files:** `preview/iframe.js`

Replace `NodeList.prototype.toArray` (added in the file) with `Array.from(nodeList)`. This was already partially done (comment in git log: "remove some spurious .toArray()s"), but the prototype extension itself was left behind. Remove it.

---

### P2-T4 · Convert to ES modules

**Background:** Currently all scripts are loaded via `<script src="...">` tags and share a single global namespace. ES modules (`<script type="module">`) give proper encapsulation, explicit imports, and are supported in MV3 extension pages and service workers.[^10]

**Files:** All `.js` files; all `.html` files

**Changes:**
1. Add `export` to functions/constants that are used by other files.
2. Add `import` statements at the top of each file.
3. Change `<script src="...">` to `<script type="module" src="...">` in HTML files.
4. Service worker modules: use `"background": {"service_worker": "background.js", "type": "module"}` in manifest.[^10]
5. Remove the global variable conventions — no more implicit globals.

**Note:** `importScripts()` is not available in ES module service workers — imports must use `import` syntax.

---

### P2-T5 · Create shared storage wrapper

**Files:** Create `shared/storage.js`

Both extensions use `chrome.storage.local` extensively after the Phase 1 migration. Create a thin typed wrapper:

```js
export const storage = {
  async get(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  },
  async set(items) {
    return new Promise(resolve => chrome.storage.local.set(items, resolve));
  },
  async remove(keys) {
    return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
  }
};
```

Using Promise-based wrappers makes the code cleaner and compatible with `async/await`.

---

## Phase 3 — Firefox Support

*The extensions should work in Firefox after Phase 1 (Firefox supports MV3 since v109[^11]), but these tasks address differences and add explicit Firefox support.*

---

### P3-T1 · Add browser_specific_settings to both manifests

**Files:** `preview/manifest.json`, `update/manifest.json`

Firefox requires an add-on ID for `chrome.storage.sync` and for signed distribution.[^12]

Add to both manifests:
```json
"browser_specific_settings": {
  "gecko": {
    "id": "shoyu-preview@shoyu.local",
    "strict_min_version": "109.0"
  }
}
```

Choose distinct IDs for each extension. The `id` must be a valid email or UUID.

---

### P3-T2 · Add WebExtension browser namespace polyfill

**Files:** All JS files

Chrome uses callback-based `chrome.*` APIs; Firefox uses Promise-based `browser.*` APIs. The `webextension-polyfill` library[^13] normalizes both.

**Option A (recommended for simplicity):** Use the polyfill. Bundle it locally (do not load from CDN — extension CSP blocks remote scripts).

1. Download `browser-polyfill.min.js` from the release page.
2. Add as first `<script>` in all HTML pages; add `importScripts('browser-polyfill.min.js')` in service worker.
3. Replace `chrome.*` with `browser.*` throughout all JS files (the polyfill makes `browser.*` available in Chrome too).

**Option B (zero dependency):** Use a shim at top of each file:
```js
const api = typeof browser !== 'undefined' ? browser : chrome;
```
Use `api.*` throughout instead of `chrome.*`. Less complete but requires no external files.

---

### P3-T3 · Handle Firefox MV3 service worker differences

**Files:** `preview/background.js`, `update/background.js`

Firefox's MV3 service worker support has some differences from Chrome:[^14]
- Firefox supports `browser.action` (not `chrome.action`) before the polyfill is applied.
- `declarativeContent` API is not supported in Firefox — the `chrome.action.enable/disable` approach used in P1-T2 works correctly.
- Firefox service workers may have different wake-up behavior — test the port-based keepalive.
- `chrome.scripting.executeScript` is supported in Firefox MV3 (v102+).

Add a comment block at the top of each background file listing Firefox compatibility notes.

---

### P3-T4 · Fix hardcoded chrome-extension:// URLs for Firefox

**Files:** `update/locale.js`, `update/viewselect.js`, `update/popup.js`

Firefox extension pages use `moz-extension://` rather than `chrome-extension://`. Any hardcoded `chrome-extension://` strings will break.

1. In `locale.js`, the `defaultFeedList` includes a FOXNews URL with a hardcoded Shoyu Preview extension ID:
   ```
   "url":"chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/subscribe.html?..."
   ```
   Replace with a relative reference using `browser.runtime.getURL('subscribe.html?...')`.
2. In `viewselect.js`, `defaultExtensionPath` has hardcoded extension IDs. Replace `'shoyu'` and `'google'` paths with either dynamic discovery or remove the cross-extension detection feature (see P5-T4 for context).
3. In `popup.js`, update the `reSubscribeLink` regex after P1-T11 already addresses this with `chrome.runtime.id`.

---

## Phase 4 — Security

---

### P4-T1 · Fix XSS in iframe.js — sanitize RSS content before innerHTML

**Severity:** High. RSS feed content is attacker-controlled and is currently set directly as `innerHTML`.

**Files:** `preview/iframe.js`

**Vulnerable lines:**
```js
divDesc.innerHTML = itemDesc;       // RSS <description> or <content:encoded>
divDate.innerHTML = pubDate;        // date string (low risk but still innerHTML)
divAuth.innerHTML = pubAuth;        // author string
anchor.innerHTML = itemTitle;       // feed item title
anchor.innerHTML = anchor.innerText; // attempt to sanitize (fragile)
```

**Fix:** Use the [DOMPurify](https://github.com/cure53/DOMPurify) library to sanitize before setting `innerHTML`.[^15]

```js
import DOMPurify from './dompurify.min.js';

divDesc.innerHTML = DOMPurify.sanitize(itemDesc, {
  ALLOWED_TAGS: ['p','b','i','em','strong','a','ul','ol','li','br','img','h1','h2','h3','blockquote','pre','code'],
  ALLOWED_ATTR: ['href','src','alt','title','class']
});
```

For low-risk fields (date, author):
```js
divDate.textContent = pubDate;   // no HTML needed
divAuth.textContent = pubAuth;   // no HTML needed
```

For the title anchor — use `textContent` directly (titles should not contain HTML):
```js
anchor.textContent = itemTitle;
```

**Note:** The current `anchor.innerHTML = anchor.innerText` double-assignment was an attempt to strip HTML from titles. Replace with `anchor.textContent = itemTitle` which is both safer and simpler.

---

### P4-T2 · Bundle DOMPurify locally

**Files:** `preview/dompurify.min.js` (new); `preview/manifest.json`

1. Download DOMPurify from its [GitHub releases](https://github.com/cure53/DOMPurify/releases) (the `purify.min.js` file).
2. Copy to `preview/dompurify.min.js`.
3. Add to `web_accessible_resources` if it needs to be loaded by the viewer iframe (it does).
4. Do not load from a CDN — extension CSP blocks `script-src` from remote origins.[^16]

---

### P4-T3 · Validate feed URLs before navigation and XHR

**Files:** `preview/subscribe.js`, `update/popup.js`

URLs come from:
- Query string in `subscribe.js` (`feedUrl = decodeURIComponent(queryString[0])`)
- Bookmark URLs in `popup.js` (update extension)
- Reader URL templates in options

Validation:
```js
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch { return false; }
}
```

In `subscribe.js`, validate `feedUrl` before `req.open("GET", feedUrl, true)`. If invalid, call `handleFeedParsingFailed("Invalid feed URL")` and return.

In `popup.js` (update), validate `sff[c].url` before rendering bookmark links.

---

### P4-T4 · Review and tighten Content Security Policy

**Files:** `preview/manifest.json`, `update/manifest.json`

MV3 automatically restricts `unsafe-eval` and `unsafe-inline` in extension pages. Verify no remaining violations:

1. No `setTimeout(string, ...)` — fixed in P1-T4.
2. No `innerHTML` with user-controlled content in HTML files (options.html, popup.html).
3. No inline `<script>` tags in HTML — move to external `.js` files.
4. Review `subscribe.html` which uses inline `<link id="style">` dynamic updates — these are attribute changes, not script execution, so they are fine.
5. Add explicit CSP to manifests:
   ```json
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'none';"
   }
   ```

---

### P4-T5 · Remove hardcoded extension IDs and dead URLs from locale.js

**Files:** `update/locale.js`

The `defaultFeedList` contains:
- A FOXNews URL with the hardcoded Shoyu Preview extension ID `ilicaedjojicckapfpfdoakbehjpfkah`.
- BBC, Economist, NYT Magazine, Gizmodo URLs that are likely dead or changed.

The extension ID is particularly dangerous — it encodes `chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/subscribe.html?http%3A%2F%2Fwww.foxnews.com/...`. Any user who installs the Update extension with a different extension ID for Preview will get broken bookmarks.

**Fix:**
1. Remove the hardcoded extension ID bookmark — generate it dynamically using `browser.runtime.getURL('subscribe.html?' + encodeURIComponent(url))` when creating default bookmarks.
2. Update or remove stale feed URLs (see P5-T4 for updated list).

---

## Phase 5 — Bug Fixes & RSS Rendering

---

### P5-T1 · Fix relative URL resolution in feed content

**Files:** `preview/iframe.js`

**Current (broken):**
```js
var chromeExt = new RegExp(/^chrome-extension:\/\/[^\/]*\//);
imgUrlFix[x].src = imgUrlFix[x].src.replace(chromeExt, "http://" + feedUrl.split("/")[2] + "/");
```

`feedUrl.split("/")[2]` extracts the hostname by position — this breaks for:
- URLs with ports: `http://example.com:8080/feed` → `example.com:8080` (OK actually)
- Non-standard URLs
- `chrome-extension://` replacement now needs to be `moz-extension://` on Firefox too

**Fix:** Use `URL` API for proper resolution:
```js
const feedBase = new URL(feedUrl).origin + '/';
const extOriginRE = /^(chrome|moz)-extension:\/\/[^\/]*\//;

for (const img of divDesc.getElementsByTagName('img')) {
  if (extOriginRE.test(img.src)) {
    img.src = img.getAttribute('src').startsWith('/')
      ? feedBase + img.getAttribute('src').slice(1)
      : new URL(img.getAttribute('src'), feedUrl).href;
  }
}
```

Similarly for `<a>` tags.

---

### P5-T2 · Fix date parsing for RFC 2822 format (RSS 2.0)

**Files:** `shared/date-utils.js` (created in P2-T1), or `preview/iframe.js` and `update/us.js` if P2-T1 is skipped

RSS 2.0 uses RFC 2822 dates (`Mon, 01 Jan 2024 00:00:00 +0000`) while Atom uses ISO8601. The current custom ISO8601 parser silently returns an invalid date for RFC 2822 input, then falls back to `Date.parse(dString)`. `Date.parse` handles RFC 2822 in most engines, but the fallback happens after the regex has failed.

**Fix:** Reorder the parsing logic — try `Date.parse` first, and only use the custom ISO8601 parser for values `Date.parse` cannot handle:
```js
export function parseDate(str) {
  if (!str) return null;
  const ts = Date.parse(str.trim());
  if (!isNaN(ts)) return new Date(ts);
  // Custom ISO8601 with timezone for edge cases
  // ...
  return null;
}
```

---

### P5-T3 · Fix duplicate XML parsing in subscribe.js

**Files:** `preview/subscribe.js`

In `handleResponse()`:
```js
var doc = req.responseXML;   // parse #1 (browser native)
// ... uses doc for title/link/description

var parser = new DOMParser();
var doc = parser.parseFromString(req.responseText, "text/xml"); // parse #2
buildPreview(doc, feedUrl);
```

The second parse is redundant. `req.responseXML` is already the parsed document. The re-parse with `DOMParser` exists because `responseXML` can be `null` when `Content-Type` is not XML — but `overrideMimeType('text/xml')` is set, which forces XML parsing. Remove the redundant parse:
```js
buildPreview(req.responseXML, feedUrl);
```

If `responseXML` is null despite `overrideMimeType`, report the error rather than re-parsing.

---

### P5-T4 · Update default feed reader list and default bookmark feeds

**Files:** `preview/common.js`, `update/locale.js`

**Feed readers — `preview/common.js` `defaultReaderList()`:**

| Current | Status | Replacement |
|---|---|---|
| Feedly | Active | Keep |
| Blogtrottr | Active | Keep |
| My Yahoo | RSS dead | Remove or replace with Inoreader |
| The Old Reader | Active | Keep |
| Default Application | Keep | Keep |

Add: [Inoreader](https://www.inoreader.com), [NewsBlur](https://newsblur.com), [Feedbin](https://feedbin.com).

**Default bookmark feeds — `update/locale.js` `defaultFeedList`:**

Many URLs are dead or changed. Replace with currently-active feeds. Remove the hardcoded FOXNews entry with the embedded extension ID (see P4-T5). Verify each URL resolves before including.

---

### P5-T5 · Fix popup.js `chrome.tabs.getSelected` removal (update extension)

**Files:** `update/popup.js`

The update popup uses `chrome.tabs.getSelected(null, callback)` to find the current tab for the "open in current tab" feature. This was already noted in P1-T11 but bears its own task since it also affects the `openInCurrentTab` feature path.

After replacing with `chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => ...)`, verify the full click-to-open flow works correctly.

---

### P5-T6 · Fix for-in loops on arrays and objects

**Files:** `update/us.js`, `update/popup.js`, `preview/iframe.js`

Multiple places use `for (x in arr)` to iterate arrays (`req.feeds`, `sff`, etc.). `for...in` iterates enumerable properties including prototype methods — it should not be used for arrays.[^17]

Replace:
- `for (y in req.feeds)` → `for (const node of req.feeds)` or `req.feeds.forEach(...)`
- `for (c in sff)` → `for (const child of sff)`
- `for (x in ep)` → `for (const x of Object.keys(ep))`
- `for (r in removetags)` → `for (const tag of removetags)`
- `for (x in l)` in `feedUnreadList` constructor → `Object.keys(l).forEach(...)`

---

## Phase 6 — Testing

---

### P6-T1 · Set up test infrastructure

**Files:** `package.json` (new), `vitest.config.js` (new)

Use [Vitest](https://vitest.dev)[^18] — it supports ES modules natively, runs fast, and requires minimal config.

```json
{
  "name": "shoyu",
  "private": true,
  "type": "module",
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

---

### P6-T2 · Unit tests for feed parser

**Files:** `tests/feed-parser.test.js` (new), `tests/fixtures/` (new)

Create XML fixture files:
- `tests/fixtures/rss2.xml` — RSS 2.0 with items, enclosures, dc:date
- `tests/fixtures/atom.xml` — Atom 1.0 with entries, links, content
- `tests/fixtures/rdf.xml` — RSS 1.0/RDF
- `tests/fixtures/empty-feed.xml` — Feed with no items
- `tests/fixtures/malformed.xml` — Invalid XML

Test cases:
- `getLink` returns correct URL for `<link href>`, `<link>` text, multiple links with various `rel` values
- `getDescription` priority: `content:encoded` > `description` > `content` > `summary`
- `containsFeed` correctly identifies RSS/Atom/RDF root elements
- `buildPreview` creates expected DOM structure for each fixture
- Enclosures: image type converts to `<img>`, non-image creates link

---

### P6-T3 · Unit tests for date utilities

**Files:** `tests/date-utils.test.js` (new)

Test cases for `parseDate`:
- ISO8601 with timezone: `"2024-01-01T12:00:00Z"` → correct UTC timestamp
- ISO8601 with offset: `"2024-01-01T12:00:00+05:30"` → correct UTC timestamp
- RFC 2822: `"Mon, 01 Jan 2024 12:00:00 +0000"` → correct timestamp
- Missing fractional seconds
- Invalid string → `null`
- Empty string → `null`

Test cases for `getItemDate`:
- RSS item with `pubDate`
- Atom entry with `published`
- Atom entry with `updated` only
- dc:date namespace
- Item with no date tag → `null`

---

### P6-T4 · Unit tests for storage migration

**Files:** `tests/storage.test.js` (new)

Mock `chrome.storage.local` (use a simple in-memory mock). Test:
- Settings load correctly from storage
- Defaults are applied when keys are missing
- Settings save correctly
- Reader list CRUD operations (add, edit, remove, set default)

---

### P6-T5 · Integration tests with Playwright + web-ext

**Files:** `tests/e2e/` (new), `package.json` (update)

Use [Playwright](https://playwright.dev)[^19] to load the extension in a real Chromium instance:

```js
import { test } from '@playwright/test';
import path from 'path';

test('preview detects feed on page', async ({ context }) => {
  // context is launched with the extension loaded
  const page = await context.newPage();
  await page.goto('https://example.com/feed.rss'); // use a local test server
  // assert toolbar icon becomes active
});
```

Set up a local HTTP server (`preview/tests/server.js`) that serves the XML fixtures.

Tests:
- Feed icon appears when visiting a page with feed links
- Feed icon does not appear on a normal HTML page
- Preview page renders feed title and items
- Subscribe button navigates to reader URL

---

### P6-T6 · Add GitHub Actions CI

**Files:** `.github/workflows/test.yml` (new)

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```

---

## Execution Order

```
Phase 1:   P1-T1 → P1-T2 → P1-T3 → P1-T4 → P1-T5 → P1-T6 → P1-T7 → P1-T8
           P1-T9 → P1-T10 → P1-T11 → P1-T12

Phase 2:   P2-T1 (after Phase 1)
           P2-T2, P2-T3 (parallel, after P2-T1)
           P2-T4 (after P2-T2, P2-T3)
           P2-T5 (parallel with P2-T1)

Phase 3:   P3-T1 → P3-T2 → P3-T3 → P3-T4

Phase 4:   P4-T2 → P4-T1
           P4-T3, P4-T4, P4-T5 (independent, after Phase 1)

Phase 5:   P5-T1, P5-T2 (after P2-T1)
           P5-T3, P5-T4, P5-T5, P5-T6 (independent, after Phase 1)

Phase 6:   P6-T1 → P6-T2, P6-T3, P6-T4 (parallel)
           P6-T2 → P6-T5
           P6-T1 → P6-T6
```

---

## Suggested Repository Restructure

After Phase 2:
```
shoyu/
├── shared/
│   ├── date-utils.js       # ISO8601 + RFC2822 parsing
│   ├── feed-parser.js      # getLink, getDescription, containsFeed
│   └── storage.js          # Promise wrapper for chrome.storage.local
├── preview/
│   ├── manifest.json       # MV3
│   ├── background.js       # Service worker
│   ├── content/
│   │   ├── doc_start.js
│   │   ├── feed_finder.js
│   │   └── sniff_common.js
│   ├── pages/
│   │   ├── subscribe.html + subscribe.js
│   │   ├── viewer.html + iframe.js
│   │   ├── popup.html + popup.js
│   │   └── options.html + options.js
│   ├── dompurify.min.js
│   └── assets/ (icons, css)
├── update/
│   ├── manifest.json       # MV3
│   ├── background.js       # Service worker (imports us.js)
│   ├── us.js
│   ├── pages/
│   │   ├── popup.html + popup.js
│   │   ├── options.html + options.js
│   │   └── subscribe.html + subscribe.js
│   └── assets/ (icons)
├── tests/
│   ├── fixtures/           # XML test feeds
│   ├── unit/
│   └── e2e/
└── package.json
```

---

## References

[^1]: Chrome MV2 deprecation timeline — https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
[^2]: `chrome.action` API (unified replacement for pageAction + browserAction) — https://developer.chrome.com/docs/extensions/reference/api/action
[^3]: MV3 migration guide: messaging changes — https://developer.chrome.com/docs/extensions/develop/migrate/api-calls
[^4]: `chrome.action.enable` / `chrome.action.disable` per tab — https://developer.chrome.com/docs/extensions/reference/api/action#method-enable
[^5]: `chrome.tabs.query` — https://developer.chrome.com/docs/extensions/reference/api/tabs#method-query
[^6]: MV3 content security policy — data: URIs blocked in extension pages — https://developer.chrome.com/docs/extensions/develop/migrate/improve-security#remove-remote-code
[^7]: Service worker module types and `importScripts` — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
[^8]: Service worker keepalive via ports — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle#keep-sw-alive
[^9]: Why mutating built-in prototypes is harmful — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain#bad_practice_extension_of_native_prototypes
[^10]: ES modules in MV3 extensions — https://developer.chrome.com/docs/extensions/develop/concepts/esm
[^11]: Firefox MV3 support status — https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
[^12]: Firefox add-on IDs required for storage — https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/
[^13]: webextension-polyfill — https://github.com/mozilla/webextension-polyfill
[^14]: Firefox MV3 differences from Chrome — https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/#differences-from-chrome
[^15]: DOMPurify — https://github.com/cure53/DOMPurify
[^16]: MV3 extension CSP and remote code prohibition — https://developer.chrome.com/docs/extensions/develop/migrate/improve-security
[^17]: MDN: for...in on arrays is discouraged — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in#array_iteration_and_for...in
[^18]: Vitest — https://vitest.dev/guide/
[^19]: Playwright for browser extensions — https://playwright.dev/docs/chrome-extensions
