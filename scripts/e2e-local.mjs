// End-to-end check on a THROWAWAY COPY of the demo files (never maps/ or data/ of the project): import, edit, save, undo, delete, restore, conflict.
// Needs Google Chrome (set CHROME=... if it is not in the macOS location), python3, node. Run: node scripts/e2e-local.mjs
import fs from 'node:fs'; import path from 'node:path';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), r = reporter();
const H = await harness({ files: ['demo.md', 'demo.flows.md', 'demo.tickets.json'] });
const { js, until, click, typeLabel, readJson, status, check = r.check } = H;
const saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const canvasHas = (n) => until(`[...document.querySelectorAll('.react-flow__node')].some((n) => n.textContent.startsWith('${n}'))`, 'canvas');
const clickNode = (n) => js(`[...document.querySelectorAll('.react-flow__node')].find((x) => x.textContent.startsWith('${n}')).click(), true`);
try {
  // 1. a map with only old files offers the import and creates the data file
  await H.goto(`${H.url}/?map=demo#overview`);
  await until(`document.body.textContent.includes('Import “demo”')`, 'import panel');
  r.check('map without a data file offers the import', await js(`document.body.textContent.includes('Checked: nothing is lost')`));
  await click('Create the data file'); await until(`document.body.textContent.includes('Nothing to save')`, 'map opened');
  const d0 = readJson('data/demo.json');
  r.check('import created data/demo.json', d0.schemaVersion === 1 && d0.sheets.length === 16, `${d0.sheets.length} sheets`);
  r.check('the old files were not touched', fs.readFileSync(path.join(H.sandbox, 'maps/demo.md'), 'utf8') === fs.readFileSync(path.join(root, 'maps/demo.md'), 'utf8'));

  // 2. click a file on the map, edit it in the modal, Save writes the file at once
  await canvasHas('Orders'); await clickNode('Orders'); await until(`!!document.querySelector('[role=dialog][aria-label^="File · Orders"]')`, 'file modal');
  await typeLabel('Owner', 'Zed');
  r.check('typing in the modal changes nothing until Save', readJson('data/demo.json').sheets.find((s) => s.name === 'Orders').owner !== 'Zed');
  await H.dlg('Save'); await saved(); await until(`!document.querySelector('[role=dialog]')`, 'modal closed');
  r.check('the modal Save writes the edit to the data file', readJson('data/demo.json').sheets.find((s) => s.name === 'Orders').owner === 'Zed');
  await H.shot('1-edited');

  // 3. undo and redo
  await H.blur(); await click('Undo'); await until(`document.querySelector('[role=status]').textContent.includes('Unsaved')`, 'unsaved after undo');
  await click('Redo'); await until(`/Nothing|Saved/.test(document.querySelector('[role=status]').textContent)`, 'saved again after redo');
  r.check('undo then redo returns to the saved state', true);

  // 4. delete -> Removed -> restore, the same data
  const before = JSON.stringify(readJson('data/demo.json').sheets);
  await clickNode('Orders'); await until(`!!document.querySelector('[role=dialog]')`, 'file modal to delete'); await H.dlg('Move to Removed'); await saved(); await until(`!document.querySelector('[role=dialog]')`, 'modal closed after delete');
  const gone = readJson('data/demo.json');
  r.check('delete moves the sheet to Removed (and takes its links)', gone.removed.length === 1 && !gone.sheets.some((s) => s.name === 'Orders') && gone.removed[0].links.length >= 1, `${gone.removed[0].links.length} link(s) went with it`);
  await click('Removed'); await until(`document.body.textContent.includes('removed ')`, 'removed list'); await H.shot('2-removed');
  await click('Restore'); await click('Save'); await saved();
  const back = readJson('data/demo.json');
  r.check('restore brings back exactly the same sheets, links and order', JSON.stringify(back.sheets) === before && JSON.stringify(back.links) === JSON.stringify(d0.links) && back.removed.length === 0);

  // 5. ticket status change
  await click('Tickets & projects'); await until(`!!document.querySelector('select[aria-label=Status]')`, 'work board');
  await H.choose('Status', 'Done'); await click('Save'); await saved();
  r.check('ticket status change is saved', readJson('data/demo.json').tickets.items.some((t) => t.status === 'done' && t.updated === new Date().toLocaleDateString('en-CA')));

  // 6. conflict: the file changes on disk behind the app's back
  const disk = readJson('data/demo.json'); disk.title = 'Edited elsewhere'; fs.writeFileSync(path.join(H.sandbox, 'data/demo.json'), JSON.stringify(disk, null, 2) + '\n');
  await click('Overview'); await canvasHas('Orders'); await clickNode('Orders'); await until(`!!document.querySelector('[role=dialog]')`, 'file modal 2');
  await typeLabel('Owner', 'Mine'); await H.dlg('Save'); await until(`document.querySelector('[role=dialog] [role=alert]')?.textContent.includes('changed on disk')`, 'conflict in the modal');
  r.check('the conflict is shown inside the modal, which stays open', await js(`!!document.querySelector('[role=dialog]')`));
  r.check('a save after an outside change is refused and nothing is overwritten', readJson('data/demo.json').title === 'Edited elsewhere' && readJson('data/demo.json').sheets.find((s) => s.name === 'Orders').owner !== 'Mine');
  await H.shot('3-conflict');
  await H.dlg('Overwrite (keep my edits)'); await saved(); await until(`!document.querySelector('[role=dialog]')`, 'modal closed after overwrite');
  const hist = fs.readdirSync(path.join(H.sandbox, 'data/.history/demo.json'));
  r.check('Overwrite keeps my edit and snapshots the other version first', readJson('data/demo.json').sheets.find((s) => s.name === 'Orders').owner === 'Mine' && hist.some((h) => JSON.parse(fs.readFileSync(path.join(H.sandbox, 'data/.history/demo.json', h), 'utf8')).title === 'Edited elsewhere'), `${hist.length} snapshots`);
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('\nsandbox (screenshots):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
