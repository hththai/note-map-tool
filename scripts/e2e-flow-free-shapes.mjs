// Shapes on the free canvas in a real browser: entity boxes (name, description lines, a sheet), a relationship arrow with a label, a pill, a diamond with
// Yes/No branches, and sticky notes (free and pinned). Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-free-shapes.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H, q = JSON.stringify, sheet = demo.sheets[0];
const file = () => H.readJson('data/demo.json'), flowOf = (d) => d.flows.find((f) => f.title === 'Orders ER'), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const node = (t) => `[...document.querySelectorAll('.react-flow__node-free')].find((x) => x.textContent.includes(${q(t)}))`, note = (t) => `[...document.querySelectorAll('.react-flow__node-note')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`);
const typeBox = async (text) => { await until(`document.activeElement?.getAttribute('aria-label') === 'Step text'`, 'box open for typing'); await H.insert(text); await H.key('Enter'); await until(`!document.querySelector('[aria-label="Step text"]')`, 'typed'); await sleep(200); };
const labels = () => js(`[...document.querySelectorAll('.react-flow__edge')].map((e) => e.textContent.trim()).filter(Boolean)`);
const toolbar = (label) => js(`(() => { const b = [...document.querySelectorAll('[role=toolbar] button')].find((x) => x.textContent.trim() === ${q(label)}); if (!b) throw new Error('no toolbar button ' + ${q(label)}); b.click(); return true; })()`);
const arrow = async (from, to) => { const a = await rect(node(from)), b = await rect(node(to)), side = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'r' : 'l') : (b.y > a.y ? 'b' : 't');
  const dot = await js(`(() => { const h = ${node(from)}.querySelector('.react-flow__handle.source[data-handleid="${side}"]'); const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); const n = await count('.react-flow__edge'); await H.drag(dot, mid(b)); await until(`document.querySelectorAll('.react-flow__edge').length === ${n + 1}`, `arrow ${from} -> ${to}`); await sleep(300); };
const moveTo = async (t, x, y) => { const b = await rect(node(t)); await H.drag(mid(b), { x, y }); await sleep(400); };
const moveBox = async (t, dx, dy) => { const b = await rect(node(t)); await H.drag(mid(b), { x: mid(b).x + dx, y: mid(b).y + dy }); await sleep(400); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flows drawn');
  await H.type('New flow name', 'Orders ER'); await H.click('New flow'); await until(`document.querySelector('select').selectedOptions[0].text === 'Orders ER'`, 'new flow'); await sleep(400);
  await H.click('Switch to free canvas'); await until(`!!document.querySelector('[role=dialog]')`, 'dialog'); await H.dlg('Switch to free canvas'); await until(`!!document.querySelector('[aria-label=Layout]')`, 'free'); await sleep(400);
  r.check('an empty flow can be switched, and the header offers rectangle, rounded box, pill, diamond, entity and note', await js(`['Rectangle', 'Rounded box', 'Pill', 'Diamond', 'Entity', 'Note'].every((l) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '+ ' + l))`));
  r.check('the header counts boxes, not lanes', await js(`document.body.innerText.includes('0 boxes') && !document.body.innerText.includes('lanes')`));

  // entity boxes
  await H.click('+ Entity'); await typeBox('Customer'); await H.click('+ Entity'); await typeBox('Order'); await sleep(400);
  r.check('+ Entity adds entity boxes (a name over description lines), each opening for typing', (await js(`${node('Customer')}?.querySelector('[data-shape]')?.getAttribute('data-shape')`)) === 'entity' && (await count('.react-flow__node-free')) === 2);
  for (let i = 0; i < 4; i++) { await js(`document.querySelector('.react-flow__controls-zoomout').click(), true`); await sleep(120); } await sleep(300);
  { const c = await rect(node('Customer')); await moveBox('Order', c.w + 60, 30); }
  const lines = await rect(`${node('Customer')}.querySelector('[aria-label="Entity lines"]')`); await H.dblclick(mid(lines)); await until(`document.activeElement?.getAttribute('aria-label') === 'Entity lines text'`, 'lines editor');
  await H.insert('id\nname\nemail'); await js(`document.activeElement.blur(), true`); await until(`${node('Customer')}.textContent.includes('email')`, 'lines drawn'); await sleep(300);
  r.check('double-clicking the body of an entity edits its description lines, one per line', await js(`${node('Customer')}.querySelectorAll('[aria-label="Entity lines"] > div').length === 3`));
  await js(`${node('Order')}.click(), true`); await until(`!!document.querySelector('[aria-label="Step sheet"]')`, 'details of Order'); await H.choose('Step sheet', sheet.name); await sleep(400);
  r.check('an entity can point at a real Sheet, shown as a tag at its foot', await js(`${node('Order')}.querySelector('[aria-label="Entity sheet"]')?.textContent.includes(${q(sheet.name)})`));
  await arrow('Customer', 'Order'); await js(`[...document.querySelectorAll('.react-flow__edge')].at(-1).dispatchEvent(new MouseEvent('click', { bubbles: true })), true`); await until(`!!document.querySelector('[aria-label="Arrow message"]')`, 'arrow details');
  await js(`document.querySelector('[aria-label="Arrow message"]').focus(), true`); await H.type('Arrow message', '1 to many'); await js(`document.querySelector('[aria-label="Arrow message"]').blur(), true`); await until(`[...document.querySelectorAll('.react-flow__edge')].some((e) => e.textContent.includes('1 to many'))`, 'label');
  r.check('a relationship is an arrow between two entities with a label such as "1 to many"', (await labels()).includes('1 to many'));

  // pill and diamond
  const cust = await rect(node('Customer')), row = cust.y + cust.h + 110, cx0 = cust.x + 120;
  await H.click('+ Pill'); await typeBox('Done'); await moveTo('Done', cx0 + 270, row); await H.click('+ Diamond'); await typeBox('Paid?'); await moveTo('Paid?', cx0, row); await H.click('+ Rectangle'); await typeBox('Retry'); await moveTo('Retry', cx0 - 270, row); await sleep(300);
  r.check('+ Pill, + Diamond and + Rectangle draw their own shapes', (await js(`${node('Done')}.querySelector('[data-shape]').getAttribute('data-shape')`)) === 'pill' && (await js(`${node('Paid?')}.querySelector('svg polygon') !== null`)) && (await js(`${node('Retry')}.querySelector('[data-shape]').getAttribute('data-shape')`)) === 'rect');
  await arrow('Paid?', 'Done'); await arrow('Paid?', 'Retry');
  r.check('the first two arrows out of a diamond are labelled Yes and No', (await labels()).includes('Yes') && (await labels()).includes('No'));

  // notes
  await H.click('+ Note'); await until(`document.activeElement?.getAttribute('aria-label') === 'New note text'`, 'note box'); await H.insert('Order ids are never reused'); await H.blur(); await until(`!!${note('never reused')}`, 'free note');
  r.check('+ Note adds a sticky note anywhere on the canvas', (await count('.react-flow__node-note')) === 1);
  const pane = await rect('document.querySelector(".react-flow__pane")'), n0 = await rect(note('never reused')); await H.drag(mid(n0), { x: pane.x + pane.w - 130, y: pane.y + 70 }); await sleep(500);
  const n1 = await rect(note('never reused')); r.check('a note can be dragged, and stays where it is dropped', Math.abs(n1.x - n0.x) > 100 && n1.y < n0.y - 100);
  await js(`${node('Customer')}.click(), true`); await until(`!!document.querySelector('[role=toolbar][aria-label="Box actions"]')`, 'toolbar'); await toolbar('+ Note'); await until(`document.activeElement?.getAttribute('aria-label') === 'New note text'`, 'pinned draft'); await H.insert('Email must be unique'); await H.blur(); await until(`!!${note('must be unique')}`, 'pinned note');
  await until(`document.querySelectorAll('.react-flow__edge[data-testid^="rf__edge-nl"]').length === 1`, 'the line to the pinned note').catch(() => {});
  r.check('a box\'s "+ Note" pins a sticky note to it with a thin line', (await count('.react-flow__node-note')) === 2 && (await count('.react-flow__edge[data-testid^="rf__edge-nl"]')) === 1, `${await count('.react-flow__node-note')} notes, ${await count('.react-flow__edge[data-testid^="rf__edge-nl"]')} lines`);
  await js(`${note('never reused')}.click(), true`); await sleep(200); await H.key('Delete'); await until(`!${note('never reused')}`, 'note deleted');
  r.check('Delete sends the selected note to Removed', (await count('.react-flow__node-note')) === 1);
  await H.click('Save'); await saved();
  const f = flowOf(file()), by = (t) => f.steps.find((s) => s.title === t);
  r.check('the file says free, with shapes, kinds, sizes, lines, the sheet and the labels', f.layout === 'free' && by('Customer').shape === 'entity' && by('Customer').note === 'id\nname\nemail' && by('Order').sheetId === sheet.id && by('Done').shape === 'pill' && by('Paid?').kind === 'decision' && by('Retry').shape === 'rect' && by('Order').triggers[0].msg === '1 to many' && by('Done').triggers[0].msg === 'Yes' && by('Retry').triggers[0].msg === 'No');
  r.check('one note is saved pinned to its box, and the deleted note is in Removed; the file is valid', f.notes.length === 1 && f.notes[0].stepId === by('Customer').id && file().removed.some((x) => x.kind === 'note') && validate(file()).length === 0);
  await H.shot('free-shapes');
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'reloaded'); await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === 'Orders ER')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === 'Orders ER').value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await until(`document.querySelectorAll('.react-flow__node-free').length === 5`, 'drawn after reload'); await sleep(500);
  r.check('after a reload everything is drawn from the file: five boxes, the arrows, the entity lines and the pinned note', (await count('.react-flow__node-free')) === 5 && (await count('.react-flow__edge')) >= 4 && await js(`${node('Customer')}.textContent.includes('email')`) && !!(await rect(note('must be unique'))));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot free-shapes):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
