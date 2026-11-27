// Picker ranking, map file names, and the draft-style list ops the modals use. Run: node --test scripts/test-ui-helpers.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const ops = await lib('ops.js'), P = await lib('pick.js'), { validate, emptyData } = await lib('schema.js');

function build() {
  const d = emptyData('T'), a = ops.addDepartment(d, 'Finance'), b = ops.addDepartment(d, 'Operations');
  const s1 = ops.addSection(d, a, 'Month-end'), s2 = ops.addSection(d, a, 'Payroll'), s3 = ops.addSection(d, b, 'Weekly stock count'), s4 = ops.addSection(d, b, '');
  return { d, a, b, s1, s2, s3, s4 };
}
test('function choices read "Department › Function", untitled ones too', () => {
  const { d } = build(); assert.deepEqual(P.functionOptions(d).map((o) => o.label), ['Finance › Month-end', 'Finance › Payroll', 'Operations › Weekly stock count', 'Operations › (untitled)']);
});
test('typing filters by every word in any order and case; empty shows all', () => {
  const { d } = build(), o = P.functionOptions(d), l = (q, r) => P.rank(o, q, r).map((x) => x.label);
  assert.equal(l('').length, 4); assert.deepEqual(l('fin pay'), ['Finance › Payroll']); assert.deepEqual(l('STOCK oper'), ['Operations › Weekly stock count']); assert.deepEqual(l('zzz'), []);
});
test('the last one used comes first, then labels that start with the text', () => {
  const { d, s2 } = build(), o = P.functionOptions(d);
  assert.equal(P.rank(o, '', s2)[0].value, s2); assert.equal(P.rank(o, 'o')[0].label, 'Operations › Weekly stock count'); assert.equal(P.rank(o, 'o', s2)[0].value, s2);
});
test('sheet choices carry the department as a hint, so two files with one name can be told apart', () => {
  const { d, a, b, s1, s3 } = build(); ops.addSheet(d, { name: 'Orders', departmentId: a, sectionId: s1 }); ops.addSheet(d, { name: 'Orders', departmentId: b, sectionId: s3 }); ops.addSheet(d, { kind: 'app', name: 'CRM' });
  const o = P.sheetOptions(d); assert.deepEqual(o.map((x) => x.hint), ['Finance', 'Operations', 'App']); assert.deepEqual(P.rank(o, 'orders operations').map((x) => x.hint), ['Operations']);
});
test('a new map gets a safe file name from its title, numbered when taken', () => {
  assert.equal(P.slugFromTitle('Finance sheets'), 'finance-sheets'); assert.equal(P.slugFromTitle('  Café & Bar!! '), 'cafe-bar'); assert.equal(P.slugFromTitle('???'), 'map');
  assert.equal(P.slugFromTitle('Finance sheets', ['finance-sheets']), 'finance-sheets-2'); assert.equal(P.slugFromTitle('Finance sheets', ['Finance-Sheets', 'finance-sheets-2']), 'finance-sheets-3');
  assert.ok(P.slugFromTitle('x'.repeat(80)).length <= 40); assert.match(P.slugFromTitle('Hello World'), /^[A-Za-z0-9_-]{1,40}$/);
});
test('setMembers replaces the list, keeps ids, drops empty rows and removes the field when none are left', () => {
  const { d, a } = build(); const m = ops.addMember(d, a, { name: 'Kim', role: 'Lead' });
  ops.setMembers(d, a, [{ id: m, name: ' Kim Tran ', role: 'Head', email: '' }, { name: '  ' }, { name: 'Sam', role: '', email: 'sam@x.test' }]);
  const l = d.departments[0].members; assert.equal(l.length, 2); assert.deepEqual(l[0], { id: m, name: 'Kim Tran', role: 'Head' }); assert.equal(l[1].email, 'sam@x.test'); assert.ok(l[1].id && l[1].id !== m); assert.deepEqual(validate(d), []);
  ops.setMembers(d, a, [{ name: '' }]); assert.ok(!('members' in d.departments[0]));
});
test('setDocs replaces the links, drops rows without an address and removes the field when none are left', () => {
  const { d, a, s1 } = build(), id = ops.addSheet(d, { name: 'Orders', departmentId: a, sectionId: s1 });
  ops.setDocs(d, id, [{ label: ' How-to ', url: ' https://x.test/1 ' }, { label: 'blank', url: ' ' }]); assert.deepEqual(d.sheets[0].docs, [{ label: 'How-to', url: 'https://x.test/1' }]);
  ops.setDocs(d, id, [{ label: '', url: '' }]); assert.ok(!('docs' in d.sheets[0])); assert.deepEqual(validate(d), []);
});
