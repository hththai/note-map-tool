// Tickets report numbers. Run: node --test scripts/test-report.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const R = await lib('report.js');

test('opened date is read from the id; ids without a date give null', () => {
  assert.equal(R.openedOn({ id: 'T20261115.001' }), '2026-11-15'); assert.equal(R.openedOn({ id: 'P20260102.014' }), '2026-01-02'); assert.equal(R.openedOn({ id: 'x' }), null);
});
test('period presets are counted from today (Mon 23 Nov 2026 here)', () => {
  const today = new Date(2026, 10, 23);
  assert.deepEqual(R.rangeFor('30d', today), ['2026-10-25', '2026-11-23']); assert.deepEqual(R.rangeFor('week', today), ['2026-11-23', '2026-11-23']);
  assert.deepEqual(R.rangeFor('week', new Date(2026, 10, 26)), ['2026-11-23', '2026-11-26']);
  assert.deepEqual(R.rangeFor('month', today), ['2026-11-01', '2026-11-23']); assert.deepEqual(R.rangeFor('lastmonth', today), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(R.rangeFor('lastmonth', new Date(2026, 0, 15)), ['2025-12-01', '2025-12-31']);
});
test('totals, finished list, blocked, hours in the period, projects and departments', () => {
  const items = [
    { id: 'P20261101.001', type: 'project', title: 'Big', status: 'doing', log: [{ date: '2026-11-10', hours: 1 }] },
    { id: 'T20261105.001', type: 'ticket', title: 'a', status: 'done', updated: '2026-11-12', project: 'P20261101.001', targetId: 'dep1', log: [{ date: '2026-11-11', hours: 2 }, { date: '2026-10-01', hours: 5 }] },
    { id: 'T20261120.001', type: 'ticket', title: 'b', status: 'blocked', blocked: 'waiting', updated: '2026-11-20' },
    { id: 'T20260901.001', type: 'ticket', title: 'old', status: 'done', updated: '2026-09-02' },
    { id: 'T20261121.001', type: 'ticket', title: 'rejected', status: 'done', updated: '2026-11-22', project: 'P20261101.001', decision: 'rejected' },
  ];
  const d = { departments: [{ id: 'dep1', name: 'Ops' }], sheets: [], tickets: { items } };
  const r = R.buildReport(d, items, '2026-11-01', '2026-11-30');
  assert.deepEqual(r.totals, { opened: 4, finished: 2, open: 2, blocked: 1, hours: 3 });
  assert.deepEqual(r.finished.map((t) => t.id), ['T20261121.001', 'T20261105.001'], 'newest first, old one left out');
  assert.deepEqual(r.blocked.map((t) => t.id), ['T20261120.001']);
  assert.deepEqual(r.perTicket.map((x) => [x.t.id, x.h]), [['T20261105.001', 2], ['P20261101.001', 1]]);
  const p = r.projects[0]; assert.deepEqual([p.total, p.done, p.hoursPeriod, p.hoursTotal], [1, 1, 3, 8], 'rejected item ignored; hours of items count toward the project');
  assert.deepEqual(r.departments.map((g) => [g.name, g.opened, g.finished, g.open, g.hours]), [['Ops', 1, 1, 0, 2], ['Not linked', 3, 1, 2, 1]]);
});
test('a one-day period and an empty scope do not break', () => {
  const d = { departments: [], sheets: [], tickets: { items: [] } }, r = R.buildReport(d, [], '2026-11-23', '2026-11-23');
  assert.deepEqual(r.totals, { opened: 0, finished: 0, open: 0, blocked: 0, hours: 0 }); assert.equal(R.periodLabel('2026-11-23', '2026-11-23'), '2026-11-23');
});
test('weekly buckets start on Monday, cover the whole period and count only dates inside it', () => {
  const items = [{ id: 'T20261111.001', status: 'done', updated: '2026-11-18' }, { id: 'T20261112.001', status: 'doing' }, { id: 'T20261030.001', status: 'done', updated: '2026-11-02' }, { id: 'T20260901.001', status: 'done', updated: '2026-09-02' }];
  const w = R.weekly(items, '2026-11-04', '2026-11-22');
  assert.deepEqual(w.map((x) => x.start), ['2026-11-02', '2026-11-09', '2026-11-16'], 'Mondays, from the week of the first day');
  assert.deepEqual(w.map((x) => [x.opened, x.finished]), [[0, 0], [2, 0], [0, 1]], 'T20261030 and the 2 Nov finish are before the period; 2 Sep is outside');
  assert.deepEqual(R.weekly([], '2026-11-23', '2026-11-23').map((x) => x.start), ['2026-11-23']);
});
