// Drives the toolbar popup page for real: opens popup.html in its own tab and
// checks that the switch follows and drives the WhatsApp Web tab.
// usage: node scripts/popup-check.mjs <port> [extension-path]
import { createHash } from 'node:crypto';
import { connect } from './lib.mjs';

const port = process.argv[2] ?? '9334';
const extensionPath = process.argv[3] ?? new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const hash = createHash('sha256').update(extensionPath).digest('hex').slice(0, 32);
const extensionId = [...hash].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');

const wa = await connect(port);
await wa.send('Page.enable');
await wa.send('Runtime.enable');

if (!/^https:\/\/web\.whatsapp\.com/.test(await wa.evaluate('location.href'))) {
  await wa.send('Page.navigate', { url: 'https://web.whatsapp.com/' });
  await wa.waitFor(`!!document.querySelector('#side [data-testid="cell-frame-container"]')`);
}
const before = await wa.state();

const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`chrome-extension://${extensionId}/popup.html`)}`, { method: 'PUT' })).json();
const popupWs = new WebSocket(created.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
popupWs.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
};
await new Promise((r) => (popupWs.onopen = r));
const popupSend = (method, params = {}) => new Promise((res) => { pending.set(++seq, res); popupWs.send(JSON.stringify({ id: seq, method, params })); });
const popupEval = async (expression) => {
  const res = await popupSend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
};

await popupSend('Runtime.enable');
for (let i = 0; i < 40; i += 1) {
  if ((await popupEval('document.readyState')) === 'complete') break;
  await new Promise((r) => setTimeout(r, 100));
}
const opened = await popupEval(`(() => {
  const toggle = document.getElementById('toggle');
  return { title: document.querySelector('h1').textContent, checked: toggle.checked, shortcut: document.getElementById('shortcut').textContent };
})()`);
const failures = [];
const expect = (label, condition, detail = '') => { if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`); };
expect('popup mirrors the whatsapp tab', opened.checked === before.focus, `popup=${opened.checked} wa=${before.focus}`);

await popupEval(`document.getElementById('toggle').click()`);
await new Promise((r) => setTimeout(r, 1500));
const after = { popup: await popupEval(`document.getElementById('toggle').checked`), wa: (await wa.state()).focus };
expect('popup switch flips the whatsapp tab', after.wa === !before.focus, `popup=${after.popup} wa=${after.wa}`);
expect('popup switch matches storage', after.popup === !before.focus, `popup=${after.popup}`);

await popupEval(`document.getElementById('toggle').click()`);
await new Promise((r) => setTimeout(r, 1500));
const restored = { popup: await popupEval(`document.getElementById('toggle').checked`), wa: (await wa.state()).focus };
expect('second flip restores the whatsapp tab', restored.wa === before.focus, `popup=${restored.popup} wa=${restored.wa}`);

await popupSend('Page.captureScreenshot', { format: 'png' }).then(async (res) => {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL('../evidence/popup-01-open.png', import.meta.url).pathname, Buffer.from(res.data, 'base64'));
});

await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
console.log(JSON.stringify({ extensionId, opened, before: before.focus, after, restored, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
