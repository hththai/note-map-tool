// The Business flows canvas as an editor, in a real browser: retype a step, drag it into another lane, draw and delete an arrow, add steps by
// double-clicking a lane (Enter adds the next, pasting adds one per line), add/rename/remove a lane, undo, and Save. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-flow-canvas.mjs      (CHROME=/path/to/chrome if Chrome is not in /Applications)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H;
const file = () => H.readJson('data/demo.json'), flow0 = () => file().flows[0];
const q = JSON.stringify;
const steps = () => js(`document.querySelectorAll('.react-flow__node-step').length`);
const edges = () => js(`document.querySelectorAll('.react-flow__edge').length`);
const step = (t) => `[...document.querySelectorAll('.react-flow__node-step')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const lane = (name) => `[...document.querySelectorAll('.react-flow__node-lane')].find((x) => x.textContent.startsWith(${q(name)}))`;
const focused = `document.activeElement?.getAttribute('aria-label') === 'New step text'`;
const hasDraft = () => js(`!!document.querySelector('[aria-label="New step text"]')`);
const save = async () => { await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved'); };
const laneOfStep = async (t) => { const s = mid(await rect(step(t))); const names = await js(`[...document.querySelectorAll('.react-flow__node-lane')].map((x) => { const b = x.getBoundingClientRect(); return [x.textContent.replace(/[↑↓×]/g, '').trim(), b.y, b.y + b.height]; })`); return names.find(([, a, b]) => s.y >= a && s.y <= b)?.[0]; };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4`, 'flow drawn'); await sleep(500);
  const n0 = await steps(), e0 = await edges();
  r.check('the demo flow is drawn with its steps and lanes', n0 === flow0().steps.length && await js(`document.querySelectorAll('.react-flow__node-lane').length`) === flow0().teams.length, `${n0} steps`);

  // 1. double-click a step, retype it
  await H.dblclick(mid(await rect(step('Review OT')))); await until(`!!document.querySelector('[aria-label="Step text"]')`, 'inline text box');
  await H.insert('Review overtime'); await H.key('Enter'); await until(`!!${step('Review overtime')}`, 'step retyped');
  r.check('double-click retypes a step on the diagram', !(await js(`!!document.querySelector('[aria-label="Step text"]')`)));

  // 2. drag a step into another lane: it changes team
  const before = await laneOfStep('Review overtime'); await sleep(300);
  const from = mid(await rect(step('Review overtime'))), itLane = await rect(lane('IT'));
  await H.drag(from, { x: from.x, y: itLane.y + itLane.h / 2 }); await sleep(500);
  r.check('dragging a step into another lane hands it to that team', before === 'Finance' && await laneOfStep('Review overtime') === 'IT', `${before} -> ${await laneOfStep('Review overtime')}`);

  // 3. a drag that stays in the lane snaps back and changes nothing
  const ed1 = await edges(); const here = mid(await rect(step('Top up'))); const home = await rect(step('Top up'));
  await H.drag(here, { x: here.x + 60, y: here.y + 6 }); await sleep(500); const back = await rect(step('Top up'));
  r.check('a drag within the lane snaps back', Math.abs(back.x - home.x) < 2 && Math.abs(back.y - home.y) < 2 && await laneOfStep('Top up') === 'Harvest');

  // 4. draw an arrow from one step's right edge to another: it adds to the arrows already there
  const ids0 = await js(`[...document.querySelectorAll('.react-flow__edge')].map((e) => e.getAttribute('data-testid'))`);
  const src = await js(`(() => { const b = ${step('Top up')}.querySelector('.react-flow__handle-right').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const e4 = await edges(); await H.drag(src, mid(await rect(step('Review overtime')))); await sleep(400);
  r.check('dragging from a step\'s right edge onto another step draws an arrow', await edges() === e4 + 1, `${e4} -> ${await edges()}`);

  // 5. click the new arrow, press Delete
  const newId = await js(`[...document.querySelectorAll('.react-flow__edge')].map((e) => e.getAttribute('data-testid')).find((t) => !${q(ids0)}.includes(t))`);
  const pathMid = await js(`(() => { const e = document.querySelector('[data-testid=' + ${q(newId)} + ']'); if (!e) return null; const p = e.querySelector('path.react-flow__edge-interaction') || e.querySelector('path'); const l = p.getTotalLength(), pt = p.getPointAtLength(l / 2), m = p.getScreenCTM(); return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f }; })()`);
  r.check('the new arrow can be found on the diagram', !!pathMid, String(newId));
  if (pathMid) { await H.mclick(pathMid); await sleep(200); await H.key('Delete'); await sleep(500); }
  r.check('selecting an arrow and pressing Delete removes it', await edges() === e4, `${e4} vs ${await edges()}`);

  // 6. double-click an empty spot in a lane: type a step, Enter adds the next, Esc stops
  const hv = await rect(lane('Harvest')); const nBefore = await steps(), eBefore = await edges();
  await H.dblclick({ x: hv.x + hv.w - 200, y: hv.y + hv.h / 2 }); await until(focused, 'draft box');
  await H.insert('Pack boxes'); await H.key('Enter'); await until(`!!${step('Pack boxes')}`, 'first step'); await until(focused, 'next draft');
  await H.insert('Ship boxes'); await H.key('Enter'); await until(`!!${step('Ship boxes')}`, 'second step'); await sleep(200); await H.key('Escape'); await sleep(300);
  r.check('typing in an empty lane adds a step; Enter adds the next, linked to it; Esc stops', await steps() === nBefore + 2 && !(await hasDraft()) && await edges() === eBefore + 1 && await laneOfStep('Ship boxes') === 'Harvest', `${nBefore}->${await steps()} steps, ${eBefore}->${await edges()} arrows`);

  // 7. paste several lines: one step each, in a row
  const fin = await rect(lane('Finance')), n7 = await steps();
  await H.dblclick({ x: fin.x + 170, y: fin.y + fin.h / 2 }); await until(focused, 'draft box 2');
  await js(`(() => { const i = document.querySelector('[aria-label="New step text"]'); const dt = new DataTransfer(); dt.setData('text', '1. Count cash\\n2. Bank it\\n- File slip'); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
  await until(`!!${step('File slip')}`, 'pasted steps'); await sleep(300);
  r.check('pasting three lines adds three steps in the lane', await steps() === n7 + 3 && !(await hasDraft()) && await laneOfStep('Bank it') === 'Finance');

  // 8. lanes: add, rename, remove
  await js(`(() => { const i = document.querySelector('[aria-label="New lane name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'QA'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await H.click('Add lane'); await until(`!!${lane('QA')}`, 'lane added'); await sleep(500);
  /* the new lane is below the visible area, so the double-click is sent to its name directly */
  await js(`${lane('QA')}.querySelector('span.font-semibold').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), true`); await until(`document.activeElement?.getAttribute('aria-label') === 'Lane name'`, 'rename box').catch(async (e) => { console.log('DIAG', await js(`JSON.stringify({active: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('aria-label') || ''), inputs: [...document.querySelectorAll('[aria-label="Lane name"]')].map((i) => [i.value, getComputedStyle(i.closest('.react-flow__node')).visibility, i.isConnected]), hasFocus: document.hasFocus()})`)); throw e; });
  await H.insert('Quality'); await H.key('Enter'); await until(`!!${lane('Quality')}`, 'lane renamed');
  r.check('a lane can be added and renamed on the diagram', !!(await rect(lane('Quality'))));
  await js(`${lane('Quality')}.querySelector('[aria-label="Remove lane Quality"]').click(), true`); await sleep(300);
  r.check('an empty lane can be removed', !(await rect(lane('Quality'))));
  const rename = await js(`!!${lane('IT')}.querySelector('[aria-label="Remove lane IT"]')`);
  r.check('a lane with steps has no remove button', rename === false);

  // 9. select a step: details open for just that step
  await H.mclick(mid(await rect(step('Check piece work')))); await until(`!!document.querySelector('[role=group][aria-label="Step 2"]')`, 'details');
  r.check('selecting a step shows only its details', await js(`document.querySelectorAll('[role=group][aria-label^="Step "]').length`) === 1);

  // 10. Delete removes a selected step (to Removed) and undo brings it back
  const n10 = await steps(); await H.key('Delete'); await sleep(500);
  r.check('Delete removes the selected step', await steps() === n10 - 1);
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo').click(), true`); await sleep(400);
  r.check('Undo brings the step back', await steps() === n10);

  // 11. Save: the file is valid and holds the edits
  await save(); const f = flow0();
  r.check('Save writes a valid file with the edits', validate(file()).length === 0 && f.steps.some((s) => s.title === 'Review overtime' && s.team === 'IT') && f.steps.some((s) => s.title === 'Ship boxes' && s.triggers.length === 1) && f.steps.some((s) => s.title === 'Bank it') && !f.teams.includes('Quality'));
  r.check('nothing was lost: the original steps are all still there', demo.flows[0].steps.every((s0) => f.steps.some((s) => s.id === s0.id)) && file().removed.length === demo.removed.length);
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  await H.shot('flow-canvas'); console.log('sandbox (screenshot flow-canvas):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); await H.shot('flow-canvas-fail').catch(() => {}); console.log('sandbox:', H.sandbox); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
