// Generate a flow from a brief in a real browser, against a fake provider (no real AI, no key): the privacy notice, a preview that changes nothing,
// Discard, Accept, Undo, Save, what the AI was (and was not) sent, and a bad answer that leaves the flow alone. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-ai-generate.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
demo.departments[0].members = [{ id: 'm_secret', name: 'Secret Person', role: 'Lead', email: 'secret.person@example.com' }];
const otherStep = demo.flows.find((f) => f.title === 'Quote approval').steps.at(-1).title, sheet = demo.sheets[0].name, dept = demo.departments[0].name;
const KEY = 'sk-e2e-generate', GOOD = { chart: 'swimlane', reason: 'Two teams hand the quote over.', teams: ['Sales', 'Finance'], steps: [
  { team: 'Sales', title: 'Send the quote', kind: 'start', sheet: sheet.toUpperCase() },
  { team: 'Finance', title: 'Is the price right?', kind: 'decision', waits: [{ on: 0, msg: 'quote' }] },
  { team: 'Sales', title: 'Send the order', waits: [{ on: 1, msg: 'Yes' }], sheet: 'Mystery Sheet' },
  { team: 'Sales', title: 'Rework the quote', waits: [{ on: 1, msg: 'No' }] }],
  notes: [{ text: 'I assumed Finance approves prices', step: 1 }, { text: 'Who sets the price list?', step: null }] };
let mode = 'good'; const seen = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen.push(b); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: mode === 'good' ? JSON.stringify(GOOD) : 'sorry, I cannot do that' }] })); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + stub.address().port, r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until } = H, q = JSON.stringify;
const cfg = path.join(H.sandbox, 'data', '.ai.json'), file = (t) => H.readJson('data/demo.json').flows.find((f) => f.title === t);
const field = (l) => `document.querySelector('[aria-label=${q(l)}]')`, dlg = `document.querySelector('[role=dialog][aria-label="Generate flow"]')`;
const fill = async (l, v) => { await js(`${field(l)}.focus(), true`); await H.type(l, v); await js(`${field(l)}.blur(), true`); };
const pickFlow = async (t) => { await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === ${q(t)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === ${q(t)}).value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await until(`!!${field('Brief')}`, 'details of ' + t); await H.sleep(300); };
const newFlow = async (t) => { await H.type('New flow name', t); await H.click('New flow'); await until(`!!${field('Brief')} && document.querySelector('select').selectedOptions[0].text === ${q(t)}`, 'flow ' + t); await H.sleep(300); };
const hint = () => js(`document.querySelector('[aria-label="Generate hint"]')?.textContent || ''`), btn = () => js(`document.querySelector('[aria-label="Generate flow"]').disabled`);
const nodes = () => js(`document.querySelectorAll('[aria-label=Preview] .react-flow__node-step').length`), mainSteps = () => js(`[...document.querySelectorAll('.react-flow__node-step')].filter((e) => !e.closest('[aria-label=Preview]')).length`);
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4 && !!${field('Brief')}`, 'flow drawn');
  await pickFlow('Quote approval'); await H.sleep(500);
  r.check('a flow that already has steps cannot be generated over', await btn() && (await hint()).includes('empty flow') || (await hint()).includes('AI is off'));
  await newFlow('Quotes');
  r.check('with AI off the button is disabled and says where to set it up', await btn() && (await hint()).includes('AI is off'));

  fs.writeFileSync(cfg, JSON.stringify({ provider: 'claude', apiKey: KEY, baseUrl: BASE }));
  await pickFlow('Quote approval'); await pickFlow('Quotes');
  r.check('with AI on but no brief the button asks for one first', await btn() && (await hint()).includes('brief'));
  await fill('Brief', `Quotes wait for Finance. Ask boss@example.com or see ticket T20261112.001.`); await fill('Draft', '- Sales sends the quote\n- Finance checks the price');
  r.check('with a brief the button is enabled and names the provider', !(await btn()) && (await js(`document.querySelector('[aria-label="Generate flow"]').textContent`)).includes('Claude'));

  await H.click('Generate flow'); await until(`!!${dlg}`, 'dialog');
  r.check('the first time, a notice names the provider and says what is never sent, before anything is sent', await js(`(() => { const t = document.querySelector('[aria-label="AI notice"]').textContent; return t.includes("Claude's servers") && t.includes('emails'); })()`) && seen.length === 0);
  await H.dlg('Send to Claude'); await until(`!!document.querySelector('[aria-label=Preview]') && ${dlg}.textContent.includes('AI suggests')`, 'preview', 15000);
  r.check('the preview names the chart type and the reason, and draws the steps', await js(`${dlg}.textContent.includes('Two teams hand the quote over')`) && (await nodes()) === 4);
  r.check('a sheet that is not on the map is flagged, and a known one is not', await js(`document.querySelector('[aria-label="Unknown sheets"]').textContent.includes('Mystery Sheet') && !document.querySelector('[aria-label="Unknown sheets"]').textContent.includes(${q(sheet)})`));
  const sent = seen.join('');
  r.check('the AI was sent the brief, the department and the sheet names', sent.includes('Quotes wait for Finance') && sent.includes(dept) && sent.includes(sheet));
  r.check('the AI was not sent emails, ticket ids, member names or other flows', !/example\.com|T20261112|Secret Person|secret\.person/.test(sent) && !sent.includes(otherStep));
  r.check('the key is not in the page', !(await js('document.documentElement.outerHTML')).includes(KEY));
  await H.shot('generate-preview');
  r.check('the preview changed nothing: the flow behind it is still empty', (await mainSteps()) === 0);

  await H.dlg('Discard'); await until(`!${dlg}`, 'closed');
  r.check('Discard closes the preview and leaves the flow empty', (await mainSteps()) === 0);

  await H.click('Generate flow'); await until(`!!${dlg}`, 'dialog again');
  r.check('the notice is not shown a second time; the request goes straight out', !(await js(`!!document.querySelector('[aria-label="AI notice"]')`)));
  await until(`!!document.querySelector('[aria-label=Preview]')`, 'second preview', 15000); await H.dlg('Accept'); await until(`!${dlg}`, 'accepted');
  await until(`document.querySelectorAll('.react-flow__node-step').length === 4`, 'steps drawn');
  r.check('Accept draws the steps, decision diamond and notes on the real canvas', (await mainSteps()) === 4 && await js(`!![...document.querySelectorAll('.react-flow__node-step [data-kind=decision]')].length`) && await js(`document.body.innerText.includes('I assumed Finance approves prices')`));
  r.check('the Yes and No branches that land in the same lane are stacked, so no box hides another', await js(`(() => { const B = [...document.querySelectorAll('.react-flow__node-step')].filter((e) => !e.closest('[aria-label=Preview]')).map((e) => e.getBoundingClientRect()); return B.length === 4 && !B.some((a, i) => B.some((b, j) => j > i && a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1)); })()`));
  r.check('the Yes and No labels are on the decision arrows', await js(`(() => { const t = [...document.querySelectorAll('.react-flow__edge')].map((e) => e.textContent.trim()); return t.includes('Yes') && t.includes('No'); })()`));
  await H.click('Undo'); await until(`document.querySelectorAll('.react-flow__node-step').length === 0`, 'undone');
  r.check('one Undo takes the whole generated flow back', (await mainSteps()) === 0);
  await H.click('Redo'); await until(`document.querySelectorAll('.react-flow__node-step').length === 4`, 'redone');
  await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
  const f = file('Quotes'), all = H.readJson('data/demo.json');
  r.check('Save writes the steps, shapes, sheet links, notes and keeps the brief; the file is valid', f.steps.length === 4 && f.steps[1].kind === 'decision' && f.steps[0].sheetId === demo.sheets[0].id && f.steps[2].sheetName === 'Mystery Sheet' && f.notes.length === 2 && f.brief.includes('Quotes wait') && validate(all).length === 0);
  r.check('the other flows are untouched', JSON.stringify(file('Quote approval')) === JSON.stringify(demo.flows.find((x) => x.title === 'Quote approval')));
  r.check('Generate is now off for this flow, because it has steps', await btn() && (await hint()).includes('empty flow'));

  mode = 'bad'; await newFlow('Second try'); await fill('Brief', 'Anything'); await H.click('Generate flow'); await until(`!!document.querySelector('[role=dialog][aria-label="Generate flow"] [role=alert]')`, 'error', 15000);
  r.check('an answer that is not a flow shows a plain error and changes nothing', await js(`${dlg}.textContent.includes('Nothing was changed')`) && (await mainSteps()) === 0);
  await H.dlg('Close');
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot generate-preview):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); stub.close(); }
process.exit(r.failed ? 1 : 0);
