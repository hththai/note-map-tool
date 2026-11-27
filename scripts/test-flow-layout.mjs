// The swimlane layout (src/graph.js buildFlow): branches that land in one lane are stacked, not hidden behind each other. Run: node --test scripts/test-flow-layout.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const { buildFlow, LANE } = await import(pathToFileURL(path.join(import.meta.dirname, '../app/src/graph.js')).href);
const flow = (teams, steps, edges) => ({ title: 'T', every: '', teams, steps: steps.map(([team, title]) => ({ team, title, triggers: [], backs: [], sheet: null })), edges: edges.map(([from, to, msg = '']) => ({ from, to, msg, tIdx: 0 })) });
const abs = (g) => { const by = new Map(g.nodes.map((n) => [n.id, n])); return g.nodes.filter((n) => n.type === 'step').map((n) => { const l = by.get(n.parentId); return { id: n.id, x: n.position.x, y: l.position.y + n.position.y, w: n.width, h: n.height, lane: n.parentId }; }); };
const overlap = (B) => B.some((a, i) => B.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
const lanes = (g) => g.nodes.filter((n) => n.type === 'lane');

test('the two branches of a decision that land in the same lane are stacked in that lane, in one column, and the lane grows to hold them', () => {
  const g = buildFlow(flow(['Sales', 'Finance'], [['Sales', 'Start'], ['Finance', 'OK?'], ['Sales', 'Yes path'], ['Sales', 'No path']], [[0, 1], [1, 2, 'Yes'], [1, 3, 'No']]));
  const [s0, s1, yes, no] = abs(g); assert.equal(yes.x, no.x); assert.ok(no.y >= yes.y + yes.h, 'second branch sits below the first'); assert.ok(!overlap(abs(g)));
  const [sales, fin] = lanes(g); assert.ok(sales.height > LANE.H, 'the lane is taller'); assert.equal(fin.position.y, sales.position.y + sales.height + LANE.GAP, 'the next lane moves down by the same amount');
  assert.ok(s0 && s1);
});
test('branches that land in different lanes, and a plain chain, look exactly as before: one row per lane, lanes of the usual height', () => {
  const g = buildFlow(flow(['A', 'B', 'C'], [['A', 'one'], ['B', 'two'], ['C', 'three']], [[0, 1], [0, 2]]));
  assert.deepEqual(lanes(g).map((l) => l.height), [LANE.H, LANE.H, LANE.H]); assert.deepEqual(lanes(g).map((l) => l.position.y), [0, LANE.H + LANE.GAP, 2 * (LANE.H + LANE.GAP)]); assert.ok(!overlap(abs(g)));
});
test('unrelated steps that want the same place in a lane still go one column along, as before', () => {
  const g = buildFlow(flow(['A'], [['A', 'one'], ['A', 'two'], ['A', 'three']], [])); const B = abs(g);
  assert.deepEqual(B.map((b) => b.y), [28, 28, 28]); assert.equal(new Set(B.map((b) => b.x)).size, 3); assert.equal(lanes(g)[0].height, LANE.H);
});
test('three branches from one step in one lane make three rows, never overlapping', () => {
  const g = buildFlow(flow(['A', 'B'], [['A', 'go'], ['B', 'x'], ['B', 'y'], ['B', 'z']], [[0, 1], [0, 2], [0, 3]])); const B = abs(g);
  assert.equal(new Set(B.slice(1).map((b) => b.x)).size, 1); assert.equal(new Set(B.slice(1).map((b) => b.y)).size, 3); assert.ok(!overlap(B)); assert.ok(lanes(g)[1].height >= 28 + 3 * (LANE.STEP_H + 18));
});
