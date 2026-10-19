# WA Focus

Chrome extension for WhatsApp Web. Hides the chat list and icon rail so the open conversation fills the window.

## Install

1. Open `chrome://extensions` (or `helium://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** and pick this folder.

## Use

- Click the toolbar icon and turn on **Focus mode**, or press `⌘⇧H` (`Ctrl+Shift+H` on Windows/Linux) while WhatsApp Web is focused.
- Same shortcut turns it off and brings the list back.
- The setting lives in `chrome.storage.local`, so it survives reloads and applies to every WhatsApp Web tab.

If no chat is selected, focus mode leaves WhatsApp's intro panel full width. Pick a chat before toggling on, or toggle off to choose a different one.

## How it works

`focus.css` hides the two flex children that hold the sidebar and the icon rail when `data-wa-focus` is set on `<html>`. WhatsApp's own flex layout then stretches the conversation pane. No DOM nodes are moved or observed, so WhatsApp re-renders do not fight it. Three follow-up rules keep the leftovers honest: the pane divider border, and the two drawer anchors that reserved space for the hidden rail.

The selectors read WhatsApp's own hooks (`#side`, `div.two`, `data-testid="chatlist-header"`, `drawer-left`, `drawer-middle`, `drawer-fullscreen`). A rename there makes the list reappear; nothing else breaks.

## Verification

Each script drives a Chromium instance serving a logged-in WhatsApp Web session, so they need a profile copy and a running browser:

```
Helium --headless=new --remote-debugging-port=9334 \
  --user-data-dir=/tmp/wa-verify --window-size=1440,900 \
  --disable-extensions-except=$PWD --load-extension=$PWD about:blank

node scripts/verify.mjs 9334      # acceptance: baseline, hotkey, persistence, restore
node scripts/break-ui.mjs 9334    # empty state, open drawer, narrow, 200% zoom
node scripts/popup-check.mjs 9334 # popup switch drives the WhatsApp tab
```

`scripts/narrow.mjs <port>` covers a real narrow window; launch the browser with `--window-size=700,820` for it.

The screenshots show your real chats, so the harness writes them to `$TMPDIR/wa-focus-evidence`, outside the repository. Override with `EVIDENCE_DIR=...`. Never commit them.

Not covered: light theme (the harness cannot switch WhatsApp's stored theme; the toast uses hard-coded colours), and non-macOS Ctrl handling, since these runs happened on macOS and pressed the meta variant.
