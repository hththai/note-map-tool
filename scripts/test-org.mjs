// Department members, function descriptions, file type, documentation links and open-ticket roll-ups. Run: node --test scripts/test-org.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const ops = await lib('ops.js'), { validate, emptyData, upgrade } = await lib('schema.js'), { exportLegacy } = await lib('export-legacy.js'), { importLegacy } = await lib('import-legacy.js'), { roundTrip } = await lib('roundtrip.js');
const R = await lib('rollup.js'), { parse } = await lib('parser.js');
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => assert.equal(JSON.stringify(canon(a)), JSON.stringify(canon(b)));

function build() {
  const d = emptyData('T'), dep = ops.addDepartment(d, 'Ops'), sec = ops.addSection(d, dep, 'Weekly count'), sec2 = ops.addSection(d, dep, 'Suppliers');
  const a = ops.addSheet(d, { name: 'Orders', departmentId: dep, sectionId: sec }), b = ops.addSheet(d, { name: 'Vendors', departmentId: dep, sectionId: sec2 });
  return { d, dep, sec, sec2, a, b };
}

test('members are added, edited, removed, and a file with none stays free of the field', () => {
  const { d, dep } = build(); assert.ok(!('members' in d.departments[0]));
  const m = ops.addMember(d, dep, { name: ' Kim Tran ', role: 'Lead', email: 'kim@x.test' }); ops.addMember(d, dep, { name: 'Sam' });
  assert.deepEqual(d.departments[0].members[0], { id: m, name: 'Kim Tran', role: 'Lead', email: 'kim@x.test' }); assert.deepEqual(validate(d), []);
  ops.updateMember(d, dep, m, { role: 'Head', email: '' }); assert.deepEqual(d.departments[0].members[0], { id: m, name: 'Kim Tran', role: 'Head' });
  ops.removeMember(d, dep, m); assert.equal(d.departments[0].members.length, 1);
  ops.removeMember(d, dep, d.departments[0].members[0].id); assert.ok(!('members' in d.departments[0]));
});
test('member rules say why and change nothing', () => {
  const { d, dep } = build(); const before = structuredClone(d);
  assert.throws(() => ops.addMember(d, dep, { name: '  ' }), /needs a name/); assert.throws(() => ops.updateMember(d, dep, 'nope', { role: 'x' }), /no longer exists/);
  ops.addMember(d, dep, { name: 'Kim' }); assert.throws(() => ops.removeDepartment(d, dep), /still has/);
  const bad = structuredClone(d); bad.departments[0].members[0].name = ''; assert.ok(validate(bad).some((p) => /no name/.test(p)));
  same(before.sheets, d.sheets);
});
test('a department with members cannot be deleted, so members are never lost with it', () => {
  const d = emptyData('T'), dep = ops.addDepartment(d, 'Solo'); ops.addMember(d, dep, { name: 'Kim' });
  assert.throws(() => ops.removeDepartment(d, dep), /members/); ops.removeMember(d, dep, d.departments[0].members[0].id); ops.removeDepartment(d, dep); assert.equal(d.departments.length, 0);
});
test('file type: Google Sheet is the default and is not written; unknown types are refused', () => {
  const { d, a } = build(); ops.updateSheet(d, a, { type: 'pdf' }); assert.equal(d.sheets[0].type, 'pdf'); assert.deepEqual(validate(d), []);
  ops.updateSheet(d, a, { type: 'sheet' }); assert.ok(!('type' in d.sheets[0])); ops.updateSheet(d, a, { type: 'doc' }); ops.updateSheet(d, a, { type: '' }); assert.ok(!('type' in d.sheets[0]));
  assert.throws(() => ops.updateSheet(d, a, { type: 'zip' }), /Unknown file type/);
  const bad = structuredClone(d); bad.sheets[0].type = 'zip'; assert.ok(validate(bad).some((p) => /unknown type/.test(p)));
});
test('documentation links: add, edit, remove; the last removal drops the field', () => {
  const { d, a } = build();
  ops.addDoc(d, a, { label: ' How-to ', url: ' https://doc.test/1 ' }); ops.addDoc(d, a, { url: 'https://doc.test/2' });
  assert.deepEqual(d.sheets[0].docs, [{ label: 'How-to', url: 'https://doc.test/1' }, { label: '', url: 'https://doc.test/2' }]); assert.deepEqual(validate(d), []);
  ops.updateDoc(d, a, 1, { label: 'Video' }); assert.equal(d.sheets[0].docs[1].label, 'Video');
  assert.throws(() => ops.addDoc(d, a, { url: ' ' }), /needs an address/); assert.throws(() => ops.updateDoc(d, a, 1, { url: '' }), /needs an address/); assert.throws(() => ops.removeDoc(d, a, 9), /no longer exists/);
  ops.removeDoc(d, a, 0); ops.removeDoc(d, a, 0); assert.ok(!('docs' in d.sheets[0]));
});
test('a file with members, type and docs survives Removed and Restore exactly, and so do its tickets', () => {
  const { d, dep, a } = build(); ops.addMember(d, dep, { name: 'Kim', role: 'Lead' }); ops.updateSheet(d, a, { type: 'excel', owner: 'Kim' }); ops.addDoc(d, a, { label: 'Doc', url: 'https://x.test' });
  ops.addTicket(d, { title: 'Fix', targetId: a }); const before = structuredClone(d);
  ops.removeSheet(d, a); assert.deepEqual(validate(d), []); ops.restore(d, d.removed[0].id); same(d, before);
});
test('open tickets: per file, per function (its files only) and per department (direct plus all files)', () => {
  const { d, dep, sec, sec2, a, b } = build();
  const t1 = ops.addTicket(d, { title: 'on Orders', targetId: a }), t2 = ops.addTicket(d, { title: 'done one', targetId: a, status: 'done' }), t3 = ops.addTicket(d, { title: 'on Vendors', targetId: b, status: 'blocked' }), t4 = ops.addTicket(d, { title: 'on dept', targetId: dep }), t5 = ops.addTicket(d, { title: 'nowhere' });
  const ids = (l) => l.map((t) => t.id).sort();
  assert.deepEqual(ids(R.openTicketsForSheet(d, a)), [t1]); assert.deepEqual(ids(R.openTicketsForSection(d, sec)), [t1]); assert.deepEqual(ids(R.openTicketsForSection(d, sec2)), [t3]);
  assert.deepEqual(ids(R.openTicketsForDepartment(d, dep)), [t1, t3, t4].sort()); assert.ok(![t2, t5].some((x) => ids(R.openTicketsForDepartment(d, dep)).includes(x)));
});
test('owner status: member, someone else, or none; matching ignores case and spaces', () => {
  const { d, dep, a, b } = build(); ops.addMember(d, dep, { name: 'Kim Tran' });
  ops.updateSheet(d, a, { owner: ' kim tran ' }); ops.updateSheet(d, b, { owner: 'Raj' });
  assert.equal(R.ownerStatus(d, d.sheets[0]), 'member'); assert.equal(R.ownerStatus(d, d.sheets[1]), 'other'); ops.updateSheet(d, b, { owner: '' }); assert.equal(R.ownerStatus(d, d.sheets[1]), 'none');
  assert.equal(d.sheets[0].owner, ' kim tran ', 'the stored text is never rewritten');
});
test('an old file loads unchanged: upgrade adds nothing, and the new fields are absent', () => {
  const { d } = build(); const { data, changes } = upgrade(d); assert.deepEqual(changes, []); same(data, d); assert.ok(d.sheets.every((s) => !('docs' in s) && !('type' in s)) && d.departments.every((x) => !('members' in x)));
});
test('old-format export is identical with or without the option when no new field is used, and round-trips', () => {
  const { d } = build(); ops.updateSheet(d, d.sheets[0].id, { owner: 'Kim', crit: 'high' });
  assert.deepEqual(exportLegacy(d), exportLegacy(d, { withNewFields: true }));
  const x = exportLegacy(d); assert.deepEqual(roundTrip(x, importLegacy({ mapMd: x.mapMd, flowsMd: x.flowsMd, ticketsJson: x.ticketsJson }).data), []);
});
test('with the option the new fields appear as readable lines; without it the plain export is unchanged', () => {
  const { d, dep, a } = build(); ops.addMember(d, dep, { name: 'Kim Tran', role: 'Lead', email: 'kim@x.test' }); ops.addMember(d, dep, { name: 'Sam' });
  ops.updateSheet(d, a, { type: 'pdf', note: 'Master list.' }); ops.addDoc(d, a, { label: 'How-to', url: 'https://doc.test/1' });
  const plain = exportLegacy(d).mapMd, full = exportLegacy(d, { withNewFields: true }).mapMd;
  assert.ok(!/Members:|Docs:|Type:/.test(plain)); assert.match(full, /Members: Kim Tran \(Lead\) <kim@x.test>; Sam/); assert.match(full, /Type: PDF/); assert.match(full, /Docs: How-to https:\/\/doc\.test\/1/);
  const m = parse(full); assert.deepEqual(m.warn, []); assert.equal(m.depts[0].sections[0].nodes[0].note, 'Master list.\nType: PDF\nDocs: How-to https://doc.test/1');
});
