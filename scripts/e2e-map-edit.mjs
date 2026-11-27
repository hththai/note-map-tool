// Editing on the map in a real browser: drag a link between two cards, click an arrow, move a file by typing its function, Escape and Cancel throw a draft away,
// a department with files cannot be deleted, and a New map name is made from the title. Throwaway sandbox. Run: node scripts/e2e-map-edit.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, click, typeLabel } = H;
const file = () => H.readJson('data/demo.json'), saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const dlgOpen = (name) => until(`!!document.querySelector('[role=dialog][aria-label^=${JSON.stringify(name)}]')`, 'modal ' + name), gone = () => until(`!document.querySelector('[role=dialog]')`, 'modal closed');
const node = (name) => `[...document.querySelectorAll('.react-flow__node')].find((x) => x.textContent.startsWith(${JSON.stringify(name)}))`;
const clickNode = (name) => js(`${node(name)}.click(), true`);
const handle = (name, kind) => js(`(() => { const h = ${node(name)}.querySelector('.react-flow__handle.${kind}'); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
const unlinked = (a, b) => !demo.links.some((l) => l.fromId === demo.sheets.find((s) => s.name === a).id && l.toId === demo.sheets.find((s) => s.name === b).id);
try {
  r.check('the sandbox has two cards with no link between them', unlinked('Inventory', 'CRM'), String(demo.links.length));
  await H.goto(`${H.url}/?map=demo#overview`); await until(`!!${node('Inventory')} && !!${node('CRM')}`, 'map drawn'); await H.sleep(400);

  // 1. drag from one card's edge to another's
  const from = await handle('Inventory', 'source'), to = await handle('CRM', 'target'); await H.drag(from, to);
  await dlgOpen('New link');
  r.check('dragging from a card edge to another opens a link modal with both ends chosen', await js(`(() => { const v = (l) => document.querySelector('[role=dialog] [role=combobox][aria-label=' + JSON.stringify(l) + ']').value; return v('From') === 'Inventory' && v('To') === 'CRM'; })()`));
  r.check('nothing is written before Save', file().links.length === demo.links.length);
  await H.shot('link-modal'); await click('manual copy'); await H.dlg('Save'); await gone(); await saved();
  const l = file().links.at(-1);
  r.check('Save adds the link and writes the file', file().links.length === demo.links.length + 1 && l.label === 'manual copy' && l.fromId === demo.sheets.find((s) => s.name === 'Inventory').id && validate(file()).length === 0);

  // 2. click an arrow, delete it from its modal (it goes to Removed)
  await H.sleep(300); await js(`document.querySelector('.react-flow__edge[data-id="l:${l.id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), true`); await dlgOpen('Link');
  await H.dlg('Move to Removed'); await gone(); await saved();
  r.check('clicking an arrow opens its modal; deleting moves it to Removed', file().links.length === demo.links.length && file().removed.some((x) => x.kind === 'link'));

  await clickNode('Orders'); await dlgOpen('File · Orders'); await H.shot('file-modal'); await H.dlg('Cancel'); await gone(); await H.shot('map');

  // 3. Escape and Cancel throw the draft away
  const owner = file().sheets.find((s) => s.name === 'Orders').owner;
  await clickNode('Orders'); await dlgOpen('File · Orders'); await typeLabel('Owner', 'Nobody'); await js(`document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`); await gone();
  await clickNode('Orders'); await dlgOpen('File · Orders');
  r.check('Escape closes the modal and the draft is gone', file().sheets.find((s) => s.name === 'Orders').owner === owner && await js(`[...document.querySelectorAll('[role=dialog] label')].find((x) => x.textContent.startsWith('Owner')).querySelector('input').value === ${JSON.stringify(owner)}`));

  // 4. move the file to another function by typing, not by scrolling
  const target = demo.departments.flatMap((d) => d.sections.map((s) => ({ d, s }))).find((x) => x.d.id !== demo.sheets.find((s) => s.name === 'Orders').departmentId && x.s.title);
  await H.pick('Function', target.s.title.slice(0, 6), `${target.d.name} › ${target.s.title}`); await H.dlg('Save'); await gone(); await saved();
  const moved = file().sheets.find((s) => s.name === 'Orders');
  r.check('typing a few letters finds the function; Save moves the file there', moved.sectionId === target.s.id && moved.departmentId === target.d.id && validate(file()).length === 0);

  // 5. a department with files cannot be deleted, and says why
  await clickNode(target.d.name.toUpperCase() === target.d.name ? target.d.name : target.d.name); await dlgOpen('Department ·');
  r.check('Delete department is disabled while it has files, with the reason', await js(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === 'Delete department'); return b.disabled && /Move or delete its \\d+ files? first/.test(b.title); })()`));
  await H.dlg('Cancel'); await gone();

  // 6. New map: a title is enough, the file name comes from it
  await click('＋ New map'); await H.sleep(200); await typeLabel('Title', 'Demo'); await click('Create map'); await until(`document.body.textContent.includes('This map is empty')`, 'new map opened');
  r.check('a title that matches an existing file name gets a numbered one', fs.existsSync(path.join(H.sandbox, 'data/demo-2.json')));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshots link-modal, file-modal, map):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
