// The brief and the rough draft on a flow, in a real browser: typed in the details panel, saved with Save, back after a reload, undoable,
// limited in length, and nothing else about the flow changes. Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-brief.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until } = H;
const file = () => H.readJson('data/demo.json').flows[0], saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
const field = (l) => `document.querySelector('[aria-label=${JSON.stringify(l)}]')`;
const fill = async (l, v) => { await js(`${field(l)}.focus(), true`); await H.type(l, v); await js(`${field(l)}.blur(), true`); };
try {
  const before = JSON.stringify(demo.flows[0]);
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4 && !!${field('Brief')}`, 'flow and details drawn');
  r.check('a flow with no brief shows two empty boxes under "Describe your case"', await js(`${field('Brief')}.value === '' && ${field('Draft')}.value === '' && !!document.querySelector('[role=group][aria-label="Describe your case"]')`));
  await fill('Brief', 'Quotes wait too long for Finance.\nSales asks for updates by email.'); await fill('Draft', '- Sales sends the quote\n- Finance checks the price');
  r.check('typing a brief and a draft marks the map as unsaved and writes nothing yet', (await H.status()).includes('Unsaved') || !(await H.status()).includes('Saved'));
  r.check('nothing is in the file before Save', file().brief === undefined);
  await H.click('Save'); await saved();
  r.check('Save writes both texts on the flow, and the file stays valid', file().brief.startsWith('Quotes wait') && file().draft.includes('Finance checks') && validate(H.readJson('data/demo.json')).length === 0);
  const after = { ...file() }; delete after.brief; delete after.draft;
  r.check('nothing else about the flow changed', JSON.stringify(after) === before);
  await H.goto(`${H.url}/?map=demo#flows`); await until(`!!${field('Brief')}`, 'reloaded');
  r.check('after a reload both boxes show what was saved', await js(`${field('Brief')}.value.includes('Sales asks for updates') && ${field('Draft')}.value.includes('Sales sends the quote')`));
  r.check('a box stops accepting text at the 8000-character limit', await js(`${field('Brief')}.maxLength === 8000 && ${field('Draft')}.maxLength === 8000`));
  await fill('Brief', ''); await H.click('Undo'); await until(`${field('Brief')}.value.includes('Quotes wait')`, 'undone');
  r.check('clearing the brief and pressing Undo brings it back', await js(`${field('Brief')}.value.includes('Quotes wait')`));
  await fill('Brief', ''); await H.click('Save'); await saved();
  r.check('an emptied brief is removed from the file, not saved as empty text', file().brief === undefined && file().draft !== undefined);
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
