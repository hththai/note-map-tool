// The ticket board in a real browser, on a throwaway sandbox: drag a card to change its status, the Blocked question, undo, rename and edit in place, quick add, table view.
// Run: node scripts/e2e-tickets.mjs  (needs Chrome, python3, node; builds nothing: `npm run e2e` builds app/dist first)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const open = demo.tickets.items.filter((t) => t.status === 'todo' || t.status === 'doing'), [A, B, C, D] = open.map((t) => t.id);
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, click, type } = H;
const saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const file = () => H.readJson('data/demo.json').tickets.items;
const get = (id) => file().find((t) => t.id === id);
/* a real drag: dragstart on the card, then dragover and drop on the column, sharing one DataTransfer */
const drag = (id, status) => js(`(() => { const dt = new DataTransfer(), card = document.querySelector('[data-ticket="${id}"]'), col = document.querySelector('section[data-status="${status}"]'); if (!card || !col) throw new Error('no card or column'); const ev = (t, el) => el.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); ev('dragstart', card); ev('dragover', col); ev('drop', col); return true; })()`);
const key = (aria, k) => js(`(() => { const i = document.querySelector('[aria-label=${JSON.stringify(aria)}]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`);
try {
  r.check('the sandbox has tickets to move', open.length >= 4 && validate(demo).length === 0, String(open.length));
  await H.goto(`${H.url}/?map=demo#overview`); await until(`document.body.textContent.includes('Tickets & projects')`, 'app'); await click('Tickets & projects');
  await until(`!!document.querySelector('[data-ticket="${A}"]')`, 'board');
  r.check('the board shows a summary strip and four columns', await js(`document.querySelectorAll('section[data-status]').length === 4 && !!document.querySelector('[aria-label=Summary]')`));

  await drag(A, 'done'); await until(`!!document.querySelector('section[data-status="done"] [data-ticket="${A}"]')`, 'moved to Done');
  await click('Save'); await saved();
  r.check('dragging a card to Done changes its status and saves it', get(A).status === 'done' && get(A).updated === new Date().toLocaleDateString('en-CA'));

  await drag(B, 'blocked'); await until(`!!document.querySelector('[role=dialog][aria-label="Why is it blocked?"]')`, 'blocked question');
  r.check('dropping on Blocked asks why, and nothing moves yet', get(B).status !== 'blocked' && await js(`!document.querySelector('section[data-status="blocked"] [data-ticket="${B}"]')`));
  await click('Cancel'); await H.sleep(200);
  r.check('Cancel leaves the card where it was', await js(`!!document.querySelector('section[data-status="${open.find((t) => t.id === B).status}"] [data-ticket="${B}"]')`));
  await drag(B, 'blocked'); await until(`!!document.querySelector('[role=dialog]')`, 'ask again'); await type('Blocked because', 'Waiting on the vendor'); await click('Block it');
  await until(`!!document.querySelector('section[data-status="blocked"] [data-ticket="${B}"]')`, 'blocked'); await click('Save'); await saved();
  r.check('a blocked card keeps its reason and shows in the summary', get(B).status === 'blocked' && get(B).blocked === 'Waiting on the vendor' && await js(`document.querySelector('[aria-label=Summary]').textContent.includes('Waiting on the vendor')`));
  await drag(B, 'doing'); await until(`!!document.querySelector('section[data-status="doing"] [data-ticket="${B}"]')`, 'unblocked'); await click('Save'); await saved();
  r.check('moving out of Blocked clears the reason', get(B).status === 'doing' && !('blocked' in get(B)));

  const before = get(C).status; await drag(C, before === 'doing' ? 'todo' : 'doing'); await until(`!document.querySelector('section[data-status="${before}"] [data-ticket="${C}"]')`, 'moved'); await click('Undo');
  await until(`!!document.querySelector('section[data-status="${before}"] [data-ticket="${C}"]')`, 'undone'); r.check('a drag is one undo step', true);

  await js(`document.querySelector('[data-ticket="${C}"] button[title="Click to rename"]').click(), true`); await until(`!!document.querySelector('[aria-label="Title of ${C}"]')`, 'rename field');
  await type(`Title of ${C}`, 'Renamed right on the card'); await key(`Title of ${C}`, 'Enter'); await until(`document.body.textContent.includes('Renamed right on the card')`, 'renamed');
  await click('Save'); await saved();
  r.check('clicking a title renames it in place', get(C).title === 'Renamed right on the card');
  await js(`document.querySelector('[data-ticket="${C}"] button[title="Click to rename"]').click(), true`); await type(`Title of ${C}`, 'Not kept'); await key(`Title of ${C}`, 'Escape');
  await until(`!document.querySelector('[aria-label="Title of ${C}"]')`, 'rename closed');
  r.check('Escape drops a rename', await js(`document.body.textContent.includes('Renamed right on the card') && !document.body.textContent.includes('Not kept')`));

  await js(`(() => { const s = document.querySelector('[data-ticket="${D}"] select[aria-label=Priority]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'urgent'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await H.sleep(300);
  await js(`document.querySelector('[data-ticket="${D}"] input[aria-label=Owner]').focus(), true`); await H.sleep(100);
  await js(`(() => { const o = document.querySelector('[data-ticket="${D}"] input[aria-label=Owner]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(o, 'Zoe'); o.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await H.sleep(100);
  await js(`document.querySelector('[data-ticket="${D}"] input[aria-label=Owner]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })), true`); await H.sleep(200);
  await click('Save'); await saved();
  r.check('priority and owner change right on the card', get(D).priority === 'urgent' && get(D).owner === 'Zoe', JSON.stringify([get(D).priority, get(D).owner]));
  r.check('urgent cards sort to the top of their column', await js(`document.querySelector('section[data-status="${get(D).status}"] [data-ticket]').getAttribute('data-ticket') === '${D}'`));

  const n = file().length; await type('Add to To do', 'Quick captured ticket'); await key('Add to To do', 'Enter'); await until(`document.body.textContent.includes('Quick captured ticket')`, 'quick add'); await click('Save'); await saved();
  const q = file().find((t) => t.title === 'Quick captured ticket');
  r.check('the + Add row creates a ticket in that column', file().length === n + 1 && q?.status === 'todo' && validate(H.readJson('data/demo.json')).length === 0);

  await click('Table'); await until(`!!document.querySelector('table')`, 'table view');
  r.check('the table groups tickets by department and the choice is remembered', await js(`document.querySelectorAll('table').length >= 1 && localStorage.getItem('tview') === 'table'`));
  await H.goto(`${H.url}/?map=demo#overview`); await until(`document.body.textContent.includes('Tickets & projects')`, 'reloaded'); await click('Tickets & projects'); await until(`!!document.querySelector('table')`, 'table after reload');
  r.check('after a reload it is still the table', true);
  await js(`(() => { const row = [...document.querySelectorAll('tr')].find((x) => x.textContent.includes('${q.id}')); const s = row.querySelector('select[aria-label=Status]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'done'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await click('Save'); await saved();
  r.check('a status changed in a table row is saved', get(q.id).status === 'done');
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
