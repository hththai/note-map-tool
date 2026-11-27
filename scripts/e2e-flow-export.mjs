// Skins and image export in a real browser, with the computer set to dark mode: the canvas stays light in Paper (it used to turn black), Blueprint and Marker restyle
// the diagram without touching the data, and Export SVG / PNG give an image of the same diagram in the same skin. Throwaway sandbox.
// Run: npm --prefix app run build && node scripts/e2e-flow-export.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H, q = JSON.stringify, TITLE = 'Quote approval', steps = demo.flows.find((f) => f.title === TITLE).steps.map((s) => s.title);
const count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`);
const bg = () => js(`getComputedStyle(document.querySelector('.react-flow')).backgroundColor`), pick = (id) => js(`(() => { const s = document.querySelector('select[aria-label=Skin]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${q(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const pickFlow = async (t) => { await js(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text === ${q(t)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.text === ${q(t)}).value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(700); };
const hook = () => js(`(() => { window.__blobs = []; window.__dl = []; const oc = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return oc.call(URL, b); }; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); }; return true; })()`);
const exportAs = async (type) => { const n = await js('window.__blobs.length'); await H.click(type === 'md' ? 'Export Mermaid' : 'Export ' + type.toUpperCase()); await until(`window.__blobs.length === ${n + 1}`, 'export ' + type, 10000); };
const svgText = () => js(`window.__blobs.at(-1).text()`);
try {
  await H.emulate({ 'prefers-color-scheme': 'dark' });
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'flows drawn'); await pickFlow(TITLE); await until(`document.querySelectorAll('.react-flow__node-step').length === 3`, 'Quote approval'); await sleep(500);
  r.check('with the computer in dark mode the flow canvas is white in Paper, not black', (await bg()) === 'rgb(255, 255, 255)', await bg());
  await H.click('Overview'); await until(`document.querySelectorAll('.react-flow__node-sheet').length > 3`, 'map drawn'); await sleep(400);
  r.check('the map canvas is no longer black in dark mode either (it is clear, on the white page)', ['rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'].includes(await bg()), await bg());
  await H.click('Business flows'); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'back'); await pickFlow(TITLE); await sleep(400);

  r.check('the skin picker offers Paper, Blueprint and Marker, and the page offers Export PNG and Export SVG', await js(`[...document.querySelector('select[aria-label=Skin]').options].map((o) => o.text).join() === 'Paper,Blueprint,Marker' && ['Export PNG', 'Export SVG'].every((l) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === l))`));
  await pick('blueprint'); await sleep(500);
  r.check('Blueprint turns the canvas dark blue and the boxes blue, with a monospace font', (await bg()) === 'rgb(11, 37, 69)' && await js(`getComputedStyle(document.querySelector('.react-flow__node-step [style*="font-family"]')).fontFamily.includes('Plex Mono')`));
  r.check('choosing a skin changes nothing in the data: there is nothing to save', (await H.status()).includes('Nothing to save'));
  await H.shot('skin-blueprint');
  await pick('marker'); await sleep(400);
  r.check('Marker gives a warm paper canvas and a hand-written font', (await bg()) === 'rgb(255, 251, 235)' && await js(`/comic|marker/i.test(getComputedStyle(document.querySelector('.react-flow__node-step [style*="font-family"]')).fontFamily)`));
  await pick('blueprint'); await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'reloaded'); await pickFlow(TITLE); await sleep(500);
  r.check('the chosen skin is remembered in this browser after a reload', (await js(`document.querySelector('select[aria-label=Skin]').value`)) === 'blueprint' && (await bg()) === 'rgb(11, 37, 69)');

  // export
  await hook(); await exportAs('svg'); const svg = await svgText(), dl = await js('window.__dl.at(-1)');
  r.check('Export SVG saves a file named after the flow', dl === 'quote-approval.svg', dl);
  r.check('the SVG is the same diagram: every step title, the lanes, the arrows and the skin', steps.every((t) => svg.includes(t.split(' ')[0].replace(/&/g, '&amp;'))) && (svg.match(/data-step=/g) || []).length === 3 && (svg.match(/data-edge=/g) || []).length === (await count('.react-flow__edge')) && svg.includes('data-skin="blueprint"') && svg.includes('#0b2545'), `steps ${(svg.match(/data-step=/g) || []).length}, edges svg ${(svg.match(/data-edge=/g) || []).length} vs page ${await count('.react-flow__edge')}`);
  await pick('paper'); await sleep(400); await exportAs('svg'); const paper = await svgText();
  r.check('in Paper the same diagram is exported with white background and different colours', paper.includes('data-skin="paper"') && paper.includes('fill="#ffffff"') && paper !== svg);
  await exportAs('png'); const info = await js(`(async () => { const b = window.__blobs.at(-1); const bmp = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) ink++; return { type: b.type, size: b.size, w: bmp.width, h: bmp.height, ink: ink / (c.width * c.height), name: window.__dl.at(-1) }; })()`);
  r.check('Export PNG makes a real picture at twice the size, named after the flow, with the diagram drawn on it', info.type === 'image/png' && info.name === 'quote-approval.png' && info.w > 600 && info.h > 300 && info.ink > 0.03 && info.size > 4000, JSON.stringify(info));

  // the Flow document with a Mermaid diagram
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 3`, 'reloaded again'); await pickFlow(TITLE); await sleep(400); await hook();
  await exportAs('md'); const md = await svgText(), mdName = await js('window.__dl.at(-1)');
  r.check('Export Mermaid saves a Markdown document named after the flow, with a Mermaid diagram of it', mdName === 'quote-approval.md' && md.startsWith('# Quote approval') && md.includes('```mermaid\nflowchart LR') && md.includes('subgraph L1["Sales"]') && md.includes('-->|"Approved"|') && steps.every((t) => md.includes(t.split(' ')[0])));
  await H.click('All flows (.md)'); await until(`window.__blobs.length === 2`, 'all flows'); const all = await svgText();
  r.check('All flows (.md) is one document with every flow of the map', all.startsWith('# Business flows') && demo.flows.every((f) => all.includes('## ' + f.title)) && (all.match(/```mermaid/g) || []).length === demo.flows.length, (await js('window.__dl.at(-1)')));

  // a free canvas exports too
  await H.click('Switch to free canvas'); await until(`!!document.querySelector('[role=dialog]')`, 'dialog'); await H.dlg('Switch to free canvas'); await until(`!!document.querySelector('[aria-label=Layout]')`, 'free'); await sleep(500);
  await exportAs('svg'); const free = await svgText();
  r.check('a free canvas exports its boxes and arrows too', (free.match(/data-free=/g) || []).length === 3 && (free.match(/data-edge=/g) || []).length === (await count('.react-flow__edge')));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('sandbox (screenshot skin-blueprint):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
