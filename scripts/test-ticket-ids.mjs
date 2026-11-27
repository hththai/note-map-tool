// A ticket's id letter follows its type, and the repair for older maps. Run: node --test scripts/test-ticket-ids.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const ops = await lib('ops.js'), { validate, emptyData } = await lib('schema.js');

const withTickets = (...items) => { const d = emptyData('T'); items.forEach((t, i) => d.tickets.items.push({ title: 't' + i, status: 'todo', owner: '', sort: (i + 1) * ops.STEP, ...t })); return d; };
const ids = (d) => d.tickets.items.map((t) => t.id);

test('switching the type changes the letter and keeps the date and number', () => {
  const d = withTickets({ id: 'T20201116.001', type: 'ticket' });
  assert.equal(ops.updateTicket(d, 'T20201116.001', { type: 'project' }), 'P20201116.001');
  assert.deepEqual(ids(d), ['P20201116.001']); assert.deepEqual(d.tickets.items[0].formerIds, ['T20201116.001']);
  ops.updateTicket(d, 'P20201116.001', { type: 'feature' }); assert.equal(d.tickets.items[0].id, 'F20201116.001');
  ops.updateTicket(d, 'F20201116.001', { type: 'ticket' }); assert.equal(d.tickets.items[0].id, 'T20201116.001'); assert.deepEqual(d.tickets.items[0].formerIds, ['P20201116.001', 'F20201116.001']);
});
test('a number that is taken (live, in Removed or a former id) moves to the next free one', () => {
  const d = withTickets({ id: 'T20201116.001', type: 'ticket' }, { id: 'P20201116.001', type: 'project' }, { id: 'X', type: 'ticket', formerIds: ['P20201116.002'] });
  d.removed.push({ id: 'x1', kind: 'ticket', label: 'gone', removedAt: 'n', entry: { id: 'P20201116.003', title: 'gone', type: 'project', status: 'todo', sort: 9e6 } });
  ops.updateTicket(d, 'T20201116.001', { type: 'project' }); assert.equal(d.tickets.items[0].id, 'P20201116.004');
});
test('a new ticket never reuses a former id', () => {
  const d = withTickets({ id: 'T20201116.001', type: 'ticket' }); ops.updateTicket(d, 'T20201116.001', { type: 'project' });
  const t = ops.addTicket(d, { title: 'new' }); assert.ok(!['T20201116.001', 'P20201116.001'].includes(t));
});
test('what pointed at the old id follows it', () => {
  const d = withTickets({ id: 'P20201116.001', type: 'project' }, { id: 'T20201117.001', type: 'ticket', project: 'P20201116.001' });
  d.flows.push({ id: 'f1', title: 'F', sort: ops.STEP, teams: [], steps: [{ id: 's1', sort: ops.STEP, team: 'a', title: 'x', ticket: 'T20201117.001' }] });
  d.removed.push({ id: 'x2', kind: 'step', flowId: 'f1', label: 's', removedAt: 'n', entry: { id: 's2', sort: 2 * ops.STEP, team: 'a', title: 'y', ticket: 'T20201117.001' } });
  ops.updateTicket(d, 'T20201117.001', { type: 'change' });
  assert.equal(d.flows[0].steps[0].ticket, 'C20201117.001'); assert.equal(d.removed[0].entry.ticket, 'C20201117.001');
  assert.throws(() => ops.updateTicket(d, 'P20201116.001', { type: 'feature' }), /Move its 1 item out/);
  /* a project with a wrong letter (an older map) keeps its items when repaired */
  const e = withTickets({ id: 'T20201116.001', type: 'project' }, { id: 'T20201117.001', type: 'ticket', project: 'T20201116.001' });
  assert.deepEqual(ops.planIdRepairs(e).map((r) => [r.from, r.to, r.kids]), [['T20201116.001', 'P20201116.001', 1]]);
  ops.repairTicketIds(e); assert.equal(e.tickets.items[1].project, 'P20201116.001');
});
test('a project that still has items cannot become something else', () => {
  const d = withTickets({ id: 'P20201116.001', type: 'project' }, { id: 'T20201117.001', type: 'ticket', project: 'P20201116.001' }, { id: 'T20201117.002', type: 'ticket', project: 'P20201116.001' });
  const before = structuredClone(d);
  assert.throws(() => ops.updateTicket(d, 'P20201116.001', { type: 'ticket' }), /Move its 2 items out of this project first/); assert.deepEqual(d, before);
});
test('old T-1 style ids never change', () => {
  const d = withTickets({ id: 'T-1', type: 'ticket' }); ops.updateTicket(d, 'T-1', { type: 'project' }); assert.deepEqual(ids(d), ['T-1']); assert.ok(!('formerIds' in d.tickets.items[0]));
});
test('repair lists and fixes ids whose letter does not match, in the map and in Removed, and only the ones asked for', () => {
  const d = withTickets({ id: 'T20260909.002', type: 'project' }, { id: 'P20260909.002', type: 'ticket' }, { id: 'T20261119.003', type: 'feature' }, { id: 'T20261120.001', type: 'ticket' });
  d.removed.push({ id: 'x1', kind: 'ticket', label: 'g', removedAt: 'n', entry: { id: 'C20261120.001', title: 'g', type: 'feature', status: 'todo', sort: 9e6 } });
  const plan = ops.planIdRepairs(d); assert.deepEqual(plan.map((r) => [r.from, r.to, r.removed]), [['T20260909.002', 'P20260909.003', false], ['P20260909.002', 'T20260909.003', false], ['T20261119.003', 'F20261119.003', false], ['C20261120.001', 'F20261120.001', true]]);
  const copy = structuredClone(d); ops.planIdRepairs(d); assert.deepEqual(d, copy, 'planning changes nothing');
  ops.repairTicketIds(d, new Set(['T20261119.003']));
  assert.deepEqual(ids(d), ['T20260909.002', 'P20260909.002', 'F20261119.003', 'T20261120.001']);
  ops.repairTicketIds(d); assert.deepEqual(ids(d), ['P20260909.003', 'T20260909.003', 'F20261119.003', 'T20261120.001']); assert.equal(d.removed[0].entry.id, 'F20261120.001');
  assert.deepEqual(ops.planIdRepairs(d), []); assert.deepEqual(validate(d), []);
});
