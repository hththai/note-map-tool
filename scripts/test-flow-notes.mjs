// Sticky notes and the flow note (lib/ops.js notes, lib/schema.js, lib/export-legacy.js). Run: node --test scripts/test-flow-notes.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), { validate, emptyData, upgrade } = await lib('schema.js'), { exportLegacy } = await lib('export-legacy.js'), { parseFlows } = await lib('flows-parser.js'), { roundTrip } = await lib('roundtrip.js');

function build() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Payroll' }), a = o.addStep(d, f, { team: 'Harvest', title: 'Top up' }), b = o.addStep(d, f, { team: 'IT', title: 'Check' });
  return { d, f, a, b };
}
const notes = (d) => d.flows[0].notes || [];

test('a flow has no notes until one is added, and an old file is still valid', () => {
  const { d } = build(); assert.deepEqual(notes(d), []); assert.deepEqual(validate(d), []);
});
test('a note is free text with a position, in order, and may be pinned to a step', () => {
  const { d, f, a } = build();
  const n1 = o.addNote(d, f, { text: 'Hours are copied by hand', x: 300.4, y: 40.6 }), n2 = o.addNote(d, f, { text: 'Ask HR', x: 20, y: 86, stepId: a });
  assert.deepEqual(notes(d).map((n) => n.id), [n1, n2]); assert.ok(notes(d)[0].sort < notes(d)[1].sort);
  assert.equal(notes(d)[0].x, 300); assert.equal(notes(d)[0].y, 41); assert.equal(notes(d)[0].stepId, undefined); assert.equal(notes(d)[1].stepId, a);
  assert.deepEqual(validate(d), []);
  assert.throws(() => o.addNote(d, f, { text: 'x', stepId: 'p_nope' }), /no longer exists/);
});
test('a note can be edited and moved', () => {
  const { d, f } = build(); const id = o.addNote(d, f, { text: 'one', x: 0, y: 0 });
  o.updateNote(d, f, id, { text: 'two', x: 55, y: 66 }); assert.deepEqual([notes(d)[0].text, notes(d)[0].x, notes(d)[0].y], ['two', 55, 66]); assert.deepEqual(validate(d), []);
});
test('deleting a note moves it to Removed and restoring puts it back in the same place and order', () => {
  const { d, f } = build(); const a = o.addNote(d, f, { text: 'first', x: 1, y: 1 }), b = o.addNote(d, f, { text: 'second', x: 2, y: 2 }), c = o.addNote(d, f, { text: 'third', x: 3, y: 3 });
  o.removeNote(d, f, b); assert.deepEqual(notes(d).map((n) => n.id), [a, c]); const r = d.removed.at(-1);
  assert.equal(r.kind, 'note'); assert.match(r.label, /Payroll: second/); assert.deepEqual(validate(d), []);
  o.restore(d, r.id); assert.deepEqual(notes(d).map((n) => n.id), [a, b, c]); assert.equal(d.removed.length, 0); assert.deepEqual(validate(d), []);
  const e = o.addNote(d, f, { text: 'after', x: 0, y: 0 }); assert.ok(notes(d).at(-1).sort > notes(d)[2].sort && notes(d).at(-1).id === e);
});
test('a new note never reuses the sort number of one waiting in Removed', () => {
  const { d, f } = build(); const a = o.addNote(d, f, { text: 'a', x: 0, y: 0 }); const gone = o.addNote(d, f, { text: 'b', x: 0, y: 0 }); o.removeNote(d, f, gone);
  const c = o.addNote(d, f, { text: 'c', x: 0, y: 0 }); const sorts = [...notes(d).map((n) => n.sort), d.removed[0].entry.sort]; assert.equal(new Set(sorts).size, sorts.length); assert.ok(c && a);
});
test('a note pinned to a step stays valid when the step is removed, and reattaches when the step is restored', () => {
  const { d, f, a } = build(); const n = o.addNote(d, f, { text: 'pinned', x: 20, y: 86, stepId: a });
  o.removeStep(d, f, a); assert.deepEqual(validate(d), []); assert.equal(notes(d)[0].stepId, a);
  o.restore(d, d.removed.at(-1).id); assert.deepEqual(validate(d), []); assert.equal(notes(d)[0].id, n); assert.ok(d.flows[0].steps.some((s) => s.id === a));
});
test('a note whose flow is in Removed comes back with the flow; restoring a lone note needs its flow', () => {
  const { d, f } = build(); const id = o.addNote(d, f, { text: 'keep me', x: 5, y: 5 }); o.removeNote(d, f, id); const noteRec = d.removed.at(-1).id; o.removeFlow(d, f);
  assert.throws(() => o.restore(d, noteRec), /Restore the flow first/); o.restore(d, d.removed.find((r) => r.kind === 'flow').id); o.restore(d, noteRec);
  assert.equal(notes(d)[0].text, 'keep me'); assert.deepEqual(validate(d), []);
});
test('an invalid note is refused by the file check', () => {
  const { d, f } = build(); o.addNote(d, f, { text: 'ok', x: 1, y: 1 }); d.flows[0].notes[0].x = 'left'; assert.ok(validate(d).some((p) => /no position or text/.test(p)));
  d.flows[0].notes[0].x = 1; d.flows[0].notes[0].stepId = 'p_missing'; assert.ok(validate(d).some((p) => /missing step/.test(p)));
});
test('a file written before notes had sort numbers is brought up to date without losing anything', () => {
  const { d, f } = build(); o.addNote(d, f, { text: 'a', x: 0, y: 0 }); o.addNote(d, f, { text: 'b', x: 0, y: 0 }); const raw = structuredClone(d); raw.flows[0].notes.forEach((n) => delete n.sort);
  const { data, changes } = upgrade(raw); assert.ok(changes.some((c) => /notes of/.test(c))); assert.deepEqual(data.flows[0].notes.map((n) => n.text), ['a', 'b']); assert.deepEqual(validate(data), []);
  assert.deepEqual(upgrade(d).changes, []);
});
test('notes and the flow note survive a save and reload (JSON) unchanged', () => {
  const { d, f, b } = build(); d.flows[0].note = 'Runs on payday'; o.addNote(d, f, { text: 'line one\nline two', x: 9, y: 8, stepId: b });
  const again = JSON.parse(JSON.stringify(d)); assert.deepEqual(again, d); assert.deepEqual(validate(again), []);
});
test('the old file formats do not change because of notes; the "new fields" export writes them as comments the old parser skips', () => {
  const { d, f } = build(); const plain = exportLegacy(d).flowsMd; d.flows[0].note = 'Runs on payday'; o.addNote(d, f, { text: 'line one\nline two --> x', x: 1, y: 1 }); o.addNote(d, f, { text: '   ', x: 1, y: 1 });
  assert.equal(exportLegacy(d).flowsMd, plain); assert.deepEqual(roundTrip({ mapMd: '', flowsMd: plain, ticketsJson: null }, d).filter((p) => /flows/.test(p)), []);
  const withNew = exportLegacy(d, { withNewFields: true }).flowsMd; assert.match(withNew, /<!-- Flow note: Runs on payday -->/); assert.match(withNew, /<!-- Note: line one \/ line two -> x -->/); assert.equal((withNew.match(/note:/gi) || []).length, 2);
  assert.deepEqual(parseFlows(withNew)[0].steps.map((s) => s.title), ['Top up', 'Check']);
});

// ---- brief and draft (the text a person writes for AI) ----
test('a flow has no brief or draft until one is typed, and the old file is still valid', () => {
  const { d } = build(); assert.equal(d.flows[0].brief, undefined); assert.equal(d.flows[0].draft, undefined); assert.deepEqual(validate(d), []);
});
test('a brief and a draft are saved as text, can be cleared, and must be text', () => {
  const { d, f } = build(); o.updateFlow(d, f, { brief: 'Quotes wait for Finance', draft: '- send\n- check' });
  assert.deepEqual([d.flows[0].brief, d.flows[0].draft], ['Quotes wait for Finance', '- send\n- check']); assert.deepEqual(validate(d), []);
  o.updateFlow(d, f, { brief: undefined }); assert.equal(JSON.parse(JSON.stringify(d.flows[0])).brief, undefined); assert.deepEqual(validate(d), []);
  d.flows[0].draft = 42; assert.match(validate(d).join(), /draft that is not text/);
});
test('the brief and draft survive the new-fields export as comments; the default export is unchanged', () => {
  const { d, f } = build(); const plain = exportLegacy(d).flowsMd; o.updateFlow(d, f, { brief: 'Why\nthis', draft: '- a\n- b' });
  assert.equal(exportLegacy(d).flowsMd, plain); const out = exportLegacy(d, { withNewFields: true }).flowsMd;
  assert.match(out, /<!-- Brief: Why \/ this -->/); assert.match(out, /<!-- Draft: - a \/ - b -->/); assert.equal(parseFlows(out)[0].steps.length, 2);
});
