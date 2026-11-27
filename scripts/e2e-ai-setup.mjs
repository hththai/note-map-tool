// The AI settings panel in a real browser, against a fake provider (no real AI, no real key): off with a how-to, on with the provider's name and
// the privacy notice, Test connection works, a wrong key is explained, and the key never reaches the page. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-ai-setup.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const KEY = 'sk-e2e-secret-98765', seen = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const key = req.headers['x-api-key']; seen.push({ url: req.url, key }); res.writeHead(key === KEY ? 200 : 401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] })); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + stub.address().port, r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until } = H;
const cfg = path.join(H.sandbox, 'data', '.ai.json'), dlg = `document.querySelector('[role=dialog][aria-label=AI]')`;
const open = async () => { await H.click('AI'); await until(`!!${dlg} && !${dlg}.textContent.includes('Checking')`, 'AI panel'); };
const close = async () => { await H.dlg('Close'); await until(`!${dlg}`, 'panel closed'); };
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4`, 'flow drawn');

  await open();
  r.check('with no config the panel says AI is off and shows how to set it up', await js(`${dlg}.textContent.includes('Off.') && ${dlg}.textContent.includes('data/.ai.json') && ${dlg}.textContent.includes('"provider"')`));
  r.check('there is no Test connection button while AI is off', await js(`![...${dlg}.querySelectorAll('button')].some((b) => b.textContent.includes('Test connection'))`));
  await close();

  fs.writeFileSync(cfg, JSON.stringify({ provider: 'claude', apiKey: KEY, baseUrl: BASE }));
  await open();
  r.check('with a config the panel says AI is on and names the provider', await js(`${dlg}.textContent.includes('On.') && ${dlg}.textContent.includes('Claude')`));
  r.check('the privacy notice names the provider and says what is never sent', await js(`(() => { const t = document.querySelector('[aria-label="AI notice"]').textContent; return t.includes("Claude's servers") && t.includes('emails') && t.includes('tickets'); })()`));
  await H.shot('ai-panel');
  await H.dlg('Test connection'); await until(`${dlg}.textContent.includes('Works')`, 'test passed');
  r.check('Test connection reaches the provider with the key and says it works', seen.length === 1 && seen[0].url === '/v1/messages' && seen[0].key === KEY);
  r.check('the key is nowhere in the page', !(await js(`document.documentElement.outerHTML`)).includes(KEY));
  r.check('the page cannot read the config file', await js(`fetch('/data/.ai.json').then((x) => x.status)`) === 404);
  r.check('the page cannot see the file in the list of maps', !(await js(`fetch('/api/data').then((x) => x.text())`)).includes('.ai.json'));
  await close();

  fs.writeFileSync(cfg, JSON.stringify({ provider: 'claude', apiKey: 'wrong-key', baseUrl: BASE }));
  await open(); await H.dlg('Test connection'); await until(`!!${dlg}.querySelector('[role=alert]')`, 'error shown');
  r.check('a wrong key is explained in plain words, without echoing it', await js(`(() => { const t = ${dlg}.querySelector('[role=alert]').textContent; return t.includes('refused') && !t.includes('wrong-key'); })()`));
  await close();

  fs.writeFileSync(cfg, JSON.stringify({ provider: 'gpt', apiKey: KEY }));
  await open();
  r.check('a config naming an unknown provider is off, and says what to fix', await js(`${dlg}.textContent.includes('Off.') && ${dlg}.textContent.includes('"provider" must be')`));
  await H.key('Escape'); await js(`${dlg}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`); await until(`!${dlg}`, 'Escape closes');
  r.check('Escape closes the panel and the flow is untouched', (await js(`document.querySelectorAll('.react-flow__node-step').length`)) >= 4 && !(await H.status()).includes('Unsaved'));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot ai-panel):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); stub.close(); }
process.exit(r.failed ? 1 : 0);
