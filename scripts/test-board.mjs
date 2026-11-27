// Ticket board helpers and the status move. Run: node --test scripts/test-board.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const ops = await lib('ops.js'), B = await lib('board.js'), { validate, emptyData } = await lib('schema.js');

function build() {
  const d = emptyData('T'), dep = ops.addDepartment(d, 'Ops'), sec = ops.addSection(d, dep, 'W'), a = ops.addSheet(d, { name: 'Orders', departmentId: dep, sectionId: sec }), app = ops.addSheet(d, { kind: 'app', name: 'CRM' });
  return { d, dep, a, app };
}
test('moving to Blocked keeps a trimmed reason; moving anywhere else clears it; the file stays valid', () => {
  const { d } = build(), t = ops.addTicket(d, { title: 'x' });
  ops.moveTicket(d, t, 'blocked', ' waiting on key '); assert.equal(d.tickets.items[0].status, 'blocked'); assert.equal(d.tickets.items[0].blocked, 'waiting on key');
  ops.moveTicket(d, t, 'doing'); assert.ok(!('blocked' in d.tickets.items[0])); assert.equal(d.tickets.items[0].status, 'doing');
  ops.moveTicket(d, t, 'blocked'); assert.equal(d.tickets.items[0].blocked, ''); assert.deepEqual(validate(d), []);
  assert.throws(() => ops.moveTicket(d, t, 'later'), /Unknown status/); assert.throws(() => ops.moveTicket(d, 'nope', 'done'), /no longer exists/);
});
test('priority order: urgent first, equal priorities keep file order, missing priority is normal', () => {
  const l = [{ id: 1 }, { id: 2, priority: 'low' }, { id: 3, priority: 'urgent' }, { id: 4, priority: 'high' }, { id: 5, priority: 'normal' }, { id: 6, priority: 'urgent' }];
  assert.deepEqual(B.byPriority(l).map((t) => t.id), [3, 6, 4, 1, 5, 2]); assert.deepEqual(l.map((t) => t.id), [1, 2, 3, 4, 5, 6], 'the input is not changed');
});
test('summary counts every status and lists the blocked tickets', () => {
  const s = B.summary([{ status: 'todo' }, { status: 'done' }, { status: 'blocked', id: 'B' }, { status: 'doing' }, { status: 'done' }]);
  assert.deepEqual(s.counts, { todo: 1, doing: 1, blocked: 1, done: 2 }); assert.equal(s.open, 3); assert.equal(s.total, 5); assert.deepEqual(s.blocked.map((t) => t.id), ['B']);
});
test('project progress ignores rejected change requests and adds up hours', () => {
  const p = { id: 'P', log: [{ hours: 2 }] }, items = [p, { id: 'a', project: 'P', status: 'done', log: [{ hours: 1.5 }] }, { id: 'b', project: 'P', status: 'todo' }, { id: 'c', project: 'P', status: 'done', decision: 'rejected' }, { id: 'z', project: 'Q', status: 'done' }];
  const s = B.projectStats(items, p); assert.deepEqual(s, { total: 2, done: 1, hours: 3.5 }); assert.equal(B.statsLine(s), '1 of 2 items done · ⏱ 3.5 h'); assert.equal(B.statsLine({ total: 0, done: 0, hours: 0 }), '');
});
test('initials and hours', () => { assert.equal(B.initials('Kim Tran'), 'KT'); assert.equal(B.initials('sam'), 'SA'); assert.equal(B.initials(''), ''); assert.equal(B.fmtH(2.504), '2.5 h'); assert.equal(B.hoursOf({ log: [{ hours: 1 }, { hours: '0.25' }] }), 1.25); });
test('targets and table groups: department order, then apps, then not linked; dead targets are flagged', () => {
  const { d, dep, a, app } = build(); ops.addDepartment(d, 'Empty');
  const t1 = ops.addTicket(d, { title: 'on sheet', targetId: a }), t2 = ops.addTicket(d, { title: 'on dept', targetId: dep }), t3 = ops.addTicket(d, { title: 'on app', targetId: app }), t4 = ops.addTicket(d, { title: 'none' }), t5 = ops.addTicket(d, { title: 'dead', targetRaw: 'ghost' });
  const items = d.tickets.items, kind = (id) => B.targetOf(d, items.find((t) => t.id === id))?.kind;
  assert.deepEqual([kind(t1), kind(t2), kind(t3), kind(t4), kind(t5)], ['sheet', 'dept', 'app', undefined, 'orphan']);
  assert.deepEqual(B.groupByDepartment(d, items).map((g) => [g.name, g.items.length]), [['Ops', 2], ['Connected apps', 1], ['Not linked', 2]]);
});
test('new ticket ids and updated dates use the local date, not UTC', () => {
  const { d } = build(), id = ops.addTicket(d, { title: 'x' }), local = new Date().toLocaleDateString('en-CA');
  assert.equal(id, 'T' + local.replace(/-/g, '') + '.001'); assert.equal(d.tickets.items[0].updated, local);
});
