import { writeFileSync, mkdirSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const connect = async (port) => {
  const base = `http://127.0.0.1:${port}`;
  const targets = await (await fetch(`${base}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('no page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const problems = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`exception: ${msg.params.exceptionDetails.text}`);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const { text, url = '' } = msg.params.entry;
      if (/wa-focus|chrome-extension:/.test(`${url} ${text}`)) problems.push(`log: ${text} (${url})`);
    }
  };
  await new Promise((r) => (ws.onopen = r));

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++seq, { resolve, reject });
      ws.send(JSON.stringify({ id: seq, method, params }));
    });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  const waitFor = async (expression, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw new Error(`timeout waiting for ${expression}`);
  };

  const evidenceDir = new URL('../evidence/', import.meta.url).pathname;
  mkdirSync(evidenceDir, { recursive: true });
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${evidenceDir}${name}.png`, Buffer.from(res.data, 'base64'));
    return `evidence/${name}.png`;
  };

  const pressHotkey = async () => {
    const modifiers = process.platform === 'darwin' ? 4 | 8 : 2 | 8;
    const key = { modifiers, code: 'KeyH', key: 'H', windowsVirtualKeyCode: 72 };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await sleep(800);
  };

  const state = () =>
    evaluate(`(() => {
      const box = (el) => el ? { display: getComputedStyle(el).display, width: Math.round(el.getBoundingClientRect().width) } : null;
      const toast = document.getElementById('wa-focus-toast');
      const toastRect = toast?.getBoundingClientRect();
      return {
        focus: document.documentElement.hasAttribute('data-wa-focus'),
        chatList: box(document.querySelector('#side')?.parentElement),
        rail: box(document.querySelector('div.two > header[data-testid="chatlist-header"]')),
        mainWidth: document.querySelector('#main') ? Math.round(document.querySelector('#main').getBoundingClientRect().width) : null,
        viewport: innerWidth,
        chat: document.querySelector('[data-testid="conversation-info-header-chat-title"]')?.textContent ?? null,
        drawers: ['drawer-fullscreen', 'drawer-left', 'drawer-middle', 'drawer-right'].map((testid) => {
          const el = document.querySelector('[data-testid="' + testid + '"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const hasContent = [...el.querySelectorAll('*')].some((child) => {
            const cr = child.getBoundingClientRect();
            return cr.width > 2 && cr.height > 2 && getComputedStyle(child).visibility === 'visible';
          });
          return { testid, x: Math.round(r.x), width: Math.round(r.width), content: hasContent };
        }).filter((d) => d && d.width > 0),
        toast: toast && toastRect ? { text: toast.textContent, width: Math.round(toastRect.width), left: Math.round(toastRect.left), right: Math.round(toastRect.right) } : null,
      };
    })()`);

  const clickChat = async () => {
    const point = await evaluate(`(() => {
      const row = [...document.querySelectorAll('#side [data-testid="cell-frame-container"]')]
        .find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.closest('[data-testid="chatlist-panel-archived-button"]');
        });
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: Math.round(r.x + 100), y: Math.round(r.y + r.height / 2), label: (row.textContent || '').slice(0, 30) };
    })()`);
    if (!point) return null;
    const params = { x: point.x, y: point.y, button: 'left', clickCount: 1 };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...params });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...params });
    return point.label;
  };

  const clickAt = async (x, y) => {
    const params = { x, y, button: 'left', clickCount: 1 };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...params });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...params });
    await sleep(800);
  };

  const setViewport = async (width, height) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(1200);
  };

  const clearViewport = async () => {
    await send('Emulation.clearDeviceMetricsOverride');
    await sleep(1200);
  };

  const setZoom = async (value) => {
    await evaluate(`document.documentElement.style.zoom = ${JSON.stringify(value)}`);
    await sleep(600);
  };

  const reload = async () => {
    await evaluate('window.__waReloadMarker = true');
    await send('Page.reload');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const fresh = await evaluate('typeof window.__waReloadMarker === "undefined"').catch(() => true);
      if (fresh) break;
      await sleep(150);
    }
    await sleep(400);
  };

  const failures = [];
  const expect = (label, condition, detail = '') => {
    if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  };

  return { send, evaluate, waitFor, shot, pressHotkey, state, clickChat, clickAt, setViewport, clearViewport, setZoom, reload, expect, failures, problems };
};
