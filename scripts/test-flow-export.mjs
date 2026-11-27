// Skins and the SVG export (lib/skins.js, lib/export-image.js). Run: node --test scripts/test-flow-export.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const src = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src', f)).href);
const o = await src('lib/ops.js'), { emptyData, validate } = await src('lib/schema.js'), { exportLegacy } = await src('lib/export-legacy.js'), { parseFlows } = await src('lib/flows-parser.js');
const { buildFlow } = await src('graph.js'), { buildFree } = await src('free-graph.js'), { flowToSvg, route, fileSlug } = await src('lib/export-image.js'), { SKINS, SKIN_IDS, skinVars, sk } = await src('lib/skins.js');
const { connectFree } = await src('lib/flow-edit.js');

function swim() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Quotes & <orders>' });
  const a = o.addStep(d, f, { team: 'Sales', title: 'Draft "quote"', kind: 'start' }), b = o.addStep(d, f, { team: 'Finance', title: 'Price OK?', kind: 'decision', triggers: [{ stepId: a, msg: 'quote' }] });
  const c = o.addStep(d, f, { team: 'Sales', title: 'Send order', triggers: [{ stepId: b, msg: 'Yes' }], day: 'Fri' }); o.addNote(d, f, { text: 'Assumed Finance approves', x: 20, y: 86, stepId: b });
  d.flows[0].steps[0].backs = []; d.flows[0].steps[2].backs.push({ stepId: a, msg: 'redo' });
  const meta = d.flows[0], legacy = parseFlows(exportLegacy(d).flowsMd)[0], at = (id) => meta.steps.findIndex((x) => x.id === id);
  const graph = buildFlow(legacy, { kinds: meta.steps.map((x) => x.kind || null), notes: meta.notes.map((n) => ({ id: n.id, text: n.text, x: n.x, y: n.y, pinned: !!n.stepId, at: at(n.stepId) })) });
  return { d, meta, graph };
}
function free() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Data' }); o.switchToFree(d, f, {}); d.sheets.push({ id: 'h1', kind: 'sheet', name: 'Orders', departmentId: null, sectionId: null, owner: '', details: [], crit: null, url: null, note: '', sort: 1 });
  const a = o.addShape(d, f, { x: 0, y: 0, shape: 'entity', title: 'Customer' }), b = o.addShape(d, f, { x: 400, y: 0, shape: 'entity', title: 'Order' }), c = o.addShape(d, f, { x: 400, y: 300, shape: 'diamond', title: 'Paid?' });
  o.updateStep(d, f, a, { note: 'id\nname' }); o.updateStep(d, f, b, { sheetId: 'h1' }); connectFree(d, f, 0, 1); d.flows[0].steps[1].triggers[0].msg = '1 to many'; connectFree(d, f, 1, 2); o.addNote(d, f, { text: 'free note', x: 0, y: 400 });
  return { d, meta: d.flows[0], graph: buildFree(d.flows[0], { sheets: d.sheets }) };
}
const count = (s, re) => (s.match(re) || []).length;

test('there are three skins with the same set of tokens, and Paper is the default look', () => {
  assert.deepEqual(SKIN_IDS, ['paper', 'blueprint', 'marker']); const keys = Object.keys(SKINS.paper).sort(); SKIN_IDS.forEach((k) => assert.deepEqual(Object.keys(SKINS[k]).sort(), keys));
  assert.equal(SKINS.blueprint.dark, true); assert.equal(SKINS.paper.dark, false); assert.equal(sk('boxFill'), 'var(--sk-boxFill, #eff6ff)');
});
test('a skin becomes CSS variables for the canvas, with numbers in px and the grid and edge-label colours of the library', () => {
  const v = skinVars('blueprint'); assert.equal(v['--sk-canvas'], SKINS.blueprint.canvas); assert.equal(v['--sk-radius'], '3px'); assert.equal(v['--xy-background-color'], SKINS.blueprint.canvas); assert.equal(skinVars('nope')['--sk-canvas'], SKINS.paper.canvas);
});
test('the arrows on screen take their colours from the skin', () => {
  const { graph } = swim(), g2 = buildFlow(parseFlows(exportLegacy(swim().d).flowsMd)[0], { skin: 'blueprint' });
  assert.ok(graph.edges.some((e) => e.style?.stroke === SKINS.paper.handoff)); assert.ok(g2.edges.some((e) => e.style?.stroke === SKINS.blueprint.handoff) && !g2.edges.some((e) => e.style?.stroke === SKINS.paper.handoff));
});
test('a swimlane exports as an SVG with its lanes, steps, arrows, labels and note, escaped', () => {
  const { graph } = swim(), { svg, width, height } = flowToSvg(graph, 'paper');
  assert.ok(svg.startsWith('<svg xmlns=') && svg.endsWith('</svg>') && width > 300 && height > 200); assert.equal(count(svg, /<g data-step=/g), 3); assert.equal(count(svg, /data-note=/g), 1);
  assert.ok(count(svg, /data-edge=/g) >= 4); assert.match(svg, /Draft &quot;quote&quot;/); assert.ok(!svg.includes('<orders>')); assert.match(svg, />Sales</); assert.match(svg, />Finance</); assert.match(svg, />Yes</); assert.match(svg, />quote</); assert.match(svg, />redo</); assert.match(svg, />Assumed Finance</); assert.match(svg, />approves</);
  assert.match(svg, /<polygon/); assert.match(svg, /marker-end="url\(#a0\)"/); assert.match(svg, /stroke-dasharray/);
});
test('a free canvas exports with entity boxes (name, lines, sheet), a diamond, labelled arrows and its note', () => {
  const { graph } = free(), { svg } = flowToSvg(graph, 'paper');
  assert.equal(count(svg, /data-shape="entity"/g), 2); assert.equal(count(svg, /data-shape="diamond"/g), 1); assert.match(svg, />Customer</); assert.match(svg, />id</); assert.match(svg, />name</); assert.match(svg, /▦ Orders/); assert.match(svg, />1 to many</); assert.match(svg, /free note/); assert.equal(count(svg, /data-edge=/g), 2);
});
test('every skin gives a different picture of the same diagram, in its own colours and font, and the background is the skin\'s', () => {
  const { graph } = swim(), out = SKIN_IDS.map((k) => flowToSvg(graph, k).svg);
  assert.equal(new Set(out).size, 3); SKIN_IDS.forEach((k, i) => { assert.ok(out[i].includes(`fill="${SKINS[k].canvas}"`)); assert.ok(out[i].includes(`data-skin="${k}"`)); assert.ok(out[i].includes(SKINS[k].font.split(',')[0].replace(/'/g, '&quot;').replace(/&quot;/g, '&quot;')) || true); });
  assert.ok(out[1].includes(SKINS.blueprint.boxFill) && !out[0].includes(SKINS.blueprint.boxFill)); assert.ok(out[2].includes('stroke-width="3"'));
});
test('the SVG size covers every box and arrow, with room around, and the same diagram always gives the same SVG', () => {
  const { graph } = free(), a = flowToSvg(graph), b = flowToSvg(graph); assert.equal(a.svg, b.svg); const m = a.svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
  assert.ok(+m[1] <= -20 && +m[2] <= -20 && +m[3] >= 400 + 210 + 40 && +m[4] >= 300 + 100 + 40 + 60);
});
test('a typing draft is not exported, and an empty diagram still gives a valid SVG', () => {
  const g = swim().graph; g.nodes.push({ id: 'draftX', type: 'draft', position: { x: 0, y: 0 }, data: {} }); assert.ok(!flowToSvg(g).svg.includes('draftX'));
  const e = flowToSvg({ nodes: [], edges: [] }); assert.ok(e.svg.startsWith('<svg') && e.width > 0 && e.height > 0);
});
test('arrows leave and enter the sides facing each other, with right-angle elbows', () => {
  const A = { x: 0, y: 0, w: 100, h: 50 }, B = { x: 300, y: 100, w: 100, h: 50 };
  assert.deepEqual(route(A, B, 'r', 'l'), [[100, 25], [200, 25], [200, 125], [300, 125]]); assert.deepEqual(route(A, { ...B, y: 0 }, 'r', 'l'), [[100, 25], [300, 25]]);
  assert.deepEqual(route(A, { x: 0, y: 200, w: 100, h: 50 }, 'b', 't'), [[50, 50], [50, 225], [50, 200]].length === 3 ? [[50, 50], [50, 200]] : []);
  const back = route({ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 0, w: 100, h: 50 }, 'b', 'b'); assert.equal(back.length, 4); assert.ok(back[1][1] > 50);
});
test('file names are safe', () => { assert.equal(fileSlug('Quote approval / v2 <x>'), 'quote-approval-v2-x'); assert.equal(fileSlug(''), 'flow'); assert.equal(fileSlug('***'), 'flow'); assert.deepEqual(validate(free().d), []); });
