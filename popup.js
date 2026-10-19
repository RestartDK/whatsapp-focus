const FOCUS_KEY = 'focusEnabled';
const toggle = document.getElementById('toggle');

document.getElementById('shortcut').textContent = /Mac|iPhone|iPad/.test(navigator.platform)
  ? '⌘⇧H'
  : 'Ctrl+Shift+H';

const render = (enabled) => {
  toggle.checked = enabled;
};

toggle.addEventListener('change', () => {
  void chrome.storage.local.set({ [FOCUS_KEY]: toggle.checked });
});

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[FOCUS_KEY];
  if (area === 'local' && change) render(change.newValue);
});

void chrome.storage.local.get({ [FOCUS_KEY]: false }).then((stored) => render(stored[FOCUS_KEY]));
