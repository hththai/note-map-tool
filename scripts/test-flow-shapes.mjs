// Start/end markers, decision steps with Yes/No branches, and editing an arrow's message (lib/schema.js, lib/flow-edit.js, lib/export-legacy.js).
// Run: node --test scripts/test-flow-shapes.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), E = await lib('flow-edit.js'), { validate, emptyData } = await lib('schema.js'), { exportLegacy } = await lib('export-legacy.js'), { parseFlows } = await lib('flows-parser.js');

function build() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Quote' });
  const s = o.addStep(d, f, { team: 'Sales', title: 'Start' }), dr = o.addStep(d, f, { team: 'Sales', title: 'Draft quote' }), dec = o.addStep(d, f, { team: 'Finance', title: 'Over $10k?' });
  const yes = o.addStep(d, f, { team: 'Finance', title: 'Sign off', standalone: true }), no = o.addStep(d, f, { team: 'Sales', title: 'Send quote', standalone: true }), end = o.addStep(d, f, { team: 'Sales', title: 'Done', standalone: true });
  return { d, f, s, dr, dec, yes, no, end };
}
const step = (d, id) => d.flows[0].steps.find((x) => x.id === id), shown = (d) => parseFlows(exportLegacy(d).flowsMd)[0];

test('a step is an ordinary step until it is given a shape; the three shapes are valid and anything else is refused', () => {
  const { d, f, s, dec, end } = build(); assert.equal(step(d, s).kind, undefined); assert.deepEqual(validate(d), []);
  o.updateStep(d, f, s, { kind: 'start' }); o.updateStep(d, f, dec, { kind: 'decision' }); o.updateStep(d, f, end, { kind: 'end' }); assert.deepEqual(validate(d), []);
  o.updateStep(d, f, dec, { kind: 'maybe' }); assert.ok(validate(d).some((p) => /unknown kind/.test(p)));
  o.updateStep(d, f, dec, { kind: undefined }); assert.equal('kind' in step(d, dec), false); assert.deepEqual(validate(d), []);
});
test('the first two arrows out of a decision are labelled Yes and No; later ones and arrows out of ordinary steps start unlabelled', () => {
  const { d, f, dr, dec, yes, no, end } = build(); const i = (id) => d.flows[0].steps.findIndex((x) => x.id === id);
  o.updateStep(d, f, dec, { kind: 'decision' });
  E.connect(d, f, i(dec), i(yes), false); E.connect(d, f, i(dec), i(no), false); E.connect(d, f, i(dec), i(end), false);
  assert.deepEqual([yes, no, end].map((id) => step(d, id).triggers[0].msg), ['Yes', 'No', '']);
  E.connect(d, f, i(dr), i(dec), false); assert.equal(step(d, dec).triggers.at(-1).msg, '');
});
test('an arrow\'s message can be read and changed, whether it waits on a step, was automatic, or sends work back', () => {
  const { d, f, dr, dec, yes } = build(); const i = (id) => d.flows[0].steps.findIndex((x) => x.id === id);
  E.connect(d, f, i(dr), i(yes), false); const trig = { kind: 'trigger', to: i(yes), tIdx: 0 };
  assert.equal(E.arrowMessage(d, f, trig), ''); E.setArrowMessage(d, f, trig, 'Approved'); assert.equal(E.arrowMessage(d, f, trig), 'Approved'); assert.equal(step(d, yes).triggers[0].msg, 'Approved');
  const auto = { kind: 'trigger', to: i(dr), tIdx: -1 }; assert.equal(step(d, dr).triggers.length, 0); E.setArrowMessage(d, f, auto, 'Quote ready');
  assert.equal(step(d, dr).triggers.length, 1); assert.equal(step(d, dr).triggers[0].msg, 'Quote ready'); assert.equal(shown(d).edges.filter((e) => e.to === i(dr)).length, 1);
  E.connect(d, f, i(yes), i(dec), true); const back = { kind: 'back', from: i(yes), k: 0 }; E.setArrowMessage(d, f, back, 'Changes needed'); assert.equal(E.arrowMessage(d, f, back), 'Changes needed');
  assert.deepEqual(validate(d), []);
});
test('a decision, a start and an end go to Removed and come back with their shape', () => {
  const { d, f, dec } = build(); o.updateStep(d, f, dec, { kind: 'decision' }); o.removeStep(d, f, dec); assert.deepEqual(validate(d), []);
  o.restore(d, d.removed.at(-1).id); assert.equal(step(d, dec).kind, 'decision'); assert.deepEqual(validate(d), []);
});
test('shapes never change the old file formats; the new-fields export names them in comments the old parser skips', () => {
  const { d, f, s, dec, end } = build(); const plain = exportLegacy(d).flowsMd;
  o.updateStep(d, f, s, { kind: 'start' }); o.updateStep(d, f, dec, { kind: 'decision' }); o.updateStep(d, f, end, { kind: 'end' });
  assert.equal(exportLegacy(d).flowsMd, plain);
  const withNew = exportLegacy(d, { withNewFields: true }).flowsMd;
  assert.match(withNew, /<!-- Step 1 \(Start\) is a start marker -->/); assert.match(withNew, /<!-- Step 3 \(Over \$10k\?\) is a decision -->/); assert.match(withNew, /<!-- Step 6 \(Done\) is an end marker -->/);
  assert.equal(parseFlows(withNew)[0].steps.length, 6);
});
