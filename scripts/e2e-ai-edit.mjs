// Ask AI on a flow that already has steps, in a real browser, against a fake provider (no real AI, no key): the preview marks new, changed and removed
// steps, Discard changes nothing, Accept is one undoable step, a removed step lands in Removed, and a bad answer leaves the flow alone. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-ai-edit.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const qa = demo.flows.find((f) => f.title === 'Quote approval'), [s0, s1, s2] = qa.steps; s0.ticket = 'T20261112.001'; s0.note = 'ask boss@example.com';
const KEY = 'sk-e2e-edit', ADD = { summary: 'Added a QA check and renamed the sign-off.', teams: [s0.team, 'QA', s1.team, s2.team], steps: [
  { was: 0, team: s0.team, title: s0.title }, { team: 'QA', title: 'QA check', waits: [{ on: 0, msg: 'draft' }] },
  { was: 1, team: s1.team, title: 'Manager sign-off', waits: [{ on: 1, msg: 'checked' }] }, { was: 2, team: s2.team, title: s2.title, waits: [{ on: 2, msg: '' }] }], notes: [{ text: 'Who runs QA?', step: 1 }] };
const DROP = { summary: 'Removed the sign-off.', teams: [s0.team, 'QA', s2.team], steps: [{ was: 0, team: s0.team, title: s0.title }, { was: 1, team: 'QA', title: 'QA check' }, { was: 3, team: s2.team, title: s2.title, waits: [{ on: 1, msg: 'ok' }] }], notes: [] };
let mode = 'add'; const seen = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen.push(b); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: mode === 'bad' ? 'I cannot do that' : JSON.stringify(mode === 'add' ? ADD : DROP) }] })); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + stub.address().port, r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until } = H, q = JSON.stringify;
const cfg = path.join(H.sandbox, 'data', '.ai.json'), file = () => H.readJson('data/demo.json'), flowOf = (d) => d.flows.find((f) => f.title === 'Quote approval');
const field = (l) => `document.querySelector('[aria-label=${q(l)}]')`, dlg = `document.querySelector('[role=dialog][aria-label="Ask AI"]')`;
const say = async (v) => { await js(`${field('Ask AI instruction')}.focus(), true`); await H.type('Ask AI instruction', v); };
const pickFlow = async (t) => { await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === ${q(t)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === ${q(t)}).value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await until(`!!${field('Brief')}`, 'details of ' + t); await H.sleep(300); };
const mainSteps = () => js(`[...document.querySelectorAll('.react-flow__node-step')].filter((e) => !e.closest('[aria-label=Preview]')).length`);
const marks = () => js(`(() => { const m = {}; document.querySelectorAll('[aria-label=Preview] [data-diff]').forEach((e) => { m[e.dataset.diff] = (m[e.dataset.diff] || 0) + 1; }); return m; })()`);
const hint = () => js(`document.querySelector('[aria-label="Ask AI hint"]')?.textContent || ''`), off = () => js(`document.querySelector('button[aria-label="Ask AI"]').disabled`);
const ask = async (text) => { await say(text); await H.click('Ask AI'); await until(`!!${dlg}`, 'dialog'); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3 && !!${field('Brief')}`, 'flow drawn');
  await pickFlow('Quote approval'); await H.sleep(500);
  r.check('with AI off the Ask AI button is disabled and says where to set it up', await off() && (await hint()).includes('AI is off'));
  fs.writeFileSync(cfg, JSON.stringify({ provider: 'claude', apiKey: KEY, baseUrl: BASE }));
  await pickFlow('Weekly payroll'); await pickFlow('Quote approval');
  r.check('with AI on but nothing typed the button asks for a change', await off() && (await hint()).includes('Type the change'));

  await ask('add a QA check before sign-off, tell boss@example.com'); r.check('the first time a notice names the provider before anything is sent', await js(`!!document.querySelector('[aria-label="AI notice"]')`) && seen.length === 0);
  await H.dlg('Send to Claude'); await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('[aria-label="AI summary"]')`, 'preview', 15000); await H.sleep(500);
  const sent = seen.join('');
  r.check('the AI was sent the steps and the request, but no ticket ids or emails', sent.includes(s0.title) && sent.includes('QA check before sign-off') && !/T20261112|example\.com/.test(sent));
  r.check('the AI was not sent the other flows', !sent.includes('Weekly payroll'));
  const m = await marks();
  r.check('the preview marks one new step and one changed step, and none removed', m.new === 1 && m.changed === 1 && !m.removed);
  r.check('the preview says in words what it will do', await js(`(() => { const t = document.querySelector('[aria-label=Changes]').textContent; return t.includes('Add: QA check') && t.includes('Change: Manager sign-off') && t.includes('Arrows') && t.includes('Notes: 1 new'); })()`));
  r.check('the AI\'s one-sentence summary is shown', await js(`document.querySelector('[aria-label="AI summary"]').textContent.includes('Added a QA check')`));
  await H.shot('ask-preview');
  r.check('nothing has changed behind the preview', (await mainSteps()) === 3);
  await H.dlg('Discard'); await until(`!${dlg}`, 'closed');
  r.check('Discard leaves the flow as it was', (await mainSteps()) === 3 && (await js(`${field('Ask AI instruction')}.value`)).includes('QA check'));

  await H.click('Ask AI'); await until(`!!${dlg}`, 'dialog again');
  r.check('the notice is not shown a second time', await js(`!document.querySelector('[aria-label="AI notice"]')`));
  await until(`!!document.querySelector('[aria-label=Preview]')`, 'second preview', 15000); await H.dlg('Accept'); await until(`!${dlg}`, 'accepted'); await until(`document.querySelectorAll('.react-flow__node-step').length === 4`, 'steps drawn');
  r.check('Accept puts the new step and the new words on the real diagram', await js(`document.body.innerText.includes('QA check') && document.body.innerText.includes('Manager sign-off') && document.body.innerText.includes('Who runs QA?')`));
  await H.click('Undo'); await until(`document.querySelectorAll('.react-flow__node-step').length === 3`, 'undone');
  r.check('one Undo takes the whole change back', (await mainSteps()) === 3 && !(await js(`document.body.innerText.includes('Manager sign-off')`)));
  await H.click('Redo'); await until(`document.querySelectorAll('.react-flow__node-step').length === 4`, 'redone'); await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
  const f = flowOf(file());
  r.check('Save keeps the untouched step exactly (ticket and note) and writes the change; the file is valid', f.steps.length === 4 && f.steps[0].ticket === 'T20261112.001' && f.steps[0].note === s0.note && f.steps[1].title === 'QA check' && f.steps[2].title === 'Manager sign-off' && f.notes.length === 1 && validate(file()).length === 0);
  r.check('the other flows are untouched', JSON.stringify(file().flows.find((x) => x.title === 'Weekly payroll')) === JSON.stringify(demo.flows.find((x) => x.title === 'Weekly payroll')));

  mode = 'drop'; await ask('remove the sign-off'); await until(`!!document.querySelector('[aria-label=Preview]') && !!document.querySelector('[aria-label=Changes]')`, 'drop preview', 15000); await H.sleep(500);
  const m2 = await marks();
  r.check('a step the AI would delete is shown struck through and marked removed', m2.removed >= 1 && await js(`!!document.querySelector('[aria-label=Preview] [data-diff=removed]') && getComputedStyle(document.querySelector('[aria-label=Preview] [data-diff=removed] b')).textDecorationLine.includes('line-through')`));
  r.check('the list says it goes to Removed and can be restored', await js(`document.querySelector('[aria-label=Changes]').textContent.includes('goes to Removed')`));
  await H.dlg('Accept'); await until(`!${dlg}`, 'accepted drop'); await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved again');
  const g = file();
  r.check('the deleted step is in Removed in the file and the flow is valid', g.removed.some((x) => x.kind === 'step' && x.entry.title === 'Manager sign-off') && flowOf(g).steps.every((s) => s.title !== 'Manager sign-off') && validate(g).length === 0);
  await H.click('Removed'); await until(`document.body.innerText.includes('Manager sign-off')`, 'removed view');
  r.check('the Removed screen lists it so it can be restored', await js(`document.body.innerText.includes('Manager sign-off')`));

  await H.click('Business flows'); await until(`!!${field('Ask AI instruction')}`, 'flows'); mode = 'bad';
  const before = await mainSteps(); await ask('do something'); await until(`!!document.querySelector('[role=dialog][aria-label="Ask AI"] [role=alert]')`, 'error', 15000);
  r.check('an answer that is not a flow shows a plain error and changes nothing', await js(`${dlg}.textContent.includes('Nothing was changed')`) && (await mainSteps()) === before);
  await H.dlg('Close');
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot ask-preview):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); stub.close(); }
process.exit(r.failed ? 1 : 0);
