// Checks that the Mermaid the app exports is accepted by the real Mermaid parser (loaded from a CDN, so it needs a network and is not part of `npm run verify`).
// It drew the diagrams of the demo flows plus a swimlane, a mixed free canvas and an ER diagram, in headless Chrome. Run: node scripts/check-mermaid.mjs   (CHROME=/path/to/chrome if needed)
import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os'; import { pathToFileURL } from 'node:url';
import { harness } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const o = await lib('ops.js'), { emptyData } = await lib('schema.js'), { connectFree } = await lib('flow-edit.js'), { flowMermaid } = await lib('flow-mermaid.js'), { importLegacy } = await lib('import-legacy.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const samples = demo.flows.map((f) => ({ name: 'demo ' + f.title, text: flowMermaid(f).join('\n') }));
const d = emptyData('T'), f = o.addFlow(d, { title: 'Q' }); const a = o.addStep(d, f, { team: 'Sales', title: 'Draft "quote" <b>', kind: 'start' }), b = o.addStep(d, f, { team: 'Finance', title: 'Price OK?\nline 2', kind: 'decision', triggers: [{ stepId: a, msg: 'quote' }] }), c = o.addStep(d, f, { team: 'Sales', title: 'Send', triggers: [{ stepId: b, msg: 'Yes' }] }), e = o.addStep(d, f, { team: 'Sales', title: 'Rework', triggers: [{ stepId: b, msg: 'No' }] });
d.flows[0].steps[3].backs.push({ stepId: a, msg: 'redo' }); o.addNote(d, f, { text: 'a note with %% and "quotes"', x: 1, y: 1, stepId: b });
samples.push({ name: 'swimlane', text: flowMermaid(d.flows[0]).join('\n') });
const g = emptyData('T'), h = o.addFlow(g, { title: 'F' }); o.switchToFree(g, h, {}); ['rect', 'rounded', 'pill', 'diamond', 'entity'].forEach((s, i) => o.addShape(g, h, { shape: s, title: 'Box ' + s })); o.updateStep(g, h, g.flows[0].steps[4].id, { note: 'id\nname' }); connectFree(g, h, 3, 0); connectFree(g, h, 0, 3); connectFree(g, h, 3, 4);
samples.push({ name: 'free mixed', text: flowMermaid(g.flows[0]).join('\n') });
const er = emptyData('T'), ef = o.addFlow(er, { title: 'E' }); o.switchToFree(er, ef, {}); [['Customer', 'id\nfull name\nemail address'], ['Order', 'id\ntotal'], ['Order line', ''], ['Khách hàng', 'tên']].forEach(([t, n]) => { const i = o.addShape(er, ef, { shape: 'entity', title: t }); if (n) o.updateStep(er, ef, i, { note: n }); });
connectFree(er, ef, 0, 1); er.flows[0].steps[1].triggers[0].msg = '1 to many'; connectFree(er, ef, 1, 2); er.flows[0].steps[2].triggers[0].msg = 'many to 1'; connectFree(er, ef, 2, 3);
samples.push({ name: 'er', text: flowMermaid(er.flows[0]).join('\n') });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-check-')), page = path.join(dir, 'page.html');
fs.writeFileSync(page, `<!doctype html><meta charset=utf-8><script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script><script>window.SAMPLES=${JSON.stringify(samples)};</script><body>ok</body>`);
const H = await harness({ data: {} }); let bad = 0;
try {
  await H.goto('file://' + page); await H.until('typeof mermaid !== "undefined"', 'mermaid loaded (needs a network)', 20000);
  const out = await H.js(`(async () => { mermaid.initialize({ startOnLoad: false }); const r = []; for (const s of window.SAMPLES) { try { await mermaid.parse(s.text); await mermaid.render('m' + r.length, s.text); r.push('OK   ' + s.name); } catch (e) { r.push('FAIL ' + s.name + ': ' + String(e.message || e).slice(0, 300)); } } return r.join('\\n'); })()`);
  console.log(out); bad = out.includes('FAIL') ? 1 : 0;
} finally { H.finish(); }
process.exit(bad);
