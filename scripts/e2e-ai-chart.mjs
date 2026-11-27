// The AI picks a chart type and the app lays it out, in a real browser, against a fake provider (no real AI, no key): an entity diagram, a waterfall that can be
// redrawn as a flowchart or a swimlane without asking the AI again, a swimlane that stays a swimlane, and a free flow. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-ai-chart.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data, sheet = demo.sheets[0];
const ENTITY = { chart: 'entity', reason: 'These are things and how they relate.', steps: [{ title: 'Customer', lines: ['id', 'name', 'email'], sheet: sheet.name }, { title: 'Order', lines: ['id', 'total'], waits: [{ on: 0, msg: '1 to many' }] }, { title: 'Line', lines: ['qty'], waits: [{ on: 1, msg: '1 to many' }] }, { title: 'Product', lines: ['sku'], waits: [{ on: 2, msg: 'many to 1' }] }], notes: [{ text: 'Is a product ever deleted?', step: null }] };
const PHASES = (chart) => ({ chart, reason: 'Phases run one after another.', teams: ['Ops'], steps: [{ team: 'Ops', title: 'Collect', kind: 'start' }, { team: 'Ops', title: 'Clean', waits: [{ on: 0 }] }, { team: 'Ops', title: 'Valid?', kind: 'decision', waits: [{ on: 1 }] }, { team: 'Ops', title: 'Publish', waits: [{ on: 2, msg: 'Yes' }] }, { team: 'Ops', title: 'Fix', waits: [{ on: 2, msg: 'No' }] }], notes: [{ text: 'Assumed weekly', step: null }] });
let answer = ENTITY; const seen = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen.push(b); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }] })); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + stub.address().port, r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H, q = JSON.stringify;
fs.writeFileSync(path.join(H.sandbox, 'data', '.ai.json'), JSON.stringify({ provider: 'claude', apiKey: 'sk-e2e-chart', baseUrl: BASE }));
const file = () => H.readJson('data/demo.json'), flowOf = (t) => file().flows.find((f) => f.title === t), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const field = (l) => `document.querySelector('[aria-label=${q(l)}]')`, dlg = `document.querySelector('[role=dialog][aria-label="Generate flow"]')`;
const fill = async (l, v) => { await js(`${field(l)}.focus(), true`); await H.type(l, v); await js(`${field(l)}.blur(), true`); };
const newFlow = async (t) => { await H.type('New flow name', t); await H.click('New flow'); await until(`document.querySelector('select').selectedOptions[0].text === ${q(t)} && !!${field('Brief')}`, 'flow ' + t); await sleep(500); };
const count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`), main = (sel) => js(`[...document.querySelectorAll(${q(sel)})].filter((e) => !e.closest('[aria-label=Preview]')).length`);
const boxes = () => js(`[...document.querySelectorAll('[aria-label=Preview] .react-flow__node-free')].map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 12), x: b.x, y: b.y, w: b.width, h: b.height }; })`);
const options = () => js(`[...document.querySelector('select[aria-label="Chart type"]').options].map((o) => o.text.split(' (')[0])`), chosen = () => js(`document.querySelector('select[aria-label="Chart type"]').selectedOptions[0].text.split(' (')[0]`);
const choose = async (label) => { await H.choose('Chart type', label); await sleep(900); };
const overlap = (B) => B.some((a, i) => B.some((b, j) => j > i && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1));
const generate = async (brief, first = false) => { await fill('Brief', brief); await H.click('Generate flow'); await until(`!!${dlg}`, 'dialog'); if (first) { await H.dlg('Send to Claude'); } await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('select[aria-label="Chart type"]')`, 'preview', 15000); await sleep(900); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flows drawn');

  // 1. entity
  await newFlow('Data model'); await generate('Customers place orders made of lines for products', true);
  r.check('the AI\'s chart type and its reason are shown', await js(`${dlg}.textContent.includes('Entity diagram') && ${dlg}.textContent.includes('things and how they relate')`));
  r.check('an entity answer can only be drawn as an entity diagram', JSON.stringify(await options()) === JSON.stringify(['Entity diagram']));
  const e = await boxes(); r.check('the preview draws four entity boxes without overlap, left to right', e.length === 4 && !overlap(e) && e[0].x < e[1].x && e[1].x < e[2].x && e[2].x < e[3].x && (await count('[aria-label=Preview] [data-shape=entity]')) === 4);
  r.check('it says the flow becomes a free canvas that cannot go back to lanes', await js(`document.querySelector('[aria-label="Free canvas notice"]')?.textContent.includes('cannot be turned back')`));
  await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-free').length === 4`, 'drawn'); await sleep(500);
  r.check('Accept shows the free canvas with entity boxes, their lines, the sheet tag and the relationship labels', await js(`document.querySelector('[aria-label=Layout]')?.textContent === 'Free canvas' && document.body.innerText.includes('email') && !!document.querySelector('[aria-label="Entity sheet"]') && [...document.querySelectorAll('.react-flow__edge')].some((x) => x.textContent.includes('1 to many'))`));
  await H.click('Save'); await saved(); const d1 = flowOf('Data model');
  r.check('the file holds the entities (name, lines, sheet), the labelled relationships and a note; it is valid', d1.layout === 'free' && d1.steps.length === 4 && d1.steps[0].shape === 'entity' && d1.steps[0].note === 'id\nname\nemail' && d1.steps[0].sheetId === sheet.id && d1.steps[1].triggers[0].msg === '1 to many' && d1.notes.length === 1 && validate(file()).length === 0);
  await H.shot('chart-entity');

  // 2. a waterfall that can be redrawn without asking the AI again
  answer = PHASES('waterfall'); await newFlow('Phases'); const before = seen.length; await generate('Collect, clean, validate, publish');
  r.check('a process answer can be drawn as a swimlane, a flowchart or a waterfall, starting with the AI\'s choice', JSON.stringify(await options()) === JSON.stringify(['Swimlane', 'Flowchart', 'Waterfall']) && (await chosen()) === 'Waterfall');
  const w = await boxes(); r.check('the waterfall steps right and down, stage by stage, without overlap', w.length === 5 && !overlap(w) && w.every((b, i) => !i || (b.x > w[i - 1].x && b.y > w[i - 1].y)));
  await choose('Flowchart'); const fc = await boxes();
  r.check('choosing Flowchart redraws it in rows from the top, with the two branches side by side, without overlap', fc.length === 5 && !overlap(fc) && Math.abs(fc[3].y - fc[4].y) < 3 && fc[3].x !== fc[4].x && fc[0].y < fc[1].y);
  await choose('Swimlane'); await until(`document.querySelectorAll('[aria-label=Preview] .react-flow__node-lane').length >= 1`, 'lanes'); 
  r.check('choosing Swimlane shows lanes and drops the free-canvas notice', (await count('[aria-label=Preview] .react-flow__node-lane')) >= 1 && !(await js(`!!document.querySelector('[aria-label="Free canvas notice"]')`)));
  r.check('redrawing never asked the AI again', seen.length === before + 1);
  await choose('Flowchart'); await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-free').length === 5`, 'flowchart drawn'); await sleep(400);
  r.check('Accept uses the chosen chart type: a free canvas with a diamond for the decision and pills for start', (await main('.react-flow__node-free [data-shape=diamond], .react-flow__node-free [data-kind=decision]')) >= 1 && (await js(`!!document.querySelector('.react-flow__node-free [data-kind=start]')`)));
  r.check('the Yes and No labels are on the decision\'s arrows', await js(`(() => { const t = [...document.querySelectorAll('.react-flow__edge')].map((x) => x.textContent.trim()); return t.includes('Yes') && t.includes('No'); })()`));
  await H.click('Undo'); await until(`!document.querySelector('[aria-label=Layout]')`, 'undone');
  r.check('one Undo takes it all back, including the switch to a free canvas', (await main('.react-flow__node-free')) === 0 && !(await js(`!!document.querySelector('[aria-label=Layout]')`)));

  // 3. a swimlane choice stays a swimlane
  answer = { chart: 'swimlane', reason: 'Two teams hand work over.', teams: ['Sales', 'Finance'], steps: [{ team: 'Sales', title: 'Send quote', kind: 'start' }, { team: 'Finance', title: 'Approve', waits: [{ on: 0, msg: 'quote' }] }], notes: [] };
  await newFlow('Lanes'); await generate('Sales sends, Finance approves');
  r.check('when the AI says swimlane the preview starts as a swimlane, with no free-canvas notice', (await chosen()) === 'Swimlane' && !(await js(`!!document.querySelector('[aria-label="Free canvas notice"]')`)));
  await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-step').length === 2`, 'lanes drawn');
  r.check('Accept keeps it a swimlane flow with lanes', (await main('.react-flow__node-lane')) === 2 && !(await js(`!!document.querySelector('[aria-label=Layout]')`)));

  // 4. an empty free flow cannot be given lanes
  answer = PHASES('swimlane'); await newFlow('Free one'); await H.click('Switch to free canvas'); await until(`!!document.querySelector('[role=dialog]')`, 'switch dialog'); await H.dlg('Switch to free canvas'); await until(`!!document.querySelector('[aria-label=Layout]')`, 'free'); await sleep(400);
  await generate('Collect, clean, publish');
  r.check('on a free flow there is no swimlane option, and a swimlane answer starts as a flowchart', JSON.stringify(await options()) === JSON.stringify(['Flowchart', 'Waterfall']) && (await chosen()) === 'Flowchart');
  await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-free').length === 5`, 'free filled');
  r.check('the free flow is filled with boxes', (await main('.react-flow__node-free')) === 5);
  await H.click('Save'); await saved();
  r.check('the saved file is valid and the other flows are untouched', validate(file()).length === 0 && JSON.stringify(flowOf('Weekly payroll')) === JSON.stringify(demo.flows.find((f) => f.title === 'Weekly payroll')));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot chart-entity):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); stub.close(); }
process.exit(r.failed ? 1 : 0);
