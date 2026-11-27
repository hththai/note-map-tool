// A Data file written by an earlier build (no sort numbers on flows) must open, be brought up to date in memory, and only change on disk
// when you press Save, with a snapshot of the old file taken first. Throwaway sandbox only. Run: node scripts/e2e-upgrade.mjs
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const old = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
delete old.title; old.title = 'Old format'; old.flows.forEach((f) => { delete f.sort; f.steps.forEach((s) => delete s.sort); });
const r = reporter(), H = await harness({ files: [], data: { 'old.json': old } }), { until, click } = H;
try {
  r.check('the old-format file really is refused by the validator', validate(old).length > 0);
  const onDisk = fs.readFileSync(path.join(H.sandbox, 'data/old.json'), 'utf8');
  await H.goto(`${H.url}/?map=old#flows`);
  await until(`document.body.textContent.includes('brought up to date')`, 'upgrade notice');
  r.check('it opens and says it was brought up to date', true);
  await until(`document.querySelector('[role=status]').textContent.includes('Unsaved')`, 'unsaved marker');
  r.check('nothing is written until you press Save', fs.readFileSync(path.join(H.sandbox, 'data/old.json'), 'utf8') === onDisk);
  await until(`document.body.textContent.includes('Weekly payroll')`, 'flows shown'); r.check('its flows are shown', true);
  await click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
  const now = H.readJson('data/old.json'), hist = fs.readdirSync(path.join(H.sandbox, 'data/.history/old.json'));
  r.check('after Save the file is current and valid', validate(now).length === 0 && now.flows.every((f) => typeof f.sort === 'number'));
  r.check('a snapshot of the old file was taken first', hist.length === 1 && fs.readFileSync(path.join(H.sandbox, 'data/.history/old.json', hist[0]), 'utf8') === onDisk);
  r.check('no entry was lost', now.sheets.length === old.sheets.length && now.links.length === old.links.length && now.flows.length === old.flows.length && now.tickets.items.length === old.tickets.items.length);
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
