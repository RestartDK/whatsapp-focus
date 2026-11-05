import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, evidenceDir } from './lib.mjs';

const wa = await connect(process.argv[2] ?? '9334');
await wa.send('Page.enable');
assert.equal(new URL(await wa.evaluate('location.href')).origin, 'https://web.whatsapp.com');
const initialFocus = await wa.evaluate(`document.documentElement.hasAttribute('data-wa-focus')`);
const observations = [];
let failure;

const setFocus = async (value) => {
  if (await wa.evaluate(`document.documentElement.hasAttribute('data-wa-focus') !== ${value}`)) {
    await wa.pressHotkey();
  }
  await wa.waitFor(`document.documentElement.hasAttribute('data-wa-focus') === ${value}`);
};
const icons = () => wa.evaluate(`[...document.head.querySelectorAll('link[rel~="icon" i]')]
  .map(n => ({ href:n.getAttribute('href'), type:n.getAttribute('type'), sizes:n.getAttribute('sizes') }))`);
const checkPlain = async (label, count) => {
  const actual = await icons();
  observations.push({ label, icons: actual });
  assert.equal(actual.length, count, label);
  assert.ok(actual.every(n => /^chrome-extension:\/\/[a-p]{32}\/icons\/focus\.png$/.test(n.href)), label);
  assert.ok(actual.every(n => n.type === 'image/png'), label);
};
const restored = async (label, expected) => {
  const actual = await icons();
  observations.push({ label, icons: actual });
  assert.deepEqual(actual, expected, label);
};

try {
  await setFocus(false);
  const fixture = await wa.evaluate(`(() => {
    const original = [...document.head.querySelectorAll('link[rel~="icon" i]')];
    original.forEach(n => n.remove());
    const badge = value => 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/><text x="2" y="24" fill="white" font-size="24">' + value + '</text></svg>');
    const primary = document.createElement('link');
    primary.rel = 'icon'; primary.href = badge(12); primary.type = 'image/svg+xml'; primary.sizes = 'any';
    const secondary = document.createElement('link');
    secondary.rel = 'shortcut icon'; secondary.href = badge(12); secondary.sizes = '16x16';
    document.head.append(primary, secondary);
    window.__waFaviconFixture = { original, primary, secondary, badge };
    return { first:badge(12), next:badge(99), replacement:badge(1000000) };
  })()`);
  await restored('normal mode leaves both favicon candidates unchanged', [
    { href:fixture.first, type:'image/svg+xml', sizes:'any' },
    { href:fixture.first, type:null, sizes:'16x16' },
  ]);
  await setFocus(true);
  await checkPlain('focus hides every favicon candidate', 2);

  const image = await wa.evaluate(`(async () => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.src = document.querySelector('link[rel~="icon" i]').href;
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
    return { width:canvas.width, height:canvas.height, png:canvas.toDataURL('image/png') };
  })()`);
  assert.equal(image.width, 32); assert.equal(image.height, 32);
  writeFileSync(join(evidenceDir, 'favicon-focus.png'), Buffer.from(image.png.split(',')[1], 'base64'));
  observations.push({ label:'the packaged icon loads as a 32px image', width:image.width, height:image.height });

  await wa.evaluate(`(() => {
    const f=window.__waFaviconFixture; f.primary.href=f.badge(99); f.primary.type='image/x-icon';
    f.secondary.href=f.badge(99);
    const meta=document.createElement('meta'); document.head.append(meta); meta.remove();
  })()`);
  await checkPlain('new notification icons stay hidden', 2);
  await setFocus(false);
  await restored('exit restores the latest href and type, including a missing type', [
    { href:fixture.next, type:'image/x-icon', sizes:'any' },
    { href:fixture.next, type:null, sizes:'16x16' },
  ]);

  await setFocus(true);
  await wa.evaluate(`(() => {
    const f=window.__waFaviconFixture;
    const replacement=document.createElement('link'); replacement.rel='icon'; replacement.href=f.badge(1000000);
    f.primary.replaceWith(replacement); f.primary=replacement;
    f.secondary.remove();
  })()`);
  await checkPlain('replacement and removed nodes cannot leak a badge', 1);
  await setFocus(false);
  await restored('replacement restores its own latest icon', [{ href:fixture.replacement, type:null, sizes:null }]);

  await setFocus(true);
  await wa.evaluate(`(() => { const f=window.__waFaviconFixture; f.primary.remove(); })()`);
  await checkPlain('an icon-free page gets one static fallback', 1);
  await wa.evaluate(`(() => {
    const icon=document.head.querySelector('link[rel~="icon" i]');
    icon.rel='apple-touch-icon'; icon.href=window.__waFaviconFixture.badge(99); icon.type='image/svg+xml';
  })()`);
  await checkPlain('changes to the fallback itself cannot reintroduce a badge', 1);
  await wa.evaluate(`(() => { const f=window.__waFaviconFixture; document.head.append(f.primary); f.primary.href=f.badge(99); })()`);
  await checkPlain('a late page icon replaces the fallback', 1);
  await wa.evaluate(`window.__waFaviconFixture.primary.rel='apple-touch-icon'`);
  await checkPlain('changing rel away from icon restores a fallback', 1);
  await wa.evaluate(`window.__waFaviconFixture.primary.rel='icon'`);
  await checkPlain('changing rel back to icon suppresses the badge', 1);

  await wa.evaluate(`(() => {
    window.__waFaviconFixture.primary.href=window.__waFaviconFixture.badge(12);
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyH',shiftKey:true,
      ${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}:true,bubbles:true}));
  })()`);
  await restored('exit captures pending updates before observer delivery', [{ href:fixture.first, type:null, sizes:null }]);
  await wa.evaluate(`window.__waFaviconFixture.primary.remove()`);
  await setFocus(true);
  await checkPlain('empty favicon state is badge-free', 1);
  await setFocus(false);
  await restored('exit removes the extension fallback without leaving a fake original', []);

  await wa.evaluate(`(() => {
    window.__waFaviconFixture.original.forEach(n => document.head.append(n));
    delete window.__waFaviconFixture;
  })()`);
  await setFocus(true);
  await wa.reload();
  await wa.waitFor(`document.readyState==='complete' && document.documentElement.hasAttribute('data-wa-focus')`);
  const count = (await icons()).length;
  assert.ok(count > 0);
  await checkPlain('saved focus suppresses the live page icons after reload', count);
} catch (error) {
  failure = error.stack;
} finally {
  await setFocus(false);
  await wa.evaluate(`(() => {
    const f=window.__waFaviconFixture;
    if (!f) return;
    f.primary.remove(); f.secondary.remove();
    f.original.forEach(n=>document.head.append(n)); delete window.__waFaviconFixture;
  })()`);
  await setFocus(initialFocus);
  const result = { surface:'WhatsApp Web with controlled favicon updates, no login required', observations, failure };
  writeFileSync(join(evidenceDir,'favicon-check.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
process.exit(failure ? 1 : 0);
