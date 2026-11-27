// Start/end markers, decisions with Yes/No branches, and editing an arrow's label on the Business flows canvas, in a real browser.
// Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-shapes.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H;
const q = JSON.stringify, file = () => H.readJson('data/demo.json'), qa = () => file().flows.find((f) => f.title === 'Quote approval');
const step = (t) => `[...document.querySelectorAll('.react-flow__node-step')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const kindOf = (t) => js(`${step(t)}?.querySelector('[data-kind]')?.getAttribute('data-kind') ?? ${step(t)}?.firstElementChild?.getAttribute('data-kind')`);
const toolbar = (label) => js(`(() => { const b = [...document.querySelectorAll('[role=toolbar] button')].find((x) => x.textContent.trim() === ${q(label)}); if (!b) throw new Error('no toolbar button ' + ${q(label)}); b.click(); return true; })()`);
const typingStep = `document.activeElement?.getAttribute('aria-label') === 'New step text'`;
const labels = () => js(`[...document.querySelectorAll('.react-flow__edge')].map((e) => e.textContent.trim()).filter(Boolean)`);
/* select a step by clicking its box (some end up off-screen, behind the details panel), then set its shape in whichever "Step N" card opened */
const shape = async (t, text) => {
  await js(`${step(t)}.click(), true`); await until(`!!document.querySelector('[role=group][aria-label^="Step "]') && document.querySelector('[role=group][aria-label^="Step "] input[aria-label="Step title"]').value.includes(${q(t)})`, 'details of ' + t);
  const g = await js(`document.querySelector('[role=group][aria-label^="Step "]').getAttribute('aria-label')`); await H.choose('Step shape', text, g);
};
const save = async () => { await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved'); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4`, 'flow drawn');
  await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === 'Quote approval')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === 'Quote approval').value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await until(`!!${step('Sign off')}`, 'Quote approval drawn'); await sleep(600);
  r.check('a flow with no shapes draws every step as an ordinary box', await js(`[...document.querySelectorAll('.react-flow__node-step [data-kind]')].every((e) => e.getAttribute('data-kind') === 'step')`));

  // 1. make a step a decision from the details panel
  await shape('Sign off', 'Decision'); await sleep(400);
  r.check('choosing Decision draws the step as a diamond', await js(`!!${step('Sign off')}.querySelector('polygon')`) && await kindOf('Sign off') === 'decision');

  // 2. "+ Next" from a decision makes the Yes branch, then the No branch
  await H.mclick(mid(await rect(step('Sign off')))); await until(`!!document.querySelector('[role=toolbar][aria-label="Step actions"]')`, 'toolbar'); await toolbar('+ Next');
  await until(typingStep, 'draft focused'); await H.insert('Pay out'); await H.key('Enter'); await until(`!!${step('Pay out')}`, 'Yes step'); await sleep(200); await H.key('Escape'); await sleep(300);
  await H.mclick(mid(await rect(step('Sign off')))); await until(`!!document.querySelector('[role=toolbar][aria-label="Step actions"]')`, 'toolbar 2'); await toolbar('+ Next');
  await until(typingStep, 'draft focused 2'); await H.insert('Ask for changes'); await H.key('Enter'); await until(`!!${step('Ask for changes')}`, 'No step'); await sleep(200); await H.key('Escape'); await sleep(400);
  const lab = await labels();
  r.check('the first two arrows out of a decision are labelled Yes and No', lab.includes('Yes') && lab.includes('No'), JSON.stringify(lab));

  // 3. start and end markers
  await shape('Draft quote', 'Start'); await shape('Send quote', 'End'); await sleep(400);
  r.check('Start and End draw as pills, and nothing else changes shape', await kindOf('Draft quote') === 'start' && await kindOf('Send quote') === 'end' && await kindOf('Pay out') === 'step');

  // 4. click an arrow and rename its label from the details panel
  await js(`[...document.querySelectorAll('.react-flow__edge')].find((e) => e.textContent.trim() === 'Yes').dispatchEvent(new MouseEvent('click', { bubbles: true })), true`);
  await until(`!!document.querySelector('[role=group][aria-label="Arrow"]')`, 'arrow panel');
  r.check('clicking an arrow shows its details, with a "Branch label" field when it leaves a decision', await js(`document.querySelector('[role=group][aria-label="Arrow"]').textContent.includes('Branch label')`));
  await js(`(() => { const i = document.querySelector('[aria-label="Arrow message"]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Approved'); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return true; })()`);
  await until(`[...document.querySelectorAll('.react-flow__edge')].some((e) => e.textContent.trim() === 'Approved')`, 'label changed');
  r.check('editing the label changes the arrow on the diagram', (await labels()).includes('Approved') && !(await labels()).includes('Yes'));

  // 5. Save: the shapes and labels are in a valid file, nothing lost
  await save(); const f = qa(), by = (t) => f.steps.find((s) => s.title.startsWith(t));
  r.check('Save writes the shapes and branch labels into a valid file', validate(file()).length === 0 && by('Sign off').kind === 'decision' && by('Draft quote').kind === 'start' && by('Send quote').kind === 'end' && by('Pay out').triggers[0].msg === 'Approved' && by('Ask for changes').triggers[0].msg === 'No' && !by('Pay out').kind);
  r.check('nothing was lost: every original step is still there', demo.flows.find((x) => x.title === 'Quote approval').steps.every((s0) => f.steps.some((s) => s.id === s0.id)));

  // 6. delete an arrow from its details, undo it, reload
  await js(`[...document.querySelectorAll('.react-flow__edge')].find((e) => e.textContent.trim() === 'No').dispatchEvent(new MouseEvent('click', { bubbles: true })), true`); await until(`!!document.querySelector('[role=group][aria-label="Arrow"]')`, 'arrow panel 2');
  const before = (await labels()).length; await H.click('Delete arrow'); await sleep(400);
  r.check('Delete arrow in the details removes it, and Undo brings it back', (await labels()).length === before - 1 && await js(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo').click(); return true; })()`) && (await sleep(400), (await labels()).length === before));
  await save(); await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4`, 'reloaded');
  await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === 'Quote approval')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === 'Quote approval').value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await until(`!!${step('Sign off')}`, 'Quote approval after reload'); await sleep(500);
  r.check('after a reload the shapes are still drawn', await kindOf('Sign off') === 'decision' && await kindOf('Draft quote') === 'start' && await kindOf('Send quote') === 'end');
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  await H.shot('flow-shapes'); console.log('sandbox (screenshot flow-shapes):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); await H.shot('flow-shapes-fail').catch(() => {}); console.log('sandbox:', H.sandbox); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
