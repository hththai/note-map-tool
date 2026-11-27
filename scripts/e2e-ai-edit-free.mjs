// Ask AI on a free canvas (an entity diagram) in a real browser, against a fake provider (no real AI, no key): the AI is told it is a free canvas, a new entity is placed beside
// what it connects to without overlap, kept boxes keep their place, the preview marks new / changed / removed boxes, Accept is one undo, and a removed box can be restored.
// Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-ai-edit-free.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js'), o = await lib('ops.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data, sheet = demo.sheets[0];
/* a free entity diagram: Customer <-> Order (one arrow points "backwards") */
const fid = o.addFlow(demo, { title: 'Data model' }); o.switchToFree(demo, fid, {});
const ca = o.addShape(demo, fid, { x: 40, y: 40, shape: 'entity', title: 'Customer' }), cb = o.addShape(demo, fid, { x: 340, y: 40, shape: 'entity', title: 'Order' });
o.updateStep(demo, fid, ca, { note: 'id\nname' }); o.updateStep(demo, fid, cb, { note: 'id', sheetId: sheet.id });
const F = () => demo.flows.find((f) => f.id === fid); F().steps[1].triggers.push({ stepId: ca, msg: '1 to many' }); delete F().steps[1].standalone; F().steps[0].triggers.push({ stepId: cb, msg: 'belongs to' }); delete F().steps[0].standalone;
const ADD = { summary: 'Added a Shipment entity.', steps: [{ was: 0, team: 'General', title: 'Customer', waits: [{ on: 1, msg: 'belongs to' }] }, { was: 1, team: 'General', title: 'Order', lines: ['id', 'total'], waits: [{ on: 0, msg: '1 to many' }] }, { team: 'General', title: 'Shipment', lines: ['id', 'carrier'], waits: [{ on: 1, msg: '1 to 1' }] }], notes: [{ text: 'Is one order ever split?', step: 2 }] };
const DROP = { summary: 'Removed Shipment.', steps: [{ was: 0, team: 'General', title: 'Customer', waits: [{ on: 1, msg: 'belongs to' }] }, { was: 1, team: 'General', title: 'Order', waits: [{ on: 0, msg: '1 to many' }] }], notes: [] };
let answer = ADD; const seen = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen.push(b); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: answer === 'bad' ? 'no way' : JSON.stringify(answer) }] })); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + stub.address().port, r = reporter(), H = await harness({ data: { 'demo.json': demo, '.ai.json': { provider: 'claude', apiKey: 'sk-e2e-free', baseUrl: BASE } } }), { js, until, sleep } = H, q = JSON.stringify;
const file = () => H.readJson('data/demo.json'), flowOf = (d) => d.flows.find((f) => f.title === 'Data model'), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const field = (l) => `document.querySelector('[aria-label=${q(l)}]')`, dlg = `document.querySelector('[role=dialog][aria-label="Ask AI"]')`;
const pickFlow = async (t) => { await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === ${q(t)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === ${q(t)}).value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(800); };
const mainBoxes = () => js(`[...document.querySelectorAll('.react-flow__node-free')].filter((e) => !e.closest('[aria-label=Preview]')).length`);
const preview = () => js(`[...document.querySelectorAll('[aria-label=Preview] .react-flow__node-free')].map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 24), x: b.x, y: b.y, w: b.width, h: b.height, d: e.querySelector('[data-diff]')?.dataset.diff || null }; })`);
const marks = () => js(`(() => { const m = {}; document.querySelectorAll('[aria-label=Preview] [data-diff]').forEach((e) => { m[e.dataset.diff] = (m[e.dataset.diff] || 0) + 1; }); return m; })()`);
const overlap = (B) => B.some((a, i) => B.some((b, j) => j > i && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1));
const ask = async (text) => { await js(`${field('Ask AI instruction')}.focus(), true`); await H.type('Ask AI instruction', text); await H.click('Ask AI'); await until(`!!${dlg}`, 'dialog'); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flows drawn'); await pickFlow('Data model'); await until(`document.querySelectorAll('.react-flow__node-free').length === 2`, 'free flow drawn');
  r.check('the Ask AI box is there on a free canvas', await js(`!!${field('Ask AI instruction')}`));
  await ask('add a Shipment entity that belongs to an order'); await H.dlg('Send to Claude'); await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('[aria-label="AI summary"]')`, 'preview', 15000); await sleep(900);
  const sent = seen.join('');
  r.check('the AI was told it is a free canvas and was given the entities, their lines and the arrow that points backwards', sent.includes('FREE CANVAS') && sent.includes('Customer') && sent.includes('id\\\\nname') && sent.includes('belongs to'));
  const p = await preview(), m = await marks();
  r.check('the preview marks one new box and one changed box, none removed', m.new === 1 && m.changed === 1 && !m.removed, JSON.stringify(m));
  r.check('the new entity sits clear of every other box (nothing overlaps)', p.length === 3 && !overlap(p), JSON.stringify(p));
  r.check('the new box is placed beside the box it connects to, to its right', (() => { const s = p.find((x) => x.t.includes('Shipment')), od = p.find((x) => x.t.includes('Order')); return s.x > od.x + od.w; })());
  r.check('the list says in words what changes', await js(`(() => { const t = document.querySelector('[aria-label=Changes]').textContent; return t.includes('Add: Shipment') && t.includes('Change: Order') && t.includes('Arrows') && t.includes('Notes: 1 new'); })()`));
  await H.shot('ask-free-preview');
  r.check('nothing has changed behind the preview', (await mainBoxes()) === 2);
  await H.dlg('Discard'); await until(`!${dlg}`, 'closed'); r.check('Discard leaves the canvas as it was', (await mainBoxes()) === 2);

  await H.click('Ask AI'); await until(`!!${dlg}`, 'again'); await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('[aria-label="AI summary"]')`, 'preview 2', 15000); await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-free').length === 3`, '3 boxes'); await sleep(500);
  r.check('Accept adds the Shipment entity with its lines and the labelled relationship', await js(`document.body.innerText.includes('carrier') && [...document.querySelectorAll('.react-flow__edge')].some((e) => e.textContent.includes('1 to 1')) && document.body.innerText.includes('Is one order ever split?')`));
  await H.click('Undo'); await until(`document.querySelectorAll('.react-flow__node-free').length === 2`, 'undone'); r.check('one Undo takes the whole change back', (await mainBoxes()) === 2);
  await H.click('Redo'); await until(`document.querySelectorAll('.react-flow__node-free').length === 3`, 'redone'); await H.click('Save'); await saved();
  const f = flowOf(file()), S = f.steps.find((x) => x.title === 'Shipment'), C = f.steps.find((x) => x.title === 'Customer'), O = f.steps.find((x) => x.title === 'Order');
  r.check('the file has the new entity (shape, lines, place, relationship), valid', f.layout === 'free' && S.shape === 'entity' && S.note === 'id\ncarrier' && S.w >= 60 && S.triggers[0].msg === '1 to 1' && S.triggers[0].stepId === O.id && validate(file()).length === 0, JSON.stringify(S));
  r.check('the boxes it kept are exactly where they were, with their sheet, lines and the backward arrow', C.x === 40 && C.y === 40 && C.note === 'id\nname' && C.triggers[0].msg === 'belongs to' && O.x === 340 && O.sheetId === sheet.id && O.note === 'id\ntotal');
  r.check('the other flows are untouched', JSON.stringify(file().flows.filter((x) => x.title !== 'Data model')) === JSON.stringify(demo.flows.filter((x) => x.title !== 'Data model')));

  answer = DROP; await ask('remove the shipment'); await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('[aria-label=Changes]')`, 'drop preview', 15000); await sleep(900);
  r.check('a box the AI would delete is shown struck through and marked removed on the free canvas', (await marks()).removed === 1 && await js(`getComputedStyle(document.querySelector('[aria-label=Preview] [data-diff=removed] b')).textDecorationLine.includes('line-through')`));
  await H.dlg('Accept'); await until(`!${dlg}`, 'accepted drop'); await until(`document.querySelectorAll('.react-flow__node-free').length === 2`, 'two boxes'); await H.click('Save'); await saved();
  const g = file(); r.check('the deleted entity is in Removed with its place, and the file is valid', g.removed.some((x) => x.kind === 'step' && x.entry.title === 'Shipment' && Number.isFinite(x.entry.x) && x.entry.shape === 'entity') && validate(g).length === 0);
  await H.click('Removed'); await until(`document.body.innerText.includes('Shipment')`, 'removed'); await H.click('Restore'); await sleep(400); await H.click('Business flows'); await until(`document.querySelectorAll('.react-flow__node-free').length === 3`, 'restored');
  r.check('Restore puts the entity back on the canvas where it was', (await mainBoxes()) === 3);

  answer = 'bad'; const before = await mainBoxes(); await ask('do something'); await until(`!!document.querySelector('[role=dialog][aria-label="Ask AI"] [role=alert]')`, 'error', 15000);
  r.check('an answer that is not a flow shows a plain error and changes nothing', await js(`${dlg}.textContent.includes('Nothing was changed')`) && (await mainBoxes()) === before);
  await H.dlg('Close'); r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot ask-free-preview):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); stub.close(); }
process.exit(r.failed ? 1 : 0);
