const FOCUS_KEY = 'focusEnabled';
const FOCUS_ATTR = 'data-wa-focus';
const TOAST_ID = 'wa-focus-toast';
const TOAST_MS = 1800;
const FAVICON_SELECTOR = 'link[rel~="icon" i]';
const FOCUS_FAVICON = chrome.runtime.getURL('icons/focus.png');

const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧H' : 'Ctrl+Shift+H';

let enabled = false;
let valueLocked = false;
let toastSeq = 0;
let toastTimer;
let pageTitle = document.title;
const pageIcons = new Map();
const fallbackIcon = document.createElement('link');
fallbackIcon.rel = 'icon';

const syncFavicons = () => {
  if (!document.head) return;
  const icons = new Set(document.head.querySelectorAll(FAVICON_SELECTOR));
  icons.delete(fallbackIcon);
  for (const [icon, attributes] of pageIcons) {
    if (enabled && icons.has(icon)) continue;
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null) icon.removeAttribute(name);
      else icon.setAttribute(name, value);
    }
    pageIcons.delete(icon);
  }
  if (!enabled || icons.size > 0) fallbackIcon.remove();
  if (!enabled) return;
  if (icons.size === 0) {
    if (fallbackIcon.rel !== 'icon') fallbackIcon.rel = 'icon';
    if (!fallbackIcon.isConnected) document.head.append(fallbackIcon);
    icons.add(fallbackIcon);
  }
  for (const icon of icons) {
    if (icon !== fallbackIcon && !pageIcons.has(icon)) {
      pageIcons.set(icon, { href: icon.getAttribute('href'), type: icon.getAttribute('type') });
    }
    if (icon.getAttribute('href') !== FOCUS_FAVICON) icon.href = FOCUS_FAVICON;
    if (icon.type !== 'image/png') icon.type = 'image/png';
  }
};

const hasTitleMutation = (mutations) =>
  mutations.some(({ target, addedNodes, removedNodes }) =>
    target.nodeName === 'TITLE' ||
    target.parentNode?.nodeName === 'TITLE' ||
    [...addedNodes, ...removedNodes].some((node) =>
      node.nodeName === 'TITLE' || node.querySelector?.('title'),
    ),
  );

const syncHead = (mutations = []) => {
  mutations = [...mutations, ...headObserver.takeRecords()];
  if (hasTitleMutation(mutations)) pageTitle = document.title;
  for (const { type, target, attributeName } of mutations) {
    const attributes = pageIcons.get(target);
    if (type === 'attributes' && attributes && (attributeName === 'href' || attributeName === 'type')) {
      attributes[attributeName] = target.getAttribute(attributeName);
    }
  }
  headObserver.disconnect();
  const title = enabled ? pageTitle.replace(/^\(\d+\)\s*/, '') : pageTitle;
  if (document.title !== title) document.title = title;
  syncFavicons();
  headObserver.observe(document.head ?? document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'rel', 'type'],
  });
};

const headObserver = new MutationObserver(syncHead);

syncHead();

const apply = (value) => {
  document.documentElement.toggleAttribute(FOCUS_ATTR, value);
  syncHead();
};

const lockValue = (value) => {
  valueLocked = true;
  enabled = value;
  apply(value);
};

const showToast = (value) => {
  clearTimeout(toastTimer);
  document.getElementById(TOAST_ID)?.remove();
  const seq = ++toastSeq;
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = value
    ? `Focus mode on · ${shortcutLabel} to exit`
    : 'Chat list shown';
  const mount = () => {
    if (seq !== toastSeq) return;
    (document.body ?? document.documentElement).append(toast);
    toastTimer = setTimeout(() => toast.remove(), TOAST_MS);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
};

const writeEnabled = (value) => chrome.storage.local.set({ [FOCUS_KEY]: value });

const toggle = () => {
  const next = !enabled;
  lockValue(next);
  return writeEnabled(next);
};

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[FOCUS_KEY];
  if (area !== 'local' || !change) return;
  lockValue(change.newValue === true);
  showToast(enabled);
});

window.addEventListener(
  'keydown',
  (event) => {
    if (event.repeat) return;
    const combo =
      event.shiftKey &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.code === 'KeyH';
    if (!combo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggle();
  },
  true,
);

void chrome.storage.local.get({ [FOCUS_KEY]: false }).then((stored) => {
  if (!valueLocked) lockValue(stored[FOCUS_KEY] === true);
});
