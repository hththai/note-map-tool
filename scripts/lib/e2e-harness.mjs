// Shared plumbing for the browser end-to-end checks: a throwaway sandbox folder, server.py on it, Vite, and Chrome driven over CDP.
// Nothing here ever touches maps/ or data/ of the real project.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../..'), SERVER = 8021, VITE = 5181, CDP = 9333;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function harness({ files = [], data = {} } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sheets-map-e2e-')), procs = [];
  fs.mkdirSync(path.join(sandbox, 'maps')); fs.mkdirSync(path.join(sandbox, 'data'));
  for (const f of files) fs.copyFileSync(path.join(root, 'maps', f), path.join(sandbox, 'maps', f));
  for (const [name, obj] of Object.entries(data)) fs.writeFileSync(path.join(sandbox, 'data', name), JSON.stringify(obj, null, 2) + '\n');
  const run = (cmd, args, opts) => { const p = spawn(cmd, args, { stdio: 'ignore', ...opts }); procs.push(p); return p; };
  const dev = !!process.env.E2E_DEV; // default: the real one-port setup (server.py serves the built app/dist); E2E_DEV=1 uses Vite instead
  if (!dev) { fs.mkdirSync(path.join(sandbox, 'app')); fs.symlinkSync(path.join(root, 'app/dist'), path.join(sandbox, 'app/dist')); }
  run('python3', ['server.py'], { cwd: root, env: { ...process.env, SHEETS_MAP_ROOT: sandbox, PORT: String(SERVER) } });
  if (dev) run('node', [path.join(root, 'app/node_modules/vite/bin/vite.js'), '--port', String(VITE), '--strictPort'], { cwd: path.join(root, 'app'), env: { ...process.env, SHEETS_MAP_SERVER: `http://127.0.0.1:${SERVER}` } });
  run(CHROME, ['--headless=new', '--use-mock-keychain', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(sandbox, 'chrome')}`, '--window-size=1440,900', 'about:blank']);
  for (let i = 0; i < 80; i++) { try { await fetch(`http://localhost:${dev ? VITE : SERVER}/`); await fetch(`http://127.0.0.1:${CDP}/json/version`); await fetch(`http://127.0.0.1:${SERVER}/api/data`); break; } catch { await sleep(250); } }
  const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const wait = new Map(), errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); wait.get(d.id)?.(d); if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 240)); };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; wait.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split('\n')[0] || r.result.exceptionDetails.text); return r.result.result.value; };
  const until = async (expr, what, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await js(expr)) return true; } catch {} await sleep(150); } throw new Error('timed out waiting for ' + what + ' | page says: ' + JSON.stringify(await js('document.body.innerText.slice(0, 260)').catch(() => '?')) + ' | errors: ' + errors.slice(0, 2).join(' ; ')); };
  const q = JSON.stringify;
  const H = {
    sandbox, errors, js, until, sleep, url: `http://localhost:${dev ? VITE : SERVER}`,
    /* via about:blank so a URL that differs only by #hash is still a real reload */
    goto: async (u) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: u }); await send('Page.bringToFront'); await sleep(900); },
    shot: async (name) => fs.writeFileSync(path.join(sandbox, name + '.png'), Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64')),
    /* click a button inside the open modal (exact text, so "Save" never matches "Save as...") */
    dlg: (text) => js(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) throw new Error('no modal open'); const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${q(text)}); if (!b) throw new Error('no modal button: ' + ${q(text)}); b.click(); return true; })()`),
    /* in the open modal, type into a type-to-filter box (found by aria-label) and pick the choice whose text contains `text` */
    pick: async (label, query, text) => {
      await js(`(() => { const i = document.querySelector('[role=dialog] [aria-label=${q(label)}][role=combobox]'); if (!i) throw new Error('no combobox: ' + ${q(label)}); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${q(query)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await until(`[...document.querySelectorAll('[role=listbox] [role=option] button')].some((b) => b.textContent.includes(${q(text)}))`, 'choice ' + text);
      return js(`(() => { const b = [...document.querySelectorAll('[role=listbox] [role=option] button')].find((x) => x.textContent.includes(${q(text)})); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true; })()`);
    },
    /* a real mouse drag over the page, in steps, so React Flow sees pointer events */
    drag: async (from, to) => { const m = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); await m('mouseMoved', from); await m('mousePressed', from); for (let i = 1; i <= 12; i++) { await m('mouseMoved', { x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }); await sleep(20); } await m('mouseReleased', to); },
    /* click the first button (or summary / role=button) whose text starts with `text` */
    click: (text) => js(`(() => { const b = [...document.querySelectorAll('button,[role=button],summary')].find((x) => x.textContent.trim().startsWith(${q(text)})); if (!b) throw new Error('no button: ' + ${q(text)}); b.click(); return true; })()`),
    /* set a text field found by its visible label (a <label> wrapping it) */
    typeLabel: (label, value) => js(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) throw new Error('no label: ' + ${q(label)}); const i = l.querySelector('input,textarea,select'); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${q(value)}); i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`),
    /* set a field found by aria-label, optionally inside the group (step card) with that aria-label */
    type: (aria, value, inGroup = null) => js(`(() => { const r = ${inGroup ? `document.querySelector(${q(`[role=group][aria-label=${q(inGroup)}]`)})` : 'document'}; const i = r.querySelector(${q(`[aria-label=${q(aria)}]`)}); if (!i) throw new Error('no field: ' + ${q(aria)}); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${q(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`),
    /* choose an option of a select (found by aria-label) by its visible text */
    choose: (aria, optionText, inGroup = null) => js(`(() => { const r = ${inGroup ? `document.querySelector(${q(`[role=group][aria-label=${q(inGroup)}]`)})` : 'document'}; const s = r.querySelector(${q(`[aria-label=${q(aria)}]`)}); if (!s) throw new Error('no select: ' + ${q(aria)}); const o = [...s.options].find((x) => x.text.trim().startsWith(${q(optionText)})); if (!o) throw new Error('no option ' + ${q(optionText)} + ' in ' + [...s.options].map((x) => x.text).join('|')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`),
    /* a real double-click, a key press and typed text, for the flow canvas */
    dblclick: async (p) => { const m = (type, n) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: n }); await m('mouseMoved', 1); await m('mousePressed', 1); await m('mouseReleased', 1); await m('mousePressed', 2); await m('mouseReleased', 2); },
    mclick: async (p) => { const m = (type) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); await m('mouseMoved'); await m('mousePressed'); await m('mouseReleased'); },
    key: async (key, code = key) => { const vk = { Enter: 13, Escape: 27, Delete: 46, Backspace: 8 }[key]; for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(key === 'Enter' && type === 'rawKeyDown' ? { text: '\r' } : {}) }); },
    insert: (text) => send('Input.insertText', { text }),
    blur: () => js('document.activeElement?.blur?.(), true'),
    text: () => js('document.body.innerText'),
    status: () => js(`document.querySelector('[role=status]')?.textContent || ''`),
    readJson: (f) => JSON.parse(fs.readFileSync(path.join(sandbox, f), 'utf8')),
    /* pretend the computer is in dark mode (or light): emulate({ 'prefers-color-scheme': 'dark' }) */
    emulate: (features) => send('Emulation.setEmulatedMedia', { features: Object.entries(features).map(([name, value]) => ({ name, value })) }),
    finish: () => procs.forEach((p) => p.kill()),
  };
  return H;
}
export const reporter = () => { let failed = 0; return { check: (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; }, get failed() { return failed; }, fail: () => failed++ }; };
