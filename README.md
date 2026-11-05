# WA Focus

Chrome extension for WhatsApp Web. Hides the chat list and icon rail so the open conversation fills the window.

## Install

1. Open `chrome://extensions` (or `helium://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** and pick this folder.

## Use

- Click the toolbar icon and turn on **Focus mode**, or press `⌘⇧H` (`Ctrl+Shift+H` on Windows/Linux) while WhatsApp Web is focused.
- Focus mode hides the unread count in the tab title and uses a plain black-and-white WhatsApp favicon. New counts stay hidden until you turn focus mode off, which restores the latest title and favicon.
- Same shortcut turns it off and brings the list back.
- The setting lives in `chrome.storage.local`, so it survives reloads and applies to every WhatsApp Web tab.

If no chat is selected, focus mode leaves WhatsApp's intro panel full width. Pick a chat before toggling on, or toggle off to choose a different one.

## How it works

`focus.css` hides the two flex children that hold the sidebar and the icon rail when `data-wa-focus` is set on `<html>`. WhatsApp's own flex layout then stretches the conversation pane. Sidebar nodes are not moved or observed, so WhatsApp re-renders do not fight it. Three follow-up rules keep the leftovers honest: the pane divider border, and the two drawer anchors that reserved space for the hidden rail.

`content.js` observes title and favicon changes in `<head>`. Focus mode removes a leading title count such as `(12)` and replaces every favicon candidate with `icons/focus.png`. It remembers the latest page-authored title and favicon attributes for restoration and ignores its own writes. A temporary icon covers pages with no favicon and disappears when focus mode is off. The existing shortcut, popup, and saved setting control both behaviors.

Only the static favicon is exposed as a web-accessible resource, restricted to WhatsApp Web. No new permissions are required.

The selectors read WhatsApp's own hooks (`#side`, `div.two`, `data-testid="chatlist-header"`, `drawer-left`, `drawer-middle`, `drawer-fullscreen`). A rename there makes the list reappear; nothing else breaks.

## Verification

The layout scripts drive a Chromium instance with a logged-in WhatsApp Web session, so they need a profile copy and a running browser:

```
Helium --headless=new --remote-debugging-port=9334 \
  --user-data-dir=/tmp/wa-verify --window-size=1440,900 \
  --disable-extensions-except=$PWD --load-extension=$PWD about:blank

node scripts/verify.mjs 9334      # acceptance: baseline, hotkey, persistence, restore
node scripts/break-ui.mjs 9334    # empty state, open drawer, narrow, 200% zoom
node scripts/popup-check.mjs 9334 # popup switch drives the WhatsApp tab
```

`node scripts/title-check.mjs <port>` checks the tab title with controlled unread counts on WhatsApp Web. It does not require login. It covers the shortcut, later title updates, cleared counts, title-node replacement, pending updates at toggle time, and saved focus mode after reload.

`node scripts/favicon-check.mjs <port>` checks multiple favicon candidates, later badge updates, replaced and removed nodes, missing icons, pending updates at toggle time, and persistence. It uses controlled favicon updates on WhatsApp Web and does not require login.

`scripts/narrow.mjs <port>` covers a real narrow window; launch the browser with `--window-size=700,820` for it.

The screenshots show your real chats, so the harness writes them to `$TMPDIR/wa-focus-evidence`, outside the repository. Override with `EVIDENCE_DIR=...`. Never commit them.

The focus favicon uses the [WhatsApp mark from Simple Icons](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/whatsapp.svg), distributed under [CC0 1.0](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/LICENSE.md).

Not covered: light theme (the harness cannot switch WhatsApp's stored theme; the toast uses hard-coded colours), and non-macOS Ctrl handling, since these runs happened on macOS and pressed the meta variant.
