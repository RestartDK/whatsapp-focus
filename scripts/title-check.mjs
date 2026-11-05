import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, evidenceDir } from './lib.mjs';

const wa = await connect(process.argv[2] ?? '9334');
await wa.send('Page.enable');
await wa.send('Runtime.enable');
assert.equal(new URL(await wa.evaluate('location.href')).origin, 'https://web.whatsapp.com');

const initial = await wa.evaluate(`({
  title: document.title,
  focus: document.documentElement.hasAttribute('data-wa-focus'),
})`);
const observations = [];
let failure;

const setFocus = async (value) => {
  if (await wa.evaluate(`document.documentElement.hasAttribute('data-wa-focus') !== ${value}`)) {
    await wa.pressHotkey();
  }
  await wa.waitFor(`document.documentElement.hasAttribute('data-wa-focus') === ${value}`);
};

const check = async (label, title, focus) => {
  const settled = await wa.waitFor(`document.title === ${JSON.stringify(title)} &&
    document.documentElement.hasAttribute('data-wa-focus') === ${focus}`, 3000).then(() => true, () => false);
  const actual = await wa.evaluate(`({
    title: document.title,
    focus: document.documentElement.hasAttribute('data-wa-focus'),
  })`);
  observations.push({ label, ...actual });
  assert.notEqual(settled, false, `${label}: ${JSON.stringify(actual)}`);
  assert.deepEqual(actual, { title, focus }, label);
};

const setTitle = (value) => wa.evaluate(`document.title = ${JSON.stringify(value)}`);

try {
  await setFocus(false);
  await setTitle('(12) WhatsApp');
  await check('visible sidebar keeps the count', '(12) WhatsApp', false);
  await setFocus(true);
  await check('hotkey hides the count', 'WhatsApp', true);
  await setTitle('(99) WhatsApp');
  await check('later unread updates stay hidden', 'WhatsApp', true);
  await setFocus(false);
  await check('exit restores the latest count', '(99) WhatsApp', false);

  await setFocus(true);
  await setTitle('WhatsApp');
  await setFocus(false);
  await check('a cleared count is not restored', 'WhatsApp', false);

  await setFocus(true);
  for (const [input, output] of [
    ['(0) WhatsApp', 'WhatsApp'],
    ['(1) WhatsApp', 'WhatsApp'],
    ['(1000000) WhatsApp', 'WhatsApp'],
    ['(12) WhatsApp · 王秀英 👩🏽‍💻', 'WhatsApp · 王秀英 👩🏽‍💻'],
    ['WhatsApp (12)', 'WhatsApp (12)'],
    ['(draft) WhatsApp', '(draft) WhatsApp'],
    ['', ''],
  ]) {
    await setTitle(input);
    await check(`title ${JSON.stringify(input)}`, output, true);
  }

  await wa.evaluate(`(() => {
    const title = document.createElement('title');
    title.textContent = '(23) WhatsApp';
    document.querySelector('title').replaceWith(title);
  })()`);
  await check('replacement title nodes stay hidden', 'WhatsApp', true);
  await wa.evaluate(`document.querySelector('title').firstChild.data = '(24) WhatsApp'`);
  await check('text-node updates stay hidden', 'WhatsApp', true);
  await wa.evaluate(`(() => {
    const meta = document.createElement('meta');
    meta.name = 'wa-focus-title-check';
    document.head.append(meta);
    meta.remove();
  })()`);
  await setFocus(false);
  await check('unrelated head changes do not lose the count', '(24) WhatsApp', false);

  await setFocus(true);
  await wa.evaluate(`(() => {
    document.title = '(32) WhatsApp';
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyH', shiftKey: true,
      ${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}: true,
      bubbles: true,
    }));
  })()`);
  await check('exit preserves an update before observer delivery', '(32) WhatsApp', false);

  await setFocus(true);
  await wa.reload();
  await wa.waitFor(`document.readyState === 'complete' &&
    document.documentElement.hasAttribute('data-wa-focus')`);
  await setTitle('(41) WhatsApp');
  await check('persisted focus hides title updates after reload', 'WhatsApp', true);
  const restored = await wa.evaluate(`(() => {
    document.title = '(42) WhatsApp';
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyH', shiftKey: true,
      ${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}: true,
      bubbles: true,
    }));
    return { title: document.title, focus: document.documentElement.hasAttribute('data-wa-focus') };
  })()`);
  observations.push({ label: 'exit after reload restores the current count', ...restored });
  assert.deepEqual(restored, { title: '(42) WhatsApp', focus: false });
} catch (error) {
  failure = error.stack;
} finally {
  await setFocus(initial.focus);
  await setTitle(initial.title);
  const result = { surface: 'WhatsApp Web with controlled title updates, no login required', observations, failure };
  writeFileSync(join(evidenceDir, 'title-check.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
process.exit(failure ? 1 : 0);
