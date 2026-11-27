// Lane and arrow edits for the flow canvas (lib/ops.js team ops, lib/flow-edit.js). Run: node --test scripts/test-flow-edit.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), E = await lib('flow-edit.js'), { validate, emptyData } = await lib('schema.js'), { exportLegacy } = await lib('export-legacy.js'), { parseFlows } = await lib('flows-parser.js');

function build() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Payroll' });
  const a = o.addStep(d, f, { team: 'Harvest', title: 'Top up' }), b = o.addStep(d, f, { team: 'IT', title: 'Check', triggers: [{ stepId: a, msg: 'ready' }] }), c = o.addStep(d, f, { team: 'Finance', title: 'Review', triggers: [{ stepId: b, msg: '' }] });
  return { d, f, a, b, c };
}
const flow = (d) => d.flows[0], shown = (d) => parseFlows(exportLegacy(d).flowsMd)[0];

test('lanes can be added, renamed everywhere, reordered, and removed only when empty', () => {
  const { d, f } = build();
  o.addTeam(d, f, 'QA'); assert.deepEqual(flow(d).teams, ['Harvest', 'IT', 'Finance', 'QA']);
  assert.throws(() => o.addTeam(d, f, 'qa'), /already exists/);
  o.renameTeam(d, f, 'IT', 'Tech'); assert.equal(flow(d).steps[1].team, 'Tech'); assert.ok(flow(d).teams.includes('Tech'));
  o.moveTeam(d, f, 'QA', -1); assert.deepEqual(flow(d).teams, ['Harvest', 'IT'.replace('IT', 'Tech'), 'QA', 'Finance']);
  assert.throws(() => o.removeTeam(d, f, 'Tech'), /steps in this lane/); o.removeTeam(d, f, 'QA'); assert.ok(!flow(d).teams.includes('QA'));
  assert.deepEqual(validate(d), []);
});
test('renaming a lane also renames a "waits on a team" arrow', () => {
  const { d, f, c } = build(); o.updateStep(d, f, c, { triggers: [{ team: 'Harvest', msg: 'go' }] });
  o.renameTeam(d, f, 'Harvest', 'Farm'); assert.equal(flow(d).steps[2].triggers[0].team, 'Farm');
});
test('connect adds a waits-on arrow forward and a dashed send-back backward, once only', () => {
  const { d, f } = build();
  assert.equal(E.connect(d, f, 0, 2, false), true); assert.equal(E.connect(d, f, 0, 2, false), false);
  assert.equal(shown(d).edges.filter((e) => e.to === 2).length, 2);
  const g = build(); o.addStep(g.d, g.f, { team: 'IT', title: 'Auto' }); // follows the step before, with no arrow of its own
  assert.equal(shown(g.d).edges.filter((e) => e.to === 3).length, 1); E.connect(g.d, g.f, 0, 3, false);
  assert.equal(shown(g.d).edges.filter((e) => e.to === 3).length, 2, 'drawing adds an arrow, it does not replace the one that was there'); assert.deepEqual(validate(g.d), []);
  assert.equal(E.connect(d, f, 2, 0, true), true); assert.equal(E.connect(d, f, 2, 0, true), false);
  assert.equal(shown(d).steps[2].backs.length, 1); assert.deepEqual(validate(d), []);
});
test('removing an arrow takes out that one; the last one leaves the step starting on its own, not following the step before', () => {
  const { d, f } = build(); E.connect(d, f, 0, 2, false);
  const edges = () => shown(d).edges.filter((e) => e.to === 2);
  E.removeArrow(d, f, { kind: 'trigger', to: 2, tIdx: edges().find((e) => e.from === 0).tIdx }); assert.equal(edges().length, 1);
  E.removeArrow(d, f, { kind: 'trigger', to: 2, tIdx: edges()[0].tIdx }); assert.equal(edges().length, 0); assert.equal(flow(d).steps[2].standalone, true);
});
test('the automatic arrow from the step before can be removed too', () => {
  const { d, f } = build(); o.addStep(d, f, { team: 'IT', title: 'Auto' }); // no triggers: follows the step before
  const edge = shown(d).edges.find((e) => e.to === 3); assert.equal(edge.tIdx, -1);
  E.removeArrow(d, f, { kind: 'trigger', to: 3, tIdx: -1 }); assert.equal(shown(d).edges.filter((e) => e.to === 3).length, 0);
});
test('an arrow to a step in Removed does not throw off which arrow is deleted', () => {
  const { d, f, a, b } = build(); const x = o.addStep(d, f, { team: 'Harvest', title: 'Gone', afterStepId: a });
  o.updateStep(d, f, b, { triggers: [{ stepId: x, msg: 'old' }, { stepId: a, msg: 'ready' }] }); o.removeStep(d, f, x);
  const k = shown(d).edges.find((e) => e.to === shown(d).steps.findIndex((s) => s.title === 'Check')); assert.equal(k.tIdx, 0); // the canvas counts only the arrow it can draw
  E.removeArrow(d, f, { kind: 'trigger', to: 1, tIdx: 0 });
  const left = flow(d).steps.find((s) => s.id === b).triggers; assert.deepEqual(left.map((t) => t.stepId), [x]); assert.equal(flow(d).steps.find((s) => s.id === b).standalone, true);
  assert.deepEqual(validate(d), []);
});
test('a deleted step restores with its arrows, and every edit leaves a valid file', () => {
  const { d, f, b } = build(); E.connect(d, f, 0, 2, false); o.removeStep(d, f, b);
  assert.deepEqual(validate(d), []); o.restore(d, d.removed.at(-1).id); assert.deepEqual(validate(d), []);
  assert.equal(shown(d).steps.length, 3); assert.equal(shown(d).edges.length >= 2, true);
});
