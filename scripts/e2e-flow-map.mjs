// The Flow map in a real browser: flows as boxes (coloured by Department), drag to connect two flows, label and re-point a connection, open a flow from the map,
// delete (to Removed) and restore, and deleting a flow takes its connections with it. Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-map.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H, q = JSON.stringify;
const file = () => H.readJson('data/demo.json'), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const box = (t) => `[...document.querySelectorAll('.react-flow__node-flowbox')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`), mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`), dot = (t) => js(`(() => { const h = ${box(t)}.querySelector('.react-flow__handle.source'); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
const A = demo.flows[0].title, B = demo.flows[1].title, C = 'Budget review';
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flows drawn');
  await H.type('New flow name', C); await H.click('New flow'); await until(`document.querySelector('select').selectedOptions[0].text === ${q(C)}`, 'new flow'); await sleep(300);
  await H.type('New lane name', 'Nobody'); await H.click('Add lane'); await sleep(300);
  await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__node-flowbox').length === 3`, 'flow map'); await sleep(600);
  r.check('the Flow map is in the left list and shows one box per flow, with how big it is', (await count('.react-flow__node-flowbox')) === 3 && await js(`${box(A)}.textContent.includes('steps') && ${box(A)}.textContent.includes('lanes')`));
  r.check('a flow whose first team is a Department is coloured and named by it; one that is not is grey', await js(`(() => { const a = ${box(A)}.querySelector('[data-dept]').dataset.dept, c = ${box(C)}.querySelector('[data-dept]').dataset.dept; return (a === 'none') === ${JSON.stringify(!demo.departments.some((d) => d.name.toLowerCase() === demo.flows[0].teams[0].toLowerCase()))} && c === 'none'; })()`));
  r.check('with no connections there are no arrows and a hint says how to make one', (await count('.react-flow__edge')) === 0 && await js(`document.body.innerText.includes("Drag from a flow's right dot")`));

  // connect A -> B by dragging, then label it
  await H.drag(await dot(A), mid(await rect(box(B))));
  await until(`document.querySelectorAll('.react-flow__edge').length === 1`, 'arrow drawn'); await until(`!!document.querySelector('[aria-label=Connection]')`, 'details open');
  r.check('dragging from one flow to another draws an arrow and opens its details', (await count('.react-flow__edge')) === 1 && await js(`document.querySelector('[aria-label=Connection]').textContent.includes(${q(A)})`));
  await js(`document.querySelector('[aria-label="Connection label"]').focus(), true`); await H.type('Connection label', 'payroll feeds quotes'); await js(`document.querySelector('[aria-label="Connection label"]').blur(), true`); await until(`[...document.querySelectorAll('.react-flow__edge')].some((e) => e.textContent.includes('payroll feeds quotes'))`, 'label');
  await H.choose('Starting step', '1.'); await sleep(300);
  r.check('the arrow can be labelled and given a starting step', true);
  await H.drag(await dot(B), mid(await rect(box(C)))); await until(`document.querySelectorAll('.react-flow__edge').length === 2`, 'second arrow'); await sleep(300);
  r.check('a second connection can be drawn to a third flow', (await count('.react-flow__edge')) === 2);
  r.check('the Flow map count in the left list says 2', await js(`[...document.querySelectorAll('nav button')].find((b) => b.textContent.startsWith('Flow map')).textContent.includes('2')`));
  await H.shot('flow-map');

  // the same two flows can be joined again only from a different starting step: a second whole-flow connection is fine once, a third identical one is refused
  await H.drag(await dot(A), mid(await rect(box(B)))); await until(`document.querySelectorAll('.react-flow__edge').length === 3`, 'whole-flow connection'); await sleep(400);
  await H.drag(await dot(A), mid(await rect(box(B)))); await sleep(700);
  r.check('joining the same two flows the same way a third time adds nothing and says so', (await count('.react-flow__edge')) === 3 && await js(`document.body.innerText.includes('already connected')`));
  await H.click('Delete connection'); await until(`document.querySelectorAll('.react-flow__edge').length === 2`, 'extra connection deleted'); await sleep(300);

  // open a flow from the map
  await js(`${box(B)}.click(), true`); await until(`!!document.querySelector('[aria-label=Flow]')`, 'flow details'); r.check('clicking a flow lists what leads to it and from it', await js(`document.querySelector('[aria-label=Flow]').textContent.includes('from ' + ${q(A)}) && document.querySelector('[aria-label=Flow]').textContent.includes('to ' + ${q(C)})`));
  await H.click('Open this flow'); await until(`document.querySelector('select').selectedOptions[0].text === ${q(B)} && document.querySelectorAll('.react-flow__node-step').length >= 1`, 'opened');
  r.check('Open this flow goes to Business flows with that flow selected', (await js(`document.querySelector('select').selectedOptions[0].text`)) === B);
  await H.click('Save'); await saved(); const f1 = file();
  r.check('Save writes the connections (with label and starting step) and the file is valid', f1.flowLinks.length === 2 && f1.flowLinks[0].label === 'payroll feeds quotes' && f1.flowLinks[0].fromStepId === f1.flows[0].steps[0].id && f1.flowLinks[0].toFlowId === f1.flows[1].id && validate(f1).length === 0, JSON.stringify(f1.flowLinks) + ' ' + validate(f1).join('; '));
  r.check('the old flow data is untouched', JSON.stringify(f1.flows.slice(0, 2).map((f) => f.steps)) === JSON.stringify(demo.flows.map((f) => f.steps)));

  // delete a connection with the keyboard, see it in Removed, restore it
  await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__edge').length === 2`, 'back on map'); await sleep(500);
  await js(`document.querySelectorAll('.react-flow__edge')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })), true`); await until(`!!document.querySelector('[aria-label=Connection]')`, 'connection details'); await sleep(200); await H.key('Delete'); await until(`document.querySelectorAll('.react-flow__edge').length === 1`, 'deleted');
  r.check('Delete removes the selected connection from the map', (await count('.react-flow__edge')) === 1);
  await H.click('Removed'); await until(`document.body.innerText.includes('Flow connection')`, 'removed view'); r.check('it is listed in Removed as a Flow connection with the two flows named', await js(`document.body.innerText.includes(${q(A + ' → ' + B)})`));
  await H.click('Restore'); await sleep(400); await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__edge').length === 2`, 'restored'); r.check('Restore puts the connection back on the map', (await count('.react-flow__edge')) === 2);

  // deleting a flow takes its connections with it
  await H.click('Business flows'); await until(`document.querySelectorAll('.react-flow__node-step').length >= 1`, 'flows'); await js(`(() => { const s = document.querySelector('select'); const o = [...s.options].find((x) => x.text === ${q(B)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); window.confirm = () => true; return true; })()`); await sleep(500);
  await H.click('Delete flow'); await until(`document.querySelectorAll('select')[0].options.length === 2`, 'flow deleted'); await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__node-flowbox').length === 2`, 'map after delete'); await sleep(400);
  r.check('deleting a flow takes its connections off the map with it', (await count('.react-flow__edge')) === 0 && (await count('.react-flow__node-flowbox')) === 2);
  await H.click('Removed'); await until(`document.body.innerText.includes(${q(B)})`, 'removed'); await H.click('Restore'); await sleep(500); await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__node-flowbox').length === 3`, 'flow back');
  r.check('restoring the flow brings its connections back too', (await count('.react-flow__edge')) === 2);
  await H.click('Save'); await saved(); const f2 = file(); r.check('after Save the file is valid and has both connections', f2.flowLinks.length === 2 && validate(f2).length === 0);
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 1`, 'reloaded'); await H.click('Flow map'); await until(`document.querySelectorAll('.react-flow__node-flowbox').length === 3`, 'map reloaded'); await sleep(500);
  r.check('after a reload the map is drawn from the file with its labelled connections', (await count('.react-flow__edge')) === 2 && await js(`document.body.innerText.includes('payroll feeds quotes')`));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot flow-map):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
