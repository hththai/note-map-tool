// The free canvas: a flow whose steps are boxes placed by hand (lib/ops.js addShape, placeShape, switchToFree; lib/flow-edit.js connectFree). Run: node --test scripts/test-flow-free.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), { validate, emptyData, upgrade } = await lib('schema.js'), { connectFree, removeArrow } = await lib('flow-edit.js'), { exportLegacy } = await lib('export-legacy.js'), { parseFlows } = await lib('flows-parser.js');

function swim() { // Draft (Sales) -> Check (Finance, waits on Draft: "draft") -> Send (Sales, nothing of its own: follows Check) ; Send waits nothing
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Quotes' });
  const a = o.addStep(d, f, { team: 'Sales', title: 'Draft' }), b = o.addStep(d, f, { team: 'Finance', title: 'Check', triggers: [{ stepId: a, msg: 'draft' }] }), c = o.addStep(d, f, { team: 'Sales', title: 'Send' });
  d.flows[0].steps.push(); return { d, f, a, b, c };
}
const POS = (ids) => Object.fromEntries(ids.map((id, i) => [id, { x: 100 + i * 220, y: 50, w: 180, h: 74 }]));
function free() { const d = emptyData('T'), f = o.addFlow(d, { title: 'Free' }); o.switchToFree(d, f, {}); return { d, f }; }

test('a flow is a swimlane until it is switched, and an old file is valid and unchanged', () => {
  const { d } = swim(); assert.equal(d.flows[0].layout, undefined); assert.deepEqual(validate(d), []); assert.deepEqual(validate(upgrade(structuredClone(d)).data), []);
});
test('switching keeps every step and its place, gives each box a size and shape, and the file stays valid', () => {
  const { d, f, a, b, c } = swim(); o.switchToFree(d, f, POS([a, b, c])); const fl = d.flows[0];
  assert.equal(fl.layout, 'free'); assert.deepEqual(fl.steps.map((s) => s.title), ['Draft', 'Check', 'Send']); assert.deepEqual(fl.steps.map((s) => [s.x, s.y, s.w, s.h, s.shape]), [[100, 50, 180, 74, 'rounded'], [320, 50, 180, 74, 'rounded'], [540, 50, 180, 74, 'rounded']]);
  assert.deepEqual(validate(d), []);
});
test('every arrow the swimlane drew becomes a real arrow, including the automatic one, so the picture does not change', () => {
  const { d, f, a, b, c } = swim(); o.switchToFree(d, f, POS([a, b, c])); const [A, B, C] = d.flows[0].steps;
  assert.deepEqual(A.triggers, []); assert.equal(A.standalone, true); assert.deepEqual(B.triggers, [{ stepId: a, msg: 'draft' }]); assert.equal(B.standalone, undefined); assert.deepEqual(C.triggers, [{ stepId: b, msg: '' }]);
});
test('an arrow from a team ("waits for Finance") is turned into an arrow from that team\'s nearest earlier box', () => {
  const { d, f, a, b, c } = swim(); d.flows[0].steps[2].triggers = [{ team: 'Finance', msg: 'Approved' }]; o.switchToFree(d, f, POS([a, b, c]));
  assert.deepEqual(d.flows[0].steps[2].triggers, [{ stepId: b, msg: 'Approved' }]);
});
test('lanes, sort numbers and the team of each step are kept; there is no way back and no second switch', () => {
  const { d, f, a, b, c } = swim(); const sorts = d.flows[0].steps.map((s) => s.sort); o.switchToFree(d, f, POS([a, b, c]));
  assert.deepEqual(d.flows[0].steps.map((s) => s.sort), sorts); assert.deepEqual(d.flows[0].steps.map((s) => s.team), ['Sales', 'Finance', 'Sales']); assert.throws(() => o.switchToFree(d, f, POS([a, b, c])), /already a free canvas/);
});
test('a switch with a step that has no place changes nothing', () => {
  const { d, f, a, b } = swim(); const before = JSON.stringify(d); assert.throws(() => o.switchToFree(d, f, POS([a, b])), /no place/); assert.equal(JSON.stringify(d), before);
});
test('a step waiting in Removed can be restored onto the free canvas', () => {
  const { d, f, a, b, c } = swim(); o.removeStep(d, f, b); o.switchToFree(d, f, POS([a, c])); assert.deepEqual(validate(d), []);
  o.restore(d, d.removed.at(-1).id); assert.equal(d.flows[0].steps.length, 3); assert.deepEqual(validate(d), []);
});
test('a box is added at a place with a size, in order, and only to a free flow', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { x: 10.4, y: 20.6, title: 'Start here' }), b = o.addShape(d, f, { x: 300, y: 20, w: 120, h: 50, shape: 'rect', title: 'Next' });
  const [A, B] = d.flows[0].steps; assert.deepEqual([A.id, A.title, A.x, A.y, A.w, A.h, A.shape, A.standalone], [a, 'Start here', 10, 21, 180, 74, 'rounded', true]); assert.deepEqual([B.id, B.w, B.h, B.shape], [b, 120, 50, 'rect']);
  assert.ok(A.sort < B.sort); assert.deepEqual(validate(d), []); const s = swim(); assert.throws(() => o.addShape(s.d, s.f, {}), /free-canvas/);
});
test('a box can be moved and resized, and cannot be made too small', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { x: 0, y: 0 }); o.placeShape(d, f, a, { x: 55.5, y: 66 }); const s = d.flows[0].steps[0];
  assert.deepEqual([s.x, s.y, s.w, s.h], [56, 66, 180, 74]); o.placeShape(d, f, a, { w: 5, h: 5 }); assert.deepEqual([s.w, s.h], [60, 40]); assert.deepEqual(validate(d), []);
});
test('an arrow can join any two boxes in either direction, not twice, not to itself, and it can be taken away', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { x: 0, y: 0 }), b = o.addShape(d, f, { x: 300, y: 0 });
  assert.equal(connectFree(d, f, 1, 0), true); assert.deepEqual(d.flows[0].steps[0].triggers, [{ stepId: d.flows[0].steps[1].id, msg: '' }]); assert.equal(d.flows[0].steps[0].standalone, undefined);
  assert.equal(connectFree(d, f, 1, 0), false); assert.equal(connectFree(d, f, 0, 0), false); assert.equal(connectFree(d, f, 0, 1), true);
  removeArrow(d, f, { kind: 'trigger', to: 0, tIdx: 0 }); assert.deepEqual(d.flows[0].steps[0].triggers, []); assert.equal(d.flows[0].steps[0].standalone, true); assert.deepEqual(validate(d), []); assert.ok(a && b);
});
test('deleting a box sends it to Removed with its place, and restoring puts it back exactly', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { x: 40, y: 50, w: 100, h: 60, shape: 'rect', title: 'One' }); o.addShape(d, f, { x: 300, y: 50, title: 'Two' });
  const copy = structuredClone(d.flows[0].steps[0]); o.removeStep(d, f, a); assert.deepEqual(d.flows[0].steps.map((s) => s.title), ['Two']); assert.deepEqual(validate(d), []);
  o.restore(d, d.removed.at(-1).id); assert.deepEqual(d.flows[0].steps[0], copy); assert.deepEqual(validate(d), []);
});
test('a free flow is refused if a box has no place or an unknown shape, and an unknown layout', () => {
  const { d, f } = free(); o.addShape(d, f, {}); const bad = structuredClone(d); delete bad.flows[0].steps[0].x; assert.match(validate(bad).join(), /no position or size/);
  const b2 = structuredClone(d); b2.flows[0].steps[0].shape = 'star'; assert.match(validate(b2).join(), /unknown shape/); const b3 = structuredClone(d); b3.flows[0].layout = 'circle'; assert.match(validate(b3).join(), /unknown layout/);
});
test('the old Markdown export of a free flow still lists its boxes in order, and the default export of other flows is unchanged', () => {
  const { d, f, a, b, c } = swim(); const before = exportLegacy(d).flowsMd; o.switchToFree(d, f, POS([a, b, c]));
  const md = parseFlows(exportLegacy(d).flowsMd)[0]; assert.deepEqual(md.steps.map((s) => s.title), ['Draft', 'Check', 'Send']); assert.ok(before.includes('Quotes'));
});

// ---- shapes: pill, diamond, entity box, notes ----
test('a pill, a diamond and an entity box are added with the right size and kind, and the file stays valid', () => {
  const { d, f } = free(); const p = o.addShape(d, f, { shape: 'pill', title: 'Start' }), dm = o.addShape(d, f, { shape: 'diamond', title: 'OK?' }), e = o.addShape(d, f, { shape: 'entity', title: 'Order' });
  const [P, D, E] = d.flows[0].steps; assert.deepEqual([P.id, P.shape, P.kind, P.w], [p, 'pill', undefined, 180]); assert.deepEqual([D.id, D.shape, D.kind], [dm, 'diamond', 'decision']); assert.deepEqual([E.id, E.shape, E.w, E.h, E.title], [e, 'entity', 210, 130, 'Order']);
  assert.deepEqual(validate(d), []);
});
test('an arrow out of a diamond is labelled Yes and then No, like a decision on a swimlane', () => {
  const { d, f } = free(); o.addShape(d, f, { shape: 'diamond' }); o.addShape(d, f, {}); o.addShape(d, f, {}); connectFree(d, f, 0, 1); connectFree(d, f, 0, 2);
  assert.deepEqual([d.flows[0].steps[1].triggers[0].msg, d.flows[0].steps[2].triggers[0].msg], ['Yes', 'No']);
});
test('an entity box holds a name, free description lines and an optional Sheet reference, and a relationship is a labelled arrow', () => {
  const { d, f } = free(); d.sheets.push({ id: 'h1', kind: 'sheet', name: 'Orders', departmentId: null, sectionId: null, owner: '', details: [], crit: null, url: null, note: '', sort: 1 });
  const a = o.addShape(d, f, { shape: 'entity', title: 'Customer' }), b = o.addShape(d, f, { shape: 'entity', title: 'Order' });
  o.updateStep(d, f, a, { note: 'id\nname\nemail' }); o.updateStep(d, f, b, { note: 'id\ntotal', sheetId: 'h1' }); connectFree(d, f, 0, 1); d.flows[0].steps[1].triggers[0].msg = '1 to many';
  assert.deepEqual(d.flows[0].steps.map((s) => [s.title, s.note, s.sheetId]), [['Customer', 'id\nname\nemail', undefined], ['Order', 'id\ntotal', 'h1']]); assert.deepEqual(validate(d), []);
});
test('an entity diagram round-trips: Removed and restore keep the lines, the sheet and the size', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { shape: 'entity', title: 'Customer' }); o.updateStep(d, f, a, { note: 'id\nname' }); const copy = structuredClone(d.flows[0].steps[0]);
  o.removeStep(d, f, a); o.restore(d, d.removed.at(-1).id); assert.deepEqual(d.flows[0].steps[0], copy);
});
test('notes work on a free flow: free or pinned to a box, and they survive Removed and restore', () => {
  const { d, f } = free(); const a = o.addShape(d, f, { x: 100, y: 50 }); const n1 = o.addNote(d, f, { text: 'free', x: 300, y: 300 }), n2 = o.addNote(d, f, { text: 'pinned', x: 20, y: 86, stepId: a });
  assert.deepEqual(d.flows[0].notes.map((n) => n.id), [n1, n2]); assert.deepEqual(validate(d), []); o.removeNote(d, f, n2); o.restore(d, d.removed.at(-1).id); assert.equal(d.flows[0].notes[1].stepId, a);
});
test('the new-fields Markdown export names the shapes of a free flow; the default export does not change', () => {
  const { d, f } = free(); o.addShape(d, f, { shape: 'entity', title: 'Order' }); o.addShape(d, f, { shape: 'rounded', title: 'Plain' }); o.addShape(d, f, { shape: 'pill', title: 'Go' });
  const plain = exportLegacy(d).flowsMd, rich = exportLegacy(d, { withNewFields: true }).flowsMd;
  assert.ok(!plain.includes('entity box')); assert.match(rich, /Step 1 \(Order\) is an entity box/); assert.match(rich, /Step 3 \(Go\) is a pill/); assert.ok(!rich.includes('Plain) is'));
});
