// Narrow-window check for WA Focus. Launch the browser at the window size under
// test (e.g. --window-size=700,820), then: node scripts/narrow.mjs <port>
import { connect, sleep } from './lib.mjs';

const port = process.argv[2] ?? '9335';
const { send, waitFor, shot, pressHotkey, state, clickChat, expect, failures, problems } = await connect(port);

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const hasRows = `!!document.querySelector('#side [data-testid="cell-frame-container"]')`;

await send('Page.navigate', { url: 'https://web.whatsapp.com/' });
await waitFor(hasRows);

if ((await state()).focus) await pressHotkey();

const opened = await clickChat();
if (!opened) throw new Error('no chat row to open');
await waitFor(`!!document.querySelector('#main')`, 8000).catch(() => {});
await sleep(800);

const cases = [];
const narrowOff = await state();
cases.push({ case: 'narrow focus off', ...narrowOff, shot: await shot(`narrow-${narrowOff.viewport}-focus-off`) });
expect('focus off shows the chat list', narrowOff.chatList?.display !== 'none' && narrowOff.chatList.width > 0, JSON.stringify(narrowOff.chatList));

expect('narrow: focus off leaves the conversation narrower than the window', narrowOff.mainWidth > 0 && narrowOff.mainWidth < narrowOff.viewport, `${narrowOff.mainWidth}/${narrowOff.viewport}`);

await pressHotkey();
const narrowOn = await state();
cases.push({ case: 'narrow focus on', ...narrowOn, shot: await shot(`narrow-${narrowOn.viewport}-focus-on`) });
expect('narrow: focus on hides the list', narrowOn.chatList?.display === 'none', JSON.stringify(narrowOn.chatList));
expect('narrow: focus on hides the rail', narrowOn.rail?.display === 'none', JSON.stringify(narrowOn.rail));
expect('narrow: focus on gives the conversation at least the window width', narrowOn.mainWidth >= narrowOn.viewport, `${narrowOn.mainWidth}/${narrowOn.viewport}`);
expect('no runtime errors from the extension', problems.length === 0, problems.join('; '));

console.log(JSON.stringify({ opened, cases, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
