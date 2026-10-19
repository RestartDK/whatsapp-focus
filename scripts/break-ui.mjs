// break-ui pass for WA Focus: empty state, drawer open, narrow
// viewports, 200% zoom. usage: node scripts/break-ui.mjs <port>
import { connect, sleep } from './lib.mjs';

const port = process.argv[2] ?? '9334';
const { send, evaluate, waitFor, shot, pressHotkey, state, clickChat, clickAt, setViewport, clearViewport, setZoom, reload, expect, failures, problems } =
  await connect(port);

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const hasLayout = `!!document.querySelector('#side [data-testid="cell-frame-container"]') && !!document.querySelector('div.two')`;
const cases = [];

const record = async (name, note, check) => {
  const snapshot = await state();
  if (check) check(snapshot);
  cases.push({ case: name, note, ...snapshot, shot: await shot(name) });
};

const focusOnChecks = (label) => (s) => {
  expect(`${label}: list hidden`, s.chatList?.display === 'none', JSON.stringify(s.chatList));
  expect(`${label}: rail hidden`, s.rail?.display === 'none', JSON.stringify(s.rail));
  const anchored = s.drawers.filter((d) => d.testid === 'drawer-fullscreen' || d.testid === 'drawer-left');
  expect(`${label}: drawers at the left edge`, anchored.every((d) => d.x === 0), JSON.stringify(anchored));
};

const setFocus = async (focus) => {
  if ((await state()).focus !== focus) await pressHotkey();
  await sleep(300);
};

await send('Page.navigate', { url: 'https://web.whatsapp.com/' });
await waitFor(hasLayout);
await setFocus(false);

await record('break-00-baseline', 'focus off, chat list visible', (s) => {
  expect('baseline: list visible', s.chatList?.display !== 'none' && s.chatList.width > 0, JSON.stringify(s.chatList));
  expect('baseline: rail visible', s.rail?.display !== 'none' && s.rail.width > 0, JSON.stringify(s.rail));
});

const opened = await clickChat();
await waitFor(`!!document.querySelector('#main')`, 8000).catch(() => {});
await setFocus(true);
await record('break-01-long-conversation', `focus on, chat "${opened}"`, (s) => {
  focusOnChecks('long conversation')(s);
  expect('long conversation: full width', s.mainWidth === s.viewport, `${s.mainWidth}/${s.viewport}`);
});

await reload();
await waitFor(hasLayout);
await sleep(1200);
await record('break-02-empty-state', 'focus on, no chat selected', focusOnChecks('empty state'));

await setFocus(false);
const calls = await evaluate(`(() => {
  const tab = [...document.querySelectorAll('div.two > header button[aria-label]')]
    .find((el) => /Samtal|Calls/.test(el.getAttribute('aria-label') || ''));
  if (!tab) return null;
  const r = tab.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
if (!calls) throw new Error('rail calls tab not found');
await clickAt(calls.x, calls.y);
await setFocus(true);
await record('break-03-drawer-open', 'focus on while the calls drawer is open', (s) => {
  focusOnChecks('drawer open')(s);
  const panel = s.drawers.find((d) => d.testid === 'drawer-left');
  expect('drawer open: calls panel starts at the left edge', panel?.x === 0, JSON.stringify(panel));
});
await setFocus(false);
await clickAt(calls.x, calls.y);
await sleep(600);
await setFocus(true);

await setViewport(700, 800);
await record('break-05-narrow-700', 'focus on at 700px wide (emulated, not a real window size)', focusOnChecks('narrow 700'));
await setViewport(480, 820);
await record('break-06-narrow-480', 'focus on at 480px wide (emulated, not a real window size)', focusOnChecks('narrow 480'));
await clearViewport();

await setZoom('200%');
await pressHotkey();
await pressHotkey();
await record('break-07-zoom-200', 'focus on at 200% zoom, toast visible', (s) => {
  focusOnChecks('zoom 200%')(s);
  expect('zoom 200%: toast fits the viewport', s.toast !== null && s.toast.left >= 0 && s.toast.right <= s.viewport, JSON.stringify(s.toast));
});
await setZoom('');

expect('no runtime errors from the extension', problems.length === 0, problems.join('; '));

console.log(JSON.stringify({ cases, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
