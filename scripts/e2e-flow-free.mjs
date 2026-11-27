// The free canvas in a real browser: switch a swimlane flow (nothing is lost, the lanes go), add rectangles and rounded boxes, type in them, drag, resize,
// draw and label an arrow, delete and undo, Save, reload. Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-free.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H, q = JSON.stringify;
const TITLE = 'Quote approval', file = () => H.readJson('data/demo.json'), flowOf = (d) => d.flows.find((f) => f.title === TITLE), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const node = (t) => `[...document.querySelectorAll('.react-flow__node-free')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`), zoom = () => js(`+(document.querySelector('.react-flow__viewport').style.transform.match(/scale\\(([\\d.]+)\\)/)?.[1] || 1)`);
const pickFlow = async (t) => { await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === ${q(t)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === ${q(t)}).value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(700); };
const emptySpot = () => js(`(() => { const p = document.querySelector('.react-flow__pane').getBoundingClientRect(); for (let y = p.bottom - 40; y > p.top + 40; y -= 40) for (let x = p.left + 60; x < p.right - 60; x += 40) { const e = document.elementFromPoint(x, y); if (e?.classList.contains('react-flow__pane')) return { x, y }; } return null; })()`);
const typeBox = async (text) => { await until(`document.activeElement?.getAttribute('aria-label') === 'Step text'`, 'box open for typing'); await H.insert(text); const typed = await js(`document.activeElement?.value`); await H.key('Enter'); await until(`!document.querySelector('[aria-label="Step text"]')`, 'typed'); await sleep(150); if (!(await js(`[...document.querySelectorAll('.react-flow__node-free')].some((x) => x.textContent.includes(${q(text)}))`))) console.log('DIAG typed value was', q(typed), 'titles', await js(`[...document.querySelectorAll('.react-flow__node-free')].map((x) => x.textContent.trim())`), 'status', await H.status()); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flow drawn'); await pickFlow(TITLE); await until(`document.querySelectorAll('.react-flow__node-step').length === 3`, 'Quote approval drawn');
  const before = { lanes: await count('.react-flow__node-lane'), steps: await count('.react-flow__node-step'), edges: await count('.react-flow__edge') }, was = flowOf(demo);
  r.check('a swimlane flow offers "Switch to free canvas" and has lanes', before.lanes >= 2 && (await js(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Switch to free canvas')`)));

  await H.click('Switch to free canvas'); await until(`!!document.querySelector('[role=dialog][aria-label="Switch to free canvas"]')`, 'dialog');
  r.check('it warns that this cannot be turned back into lanes, and that Undo works until Save', await js(`(() => { const t = document.querySelector('[role=dialog]').textContent; return t.includes('cannot be turned back') && t.includes('Undo'); })()`));
  await H.dlg('Cancel'); await until(`!document.querySelector('[role=dialog]')`, 'cancelled');
  r.check('Cancel leaves the flow as a swimlane', (await count('.react-flow__node-lane')) === before.lanes && (await count('.react-flow__node-free')) === 0);

  await H.click('Switch to free canvas'); await until(`!!document.querySelector('[role=dialog]')`, 'dialog again'); await H.dlg('Switch to free canvas'); await until(`document.querySelectorAll('.react-flow__node-free').length === ${before.steps}`, 'free canvas drawn'); await sleep(600);
  r.check('the lanes are gone and every step is now a box', (await count('.react-flow__node-lane')) === 0 && (await count('.react-flow__node-free')) === before.steps);
  r.check('every arrow is still there', (await count('.react-flow__edge')) === before.edges, `${await count('.react-flow__edge')} vs ${before.edges}`);
  r.check('the header says Free canvas and the lane controls are gone', await js(`document.querySelector('[aria-label=Layout]')?.textContent === 'Free canvas' && !document.querySelector('[aria-label="New lane name"]') && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Switch to free canvas')`));
  await H.shot('free-switched');

  // add a rectangle with the header button, type in it
  await H.click('+ Rectangle'); await typeBox('Approve');
  r.check('+ Rectangle adds a square-cornered box that opens for typing', (await js(`${node('Approve')}?.querySelector('[data-shape]')?.getAttribute('data-shape')`)) === 'rect');
  // add a rounded box by double-clicking empty space
  const spot = await emptySpot(); await H.dblclick(spot); await typeBox('Ship');
  r.check('double-clicking empty space adds a rounded box where you clicked', (await js(`${node('Ship')}?.querySelector('[data-shape]')?.getAttribute('data-shape')`)) === 'rounded');

  // draw an arrow from the right dot of Approve to Ship
  const edges0 = await count('.react-flow__edge'), a = await rect(node('Approve')), s = await rect(node('Ship'));
  const dot = await js(`(() => { const h = ${node('Approve')}.querySelector('.react-flow__handle.source[data-handleid="${s.x > a.x ? 'r' : 'l'}"]'); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await H.drag(dot, mid(s)); await until(`document.querySelectorAll('.react-flow__edge').length === ${edges0 + 1}`, 'arrow drawn');
  r.check('dragging from a dot on one box to another draws an arrow', (await count('.react-flow__edge')) === edges0 + 1);

  // label the arrow: click it, type a message in the details
  await js(`(() => { const e = [...document.querySelectorAll('.react-flow__edge')].at(-1); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  await until(`!!document.querySelector('[role=group][aria-label=Arrow]')`, 'arrow details'); await js(`document.querySelector('[aria-label="Arrow message"]').focus(), true`); await H.type('Arrow message', 'approved'); await js(`document.querySelector('[aria-label="Arrow message"]').blur(), true`);
  await until(`[...document.querySelectorAll('.react-flow__edge')].some((e) => e.textContent.includes('approved'))`, 'label drawn');
  r.check('clicking an arrow lets you label it, and the label is drawn', true);

  // drag Approve, then resize it
  const z = await zoom(), p0 = file(); await H.click('Save'); await saved(); const x0 = flowOf(file()).steps.find((x) => x.title === 'Approve');
  const b1 = await rect(node('Approve')); await H.drag(mid(b1), { x: mid(b1).x + 80, y: mid(b1).y + 60 }); await sleep(500);
  await H.click('Save'); await saved(); const x1 = flowOf(file()).steps.find((x) => x.title === 'Approve');
  r.check('dragging a box moves it by about the distance dragged', Math.abs(x1.x - x0.x - 80 / z) < 12 && Math.abs(x1.y - x0.y - 60 / z) < 12, `${x1.x - x0.x}, ${x1.y - x0.y} (zoom ${z})`);
  await js(`${node('Approve')}.click(), true`); await until(`!!document.querySelector('.react-flow__resize-control.handle.bottom.right')`, 'resize handles');
  const hb = await rect(`document.querySelector('.react-flow__resize-control.handle.bottom.right')`); await H.drag(mid(hb), { x: mid(hb).x + 60, y: mid(hb).y + 30 }); await sleep(500);
  await H.click('Save'); await saved(); const x2 = flowOf(file()).steps.find((x) => x.title === 'Approve');
  r.check('dragging a corner handle of a selected box resizes it', x2.w - x1.w > 20 && x2.h - x1.h > 10 && x2.w >= 60, `${x2.w - x1.w} x ${x2.h - x1.h}`);

  // delete and undo
  const n0 = await count('.react-flow__node-free'); await js(`${node('Ship')}.click(), true`); await sleep(200); await H.key('Delete'); await until(`document.querySelectorAll('.react-flow__node-free').length === ${n0 - 1}`, 'deleted');
  r.check('Delete removes the selected box (and the arrow into it)', (await count('.react-flow__node-free')) === n0 - 1 && !(await js(`document.body.innerText.includes('approved')`)));
  await H.click('Undo'); await until(`document.querySelectorAll('.react-flow__node-free').length === ${n0}`, 'undone');
  await sleep(500);
  r.check('Undo brings the box and its arrow back', (await count('.react-flow__node-free')) === n0 && (await js(`document.body.innerText.includes('approved')`)), `${await count('.react-flow__node-free')} boxes of ${n0}; label ${await js(`document.body.innerText.includes('approved')`)}; edges ${await count('.react-flow__edge')}`);
  await js(`${node('Ship')}.click(), true`); await sleep(200); await H.key('Delete'); await until(`document.querySelectorAll('.react-flow__node-free').length === ${n0 - 1}`, 'deleted again'); await H.click('Save'); await saved();
  r.check('a deleted box is in Removed with its place', file().removed.some((x) => x.kind === 'step' && x.entry.title === 'Ship' && Number.isFinite(x.entry.x) && x.entry.w >= 60));
  await H.click('Removed'); await until(`document.body.innerText.includes('Ship')`, 'removed view'); await H.click('Restore'); await sleep(400); await H.click('Business flows'); await until(`document.querySelectorAll('.react-flow__node-free').length === ${n0}`, 'restored');
  r.check('Restore puts it back on the canvas', (await count('.react-flow__node-free')) === n0);
  await H.click('Save'); await saved();

  const f = flowOf(file());
  r.check('the file says layout free, every box has a place and size, and it is valid', f.layout === 'free' && f.steps.every((x) => Number.isFinite(x.x) && x.w >= 60 && x.h >= 40) && validate(file()).length === 0);
  r.check('the original steps kept their words, notes, tickets and order', was.steps.every((s, i) => f.steps[i].title === s.title && f.steps[i].team === s.team && (f.steps[i].note || '') === (s.note || '')));
  r.check('the other flows are untouched', JSON.stringify(file().flows.find((x) => x.title !== TITLE)) === JSON.stringify(demo.flows.find((x) => x.title !== TITLE)));
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step, .react-flow__node-free').length >= 3`, 'reloaded'); await pickFlow(TITLE); await until(`document.querySelectorAll('.react-flow__node-free').length === ${n0}`, 'free canvas after reload');
  r.check('after a reload the free canvas is drawn from the file, with its arrows and no lanes', (await count('.react-flow__node-free')) === n0 && (await count('.react-flow__node-lane')) === 0 && (await count('.react-flow__edge')) >= before.edges);
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot free-switched):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
