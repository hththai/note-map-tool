// Connections between flows (lib/ops.js addFlowLink, updateFlowLink, removeFlowLink, removeFlow/restore; lib/schema.js). Run: node --test scripts/test-flow-links.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), { validate, emptyData, upgrade } = await lib('schema.js'), { exportLegacy } = await lib('export-legacy.js');
function three() { const d = emptyData('T'), a = o.addFlow(d, { title: 'Payroll' }), b = o.addFlow(d, { title: 'Budget review' }), c = o.addFlow(d, { title: 'Reporting' }); const s = o.addStep(d, a, { team: 'HR', title: 'Close month' }); return { d, a, b, c, s }; }

test('a file with no connections is valid, has no list, and is not changed by upgrading', () => { const { d } = three(); assert.equal(d.flowLinks, undefined); assert.deepEqual(validate(d), []); assert.equal(upgrade(structuredClone(d)).data.flowLinks, undefined); });
test('a connection leads from one flow to another with a label and, optionally, a starting step', () => {
  const { d, a, b, c, s } = three(); const l1 = o.addFlowLink(d, { fromFlowId: a, toFlowId: b, label: ' monthly close feeds budget ' }), l2 = o.addFlowLink(d, { fromFlowId: a, toFlowId: c, fromStepId: s });
  assert.deepEqual(d.flowLinks.map((l) => [l.id, l.fromFlowId, l.toFlowId, l.label, l.fromStepId]), [[l1, a, b, 'monthly close feeds budget', undefined], [l2, a, c, '', s]]); assert.ok(d.flowLinks[0].sort < d.flowLinks[1].sort); assert.deepEqual(validate(d), []);
});
test('a flow cannot lead to itself, the same connection cannot be made twice, and unknown flows or steps are refused', () => {
  const { d, a, b } = three(); assert.throws(() => o.addFlowLink(d, { fromFlowId: a, toFlowId: a }), /itself/); o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); assert.throws(() => o.addFlowLink(d, { fromFlowId: a, toFlowId: b }), /already connected/);
  assert.doesNotThrow(() => o.addFlowLink(d, { fromFlowId: b, toFlowId: a })); assert.throws(() => o.addFlowLink(d, { fromFlowId: a, toFlowId: 'f_nope' }), /no longer exists/); assert.throws(() => o.addFlowLink(d, { fromFlowId: a, toFlowId: b, fromStepId: 'p_nope' }), /no longer exists/);
});
test('a connection can be relabelled and given or cleared of a starting step', () => {
  const { d, a, b, s } = three(); const l = o.addFlowLink(d, { fromFlowId: a, toFlowId: b, label: 'x' }); o.updateFlowLink(d, l, { label: 'y', fromStepId: s }); assert.deepEqual([d.flowLinks[0].label, d.flowLinks[0].fromStepId], ['y', s]);
  o.updateFlowLink(d, l, { fromStepId: null }); assert.equal(d.flowLinks[0].fromStepId, undefined); assert.deepEqual(validate(d), []); assert.throws(() => o.updateFlowLink(d, l, { fromStepId: 'p_nope' }), /no longer exists/);
});
test('deleting a connection moves it to Removed with a readable name, and restoring puts it back in order', () => {
  const { d, a, b, c } = three(); const l1 = o.addFlowLink(d, { fromFlowId: a, toFlowId: b, label: 'one' }), l2 = o.addFlowLink(d, { fromFlowId: b, toFlowId: c }), l3 = o.addFlowLink(d, { fromFlowId: a, toFlowId: c });
  o.removeFlowLink(d, l2); assert.deepEqual(d.flowLinks.map((l) => l.id), [l1, l3]); const r = d.removed.at(-1); assert.equal(r.kind, 'flowlink'); assert.equal(r.label, 'Budget review → Reporting'); assert.deepEqual(validate(d), []);
  o.restore(d, r.id); assert.deepEqual(d.flowLinks.map((l) => l.id), [l1, l2, l3]); assert.equal(d.removed.length, 0); assert.deepEqual(validate(d), []);
  const n = o.addFlowLink(d, { fromFlowId: c, toFlowId: a }); assert.ok(d.flowLinks.at(-1).sort > d.flowLinks[2].sort && d.flowLinks.at(-1).id === n);
});
test('deleting a flow takes its connections with it, and restoring the flow brings them back exactly', () => {
  const { d, a, b, c } = three(); const l1 = o.addFlowLink(d, { fromFlowId: a, toFlowId: b, label: 'one' }), l2 = o.addFlowLink(d, { fromFlowId: c, toFlowId: b }), l3 = o.addFlowLink(d, { fromFlowId: a, toFlowId: c }); const before = structuredClone(d.flowLinks);
  o.removeFlow(d, b); assert.deepEqual(d.flowLinks.map((l) => l.id), [l3]); assert.deepEqual(d.removed.at(-1).flowLinks.map((l) => l.id), [l1, l2]); assert.deepEqual(validate(d), []);
  o.restore(d, d.removed.at(-1).id); assert.deepEqual(d.flowLinks, before); assert.deepEqual(validate(d), []);
});
test('when two connected flows are both deleted, the connection waits with the second and comes back only when both are back', () => {
  const { d, a, b } = three(); const l = o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); o.removeFlow(d, a); o.removeFlow(d, b); assert.deepEqual(d.flowLinks, []); assert.deepEqual(validate(d), []);
  const ra = d.removed.find((r) => r.entry.id === a), rb = d.removed.find((r) => r.entry.id === b); assert.equal((ra.flowLinks || []).length + (rb.flowLinks || []).length, 1);
  o.restore(d, rb.id); assert.deepEqual(d.flowLinks, [], 'the other end is still removed'); assert.deepEqual(validate(d), []); o.restore(d, ra.id); assert.deepEqual(d.flowLinks.map((x) => x.id), [l]); assert.deepEqual(validate(d), []);
});
test('purging a deleted flow forgets its connections and leaves a valid file', () => {
  const { d, a, b } = three(); o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); o.removeFlow(d, b); o.purge(d, d.removed.at(-1).id); assert.deepEqual(d.flowLinks, []); assert.deepEqual(validate(d), []);
});
test('restoring one connection needs both its flows, and a bad file is refused', () => {
  const { d, a, b } = three(); const l = o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); o.removeFlowLink(d, l); o.removeFlow(d, b); assert.throws(() => o.restore(d, d.removed.find((r) => r.kind === 'flowlink').id), /Restore the flows/);
  const bad = structuredClone(three().d); bad.flowLinks = [{ id: 'fl_x', sort: 1, fromFlowId: bad.flows[0].id, toFlowId: 'f_gone', label: '' }]; assert.match(validate(bad).join(), /missing flow/);
  bad.flowLinks = [{ id: 'fl_x', sort: 1, fromFlowId: bad.flows[0].id, toFlowId: bad.flows[0].id, label: '' }]; assert.match(validate(bad).join(), /itself/); bad.flowLinks = [{ id: 'fl_x', sort: 1, fromFlowId: bad.flows[0].id, toFlowId: bad.flows[1].id, label: '', fromStepId: 'p_x' }]; assert.match(validate(bad).join(), /missing step/);
});
test('a starting step that is deleted keeps the connection valid and comes back with the step', () => {
  const { d, a, b, s } = three(); o.addFlowLink(d, { fromFlowId: a, toFlowId: b, fromStepId: s }); o.removeStep(d, a, s); assert.deepEqual(validate(d), []); o.restore(d, d.removed.at(-1).id); assert.deepEqual(validate(d), []); assert.equal(d.flowLinks[0].fromStepId, s);
});
test('old exports ignore connections: the legacy Markdown and map are unchanged', () => { const { d, a, b } = three(); const before = JSON.stringify(exportLegacy(d)); o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); assert.equal(JSON.stringify(exportLegacy(d)), before); });

const { mapLayout } = await lib('flow-map.js');
test('the Flow map puts a flow after the ones that lead to it, from left to right, and never two flows in one place', () => {
  const { d, a, b, c } = three(); o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); o.addFlowLink(d, { fromFlowId: b, toFlowId: c }); const at = mapLayout(d.flows, d.flowLinks);
  assert.ok(at[a].x < at[b].x && at[b].x < at[c].x); assert.equal(new Set(Object.values(at).map((p) => p.x + ',' + p.y)).size, 3);
  const e = emptyData('T'), x = o.addFlow(e, { title: 'x' }), y = o.addFlow(e, { title: 'y' }), z = o.addFlow(e, { title: 'z' }), w = o.addFlow(e, { title: 'w' }); o.addFlowLink(e, { fromFlowId: x, toFlowId: z }); o.addFlowLink(e, { fromFlowId: y, toFlowId: z }); const p = mapLayout(e.flows, e.flowLinks);
  assert.equal(p[x].x, p[y].x); assert.notEqual(p[x].y, p[y].y); assert.ok(p[z].x > p[x].x); assert.ok(p[w].x === p[x].x && p[w].y > p[y].y, 'a flow with no connection sits after the connected ones in the first column');
});
test('a loop of connections still gives every flow its own place', () => {
  const { d, a, b, c } = three(); o.addFlowLink(d, { fromFlowId: a, toFlowId: b }); o.addFlowLink(d, { fromFlowId: b, toFlowId: c }); o.addFlowLink(d, { fromFlowId: c, toFlowId: a }); const at = mapLayout(d.flows, d.flowLinks);
  assert.equal(new Set(Object.values(at).map((p) => p.x + ',' + p.y)).size, 3); assert.ok(Object.values(at).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepEqual(mapLayout([], []), {});
});

test('deleting and restoring a flow leaves a file with no connections exactly as it was (no empty list appears)', () => {
  const { d, b } = three(); const before = JSON.stringify(d); o.removeFlow(d, b); assert.equal(d.flowLinks, undefined); o.restore(d, d.removed.at(-1).id); assert.equal(JSON.stringify(d), before);
});
