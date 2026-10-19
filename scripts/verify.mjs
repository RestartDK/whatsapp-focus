// Acceptance harness for WA Focus.
//
// Prerequisite: a Chromium instance serving a logged-in WhatsApp Web session,
// started with the extension loaded, e.g.
//   Helium --headless=new --remote-debugging-port=<port> \
//     --user-data-dir=<copy of a logged-in profile> \
//     --disable-extensions-except=$PWD --load-extension=$PWD
//
// usage: node scripts/verify.mjs <port>
import { connect, sleep } from './lib.mjs';

const port = process.argv[2] ?? '9334';
const { send, evaluate, waitFor, shot, pressHotkey, state, clickChat, reload, expect, failures, problems } = await connect(port);

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const hasLayout = `!!document.querySelector('#side [data-testid="cell-frame-container"]') && !!document.querySelector('div.two')`;

const setFocus = async (focus) => {
  if ((await state()).focus !== focus) await pressHotkey();
  await sleep(300);
};

await send('Page.navigate', { url: 'https://web.whatsapp.com/' });
await waitFor(hasLayout);
await setFocus(false);

let opened = await clickChat();
if (!opened) throw new Error('no chat row to open');
await waitFor(`!!document.querySelector('#main')`, 8000).catch(async () => {
  opened = await clickChat();
  await waitFor(`!!document.querySelector('#main')`);
});

const steps = [];
const record = async (step, shotName) => {
  steps.push({ step, ...(await state()), shot: await shot(shotName) });
};

await record('chat open, focus off', 'verify-01-focus-off');
const baseline = steps.at(-1);
expect('baseline shows the chat list', baseline.chatList?.display !== 'none' && baseline.chatList?.width > 0, JSON.stringify(baseline.chatList));
expect('baseline shows the rail', baseline.rail?.display !== 'none' && baseline.rail?.width > 0, JSON.stringify(baseline.rail));
expect('baseline conversation is narrower than the viewport', baseline.mainWidth > 0 && baseline.mainWidth < baseline.viewport, `${baseline.mainWidth}/${baseline.viewport}`);

await pressHotkey();
await record('after hotkey on', 'verify-02-focus-on');
const focused = steps.at(-1);
expect('hotkey turns focus on', focused.focus, JSON.stringify(focused));
expect('focus hides the chat list', focused.chatList?.display === 'none', JSON.stringify(focused.chatList));
expect('focus hides the rail', focused.rail?.display === 'none', JSON.stringify(focused.rail));
expect('focus gives the conversation the full viewport', focused.mainWidth === focused.viewport, `${focused.mainWidth}/${focused.viewport}`);
expect('focus mode announces itself', !!focused.toast, String(focused.toast));

await reload();
await waitFor(hasLayout);
await sleep(1000);
await record('after reload', 'verify-03-focus-persisted');
const reloaded = steps.at(-1);
expect('focus survives a reload', reloaded.focus, JSON.stringify(reloaded));
expect('reload keeps the list hidden', reloaded.chatList?.display === 'none', JSON.stringify(reloaded.chatList));

expect('drawers start at the left edge', reloaded.drawers.find((d) => d.testid === 'drawer-left')?.x === 0, JSON.stringify(reloaded.drawers));

await pressHotkey();
await record('after hotkey off', 'verify-04-focus-off-again');
const restored = steps.at(-1);
expect('hotkey turns focus off', !restored.focus, JSON.stringify(restored));
expect('list comes back', restored.chatList?.display !== 'none' && restored.chatList.width > 0, JSON.stringify(restored.chatList));
expect('rail comes back', restored.rail?.display !== 'none' && restored.rail.width > 0, JSON.stringify(restored.rail));

expect('no runtime errors from the extension', problems.length === 0, problems.join('; '));

console.log(JSON.stringify({ opened, steps, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
