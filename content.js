const FOCUS_KEY = 'focusEnabled';
const FOCUS_ATTR = 'data-wa-focus';
const TOAST_ID = 'wa-focus-toast';
const TOAST_MS = 1800;

const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧H' : 'Ctrl+Shift+H';

let enabled = false;
let valueLocked = false;
let toastSeq = 0;
let toastTimer;
let pageTitle = document.title;

const hasTitleMutation = (mutations) =>
  mutations.some(({ target, addedNodes, removedNodes }) =>
    target.nodeName === 'TITLE' ||
    target.parentNode?.nodeName === 'TITLE' ||
    [...addedNodes, ...removedNodes].some((node) =>
      node.nodeName === 'TITLE' || node.querySelector?.('title'),
    ),
  );

const syncTitle = () => {
  if (hasTitleMutation(titleObserver.takeRecords())) pageTitle = document.title;
  titleObserver.disconnect();
  const title = enabled ? pageTitle.replace(/^\(\d+\)\s*/, '') : pageTitle;
  if (document.title !== title) document.title = title;
  titleObserver.observe(document.head ?? document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
};

const titleObserver = new MutationObserver((mutations) => {
  if (hasTitleMutation(mutations)) pageTitle = document.title;
  syncTitle();
});

syncTitle();

const apply = (value) => {
  document.documentElement.toggleAttribute(FOCUS_ATTR, value);
  syncTitle();
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
