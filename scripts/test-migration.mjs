// Edge cases for the import / export / validate code. Run: node --test scripts/test-migration.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { exportLegacy } = await lib('export-legacy.js'), { roundTrip } = await lib('roundtrip.js'), { validate, emptyData, newId, SCHEMA_VERSION, upgrade } = await lib('schema.js');
const MAP = `# T
## Ops
Lead: Kim
- Loose | Kim | high
> Counting
  How to count.
- Orders | Kim | high | https://x.test
  Note line.
- Orders | Raj | low
## Apps
- CRM | syncs
## Links
- Orders -> CRM | IMPORTRANGE
- Orders -> Ghost | manual copy
`;
const FLOWS = `# F
Every: Friday
Teams: A, B
1. A | Start | Fri | sheet: Orders | ticket: T1
2. B | Work | <- A: go | <- 1 | -> 1: redo | sheet: Nowhere
  A note.
3. B | Alone | <- start
`;
const TICKETS = { nextId: 5, tickets: [{ id: 'T1', title: 't', target: 'orders', weird: { a: [1, 2] } }, { id: 'T2', title: 'd', target: 'dept:Ops' }, { id: 'T3', title: 'g', target: 'ghost' }, { id: 'T4', title: 'n', target: '' }, { id: 'T5', title: 'x' }], extraTop: 1 };
const run = (o) => { const { data, report } = importLegacy(o); return { data, report, problems: roundTrip(o, data) }; };

test('everything in a typical set survives', () => {
  const { problems, report } = run({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS });
  assert.deepEqual(problems, []);
  assert.equal(report.unresolved.length, 3); // the Ghost link end, the Nowhere sheet, the ghost ticket
});
test('names that point at nothing are kept, not dropped', () => {
  const { data } = importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS });
  assert.equal(data.links[1].toName, 'Ghost'); assert.equal(data.flows[0].steps[1].sheetName, 'Nowhere');
  assert.equal(data.tickets.items[2].targetRaw, 'ghost'); assert.equal(data.tickets.items[3].targetRaw, ''); assert.ok(!('targetId' in data.tickets.items[4]) && !('targetRaw' in data.tickets.items[4]));
});
test('two sheets with one name: links use the first, as the old app does', () => {
  const { data } = importLegacy({ mapMd: MAP });
  const orders = data.sheets.filter((s) => s.name === 'Orders'); assert.equal(orders.length, 2); assert.equal(data.links[0].fromId, orders[0].id);
});
test('unknown ticket fields and top-level keys are kept', () => {
  const { data } = importLegacy({ mapMd: MAP, ticketsJson: TICKETS });
  assert.deepEqual(data.tickets.items[0].weird, { a: [1, 2] }); assert.equal(data.tickets.extra.extraTop, 1);
  assert.equal(exportLegacy(data).ticketsJson.extraTop, 1);
});
test('a section-less sheet and a titled section keep their place', () => {
  const { data } = importLegacy({ mapMd: MAP });
  assert.equal(data.departments[0].sections[0].title, null); assert.equal(data.departments[0].sections[1].title, 'Counting');
});
test('a file the parser cannot fully read is kept word for word', () => {
  const lossy = MAP + '<!-- a comment the model cannot hold -->\n';
  const { data, problems } = run({ mapMd: lossy });
  assert.deepEqual(problems, []); assert.equal(data.meta.legacy.mapMd, lossy);
  const bad = run({ mapMd: MAP, flowsMd: FLOWS + 'garbage line\n' }).data;
  assert.equal(bad.meta.legacy.flowsMd.includes('garbage line'), true); assert.deepEqual(bad.flows[0].unreadable, ['garbage line']);
});
test('importing twice gives an identical file', () => {
  const a = JSON.stringify(importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS }).data), b = JSON.stringify(importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS }).data);
  assert.equal(a, b);
});
test('renaming a sheet keeps its links, tickets and flow steps attached', () => {
  const { data } = importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS });
  data.sheets.find((s) => s.name === 'CRM').name = 'CRM v2';
  assert.match(exportLegacy(data).mapMd, /Orders -> CRM v2 \| IMPORTRANGE/);
});
test('validate catches a dangling id, a duplicate id and a newer schema', () => {
  const { data } = importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS });
  assert.deepEqual(validate(data), []);
  const a = structuredClone(data); a.links[0].toId = 'nope'; assert.ok(validate(a).length);
  const b = structuredClone(data); b.sheets[1].id = b.sheets[0].id; assert.ok(validate(b).some((p) => p.includes('duplicate')));
  const c = structuredClone(data); c.schemaVersion = SCHEMA_VERSION + 1; assert.ok(validate(c)[0].includes('newer'));
});
test('an empty map imports and exports cleanly', () => {
  const o = { mapMd: '# Empty\n' }; assert.deepEqual(run(o).problems, []); assert.deepEqual(validate(emptyData()), []);
});
test('new ids are unique enough', () => { const s = new Set(Array.from({ length: 500 }, () => newId('s'))); assert.equal(s.size, 500); });

/* ---- edits: delete / restore / purge ---- */
const ops = await lib('ops.js'), { removeSheet, removeTicket, restore, purge, updateSheet, updateTicket } = ops;
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => assert.equal(JSON.stringify(canon(a)), JSON.stringify(canon(b)));
const fresh = () => importLegacy({ mapMd: MAP.replace('Orders -> Ghost | manual copy', 'CRM -> Orders | back'), flowsMd: FLOWS.replace('Nowhere', 'CRM'), ticketsJson: { nextId: 9, tickets: [{ id: 'P1', title: 'proj', type: 'project', target: 'orders' }, { id: 'T1', title: 'a', type: 'ticket', target: 'orders', project: 'P1' }, { id: 'T2', title: 'b', target: 'crm' }] } }).data;

for (const name of ['Loose', 'CRM']) {
  test(`removing "${name}" and restoring it gives back exactly the original`, () => {
    const d = fresh(), before = structuredClone(d), id = d.sheets.find((s) => s.name === name).id;
    removeSheet(d, id);
    assert.equal(d.sheets.some((s) => s.id === id), false); assert.equal(d.removed.length, 1);
    assert.deepEqual(validate(d), [], 'no dangling reference is left behind');
    restore(d, d.removed[0].id);
    same(d, before);
  });
}
test('removing a sheet leaves its tickets and flow steps pointing at it, and the file stays valid', () => {
  const d = fresh(), id = d.sheets.find((s) => s.name === 'CRM').id;
  removeSheet(d, id);
  assert.equal(d.tickets.items.find((t) => t.id === 'T2').targetId, id); assert.equal(d.flows[0].steps[1].sheetId, id);
  assert.deepEqual(validate(d), []); assert.equal(d.links.some((l) => l.fromId === id || l.toId === id), false);
  assert.equal(exportLegacy(d).ticketsJson.tickets.find((t) => t.id === 'T2').target, 'crm', 'the name is still known while it is in Removed');
});
test('removing a project leaves its items alone, and restoring it is lossless', () => {
  const d = fresh(), before = structuredClone(d);
  removeTicket(d, 'P1'); assert.equal(d.tickets.items.find((x) => x.id === 'T1').project, 'P1');
  restore(d, d.removed[0].id); same(d, before);
});
test('removing a ticket and restoring it gives back exactly the original', () => {
  const d = fresh(), before = structuredClone(d); removeTicket(d, 'T2'); assert.equal(d.tickets.items.length, 2);
  restore(d, d.removed[0].id); same(d, before);
});
test('removing then restoring several entries in any order is lossless', () => {
  const d = fresh(), before = structuredClone(d), a = d.sheets[0].id, b = d.sheets[2].id;
  removeSheet(d, a); removeSheet(d, b); removeTicket(d, 'T1');
  restore(d, d.removed[2].id); restore(d, d.removed[0].id); restore(d, d.removed[0].id);
  same(d, before);
});
test('purge is the only thing that really deletes', () => {
  const d = fresh(); removeSheet(d, d.sheets[0].id); const r = d.removed[0].id; purge(d, r); assert.equal(d.removed.length, 0);
});
test('edits change only what they are told to, and a removed-then-edited file still exports', () => {
  const d = fresh(); updateSheet(d, d.sheets[1].id, { name: 'Orders v2', crit: 'low' }); updateTicket(d, 'T2', { status: 'doing' });
  assert.equal(d.tickets.items.find((t) => t.id === 'T2').status, 'doing'); assert.deepEqual(validate(d), []);
  assert.match(exportLegacy(d).mapMd, /Orders v2/); removeSheet(d, d.sheets[0].id); assert.ok(exportLegacy(d).mapMd.length > 0);
});
test('2000 random remove/restore sequences, over every kind of entry, always end exactly where they started', () => {
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const kinds = [(d) => d.sheets, (d) => d.tickets.items, (d) => d.links, (d) => d.flows, (d) => d.flows.flatMap((f) => f.steps.map((s) => ({ ...s, flowId: f.id })))];
  const remove = [(d, id) => ops.removeSheet(d, id), (d, id) => ops.removeTicket(d, id), (d, id) => ops.removeLink(d, id), (d, id) => ops.removeFlow(d, id), (d, id) => ops.removeStep(d, d.flows.find((f) => f.steps.some((s) => s.id === id)).id, id)];
  const rich = () => { const d = fresh(); ops.addFlow(d, { title: 'G' }); ops.addStep(d, d.flows[1].id, { team: 'A', title: 'one' }); ops.addStep(d, d.flows[1].id, { team: 'B', title: 'two' }); d.flows[1].steps[1].triggers.push({ stepId: d.flows[1].steps[0].id, msg: 'x' }); d.flows[1].steps[0].backs.push({ stepId: d.flows[1].steps[1].id, msg: 'y' }); return d; };
  for (let run = 0; run < 2000; run++) {
    const d = rich(), before = structuredClone(d), steps = 2 + rnd(8);
    for (let k = 0; k < steps; k++) {
      const kind = rnd(kinds.length), pool = kinds[kind](d);
      if (pool.length) { try { remove[kind](d, pool[rnd(pool.length)].id); } catch (e) { /* a step whose flow is removed cannot be picked again */ } }
      if (d.removed.length && rnd(3) === 0) { try { restore(d, d.removed[rnd(d.removed.length)].id); } catch (e) { assert.match(e.message, /first/); } }
      assert.deepEqual(validate(d), []);
    }
    while (d.removed.length) { /* restore in a random order, skipping any that still wait on a flow or sheets */
      const order = d.removed.map((r, i) => i).sort(() => rnd(3) - 1); let done = false;
      for (const i of order) { try { restore(d, d.removed[i].id); done = true; break; } catch (e) { assert.match(e.message, /first/); } }
      assert.ok(done, 'something in Removed can never come back');
    }
    same(d, before);
  }
});

/* ---- add / edit / structure ---- */
const blank = () => { const d = emptyData('New'); return d; };
test('a map can be built from nothing and exports to the old formats', () => {
  const d = blank(), dep = ops.addDepartment(d, 'Ops'), sec = ops.addSection(d, dep, 'Weekly count'), a = ops.addSheet(d, { name: 'Orders', departmentId: dep, sectionId: sec }), b = ops.addSheet(d, { kind: 'app', name: 'CRM' });
  ops.updateSheet(d, a, { owner: 'Kim', crit: 'high' }); ops.addLink(d, { fromId: a, toId: b, label: 'IMPORTRANGE' });
  const f = ops.addFlow(d, { title: 'Count' }), s1 = ops.addStep(d, f, { team: 'Ops', title: 'Count', sheetId: a }), s2 = ops.addStep(d, f, { team: 'Sales', title: 'Use it' }); ops.updateStep(d, f, s2, { triggers: [{ stepId: s1, msg: 'done' }] });
  const t = ops.addTicket(d, { title: 'Fix', targetId: a, type: 'project' }); ops.addLog(d, t, { hours: 2, note: 'a' });
  assert.deepEqual(validate(d), []); const x = exportLegacy(d);
  assert.match(x.mapMd, /- Orders \| Kim \| high/); assert.match(x.mapMd, /Orders -> CRM \| IMPORTRANGE/); assert.match(x.flowsMd, /2\. Sales \| Use it \| <- 1: done/);
  assert.equal(x.ticketsJson.tickets[0].target, 'orders'); assert.match(x.ticketsJson.tickets[0].id, /^P\d{8}\.001$/);
  assert.deepEqual(roundTrip(x, importLegacy({ mapMd: x.mapMd, flowsMd: x.flowsMd, ticketsJson: x.ticketsJson }).data), []);
});
test('ticket ids count up per day and per type, even past removed ones', () => {
  const d = blank(), a = ops.addTicket(d, { title: 'a' }), b = ops.addTicket(d, { title: 'b' }); ops.removeTicket(d, b); const c = ops.addTicket(d, { title: 'c' });
  assert.deepEqual([a, b, c].map((x) => x.slice(-3)), ['001', '002', '003']); assert.match(ops.addTicket(d, { title: 'p', type: 'project' }), /^P/);
});
test('things that cannot be done say why and change nothing', () => {
  const d = importLegacy({ mapMd: MAP }).data, snap = structuredClone(d);
  assert.throws(() => ops.removeDepartment(d, d.departments[0].id), /still has sheets/); assert.throws(() => ops.removeSection(d, d.departments[0].sections[1].id), /still has sheets/);
  assert.throws(() => ops.addSheet(d, { name: ' ', departmentId: 'x', sectionId: 'y' }), /needs a name/); assert.throws(() => ops.addLink(d, { fromId: d.sheets[0].id, toId: d.sheets[0].id }), /two different/);
  assert.throws(() => ops.addTicket(d, { title: '' }), /needs a title/); assert.throws(() => ops.addLog(d, 'nope', { hours: 1 }), /no longer exists/);
  same(d, snap);
});
test('empty departments and sections can be deleted, and sheets can be moved and reordered', () => {
  const d = importLegacy({ mapMd: MAP }).data, dep = d.departments[0], [s0, s1] = dep.sections, orders = d.sheets.filter((s) => s.name === 'Orders')[0];
  const dep2 = ops.addDepartment(d, 'Empty'), sec2 = ops.addSection(d, dep2, 'S'); ops.moveSheet(d, orders.id, sec2);
  assert.equal(d.sheets.find((s) => s.id === orders.id).departmentId, dep2); assert.deepEqual(validate(d), []);
  ops.moveSheet(d, orders.id, s1.id); ops.removeSection(d, sec2); ops.removeDepartment(d, dep2); assert.equal(d.departments.length, 1);
  const names = () => d.sheets.filter((s) => s.sectionId === s1.id).map((s) => s.owner); const before = names(); ops.shiftSheet(d, d.sheets.find((s) => s.sectionId === s1.id).id, 1);
  assert.notDeepEqual(names(), before); assert.deepEqual(validate(d), []);
});
test('removing a flow step keeps the arrows pointing at it, the export skips them, and restore is exact', () => {
  const d = importLegacy({ mapMd: MAP, flowsMd: FLOWS }).data, before = structuredClone(d), f = d.flows[0], gone = f.steps[0].id;
  ops.removeStep(d, f.id, gone); assert.equal(f.steps.length, 2); assert.equal(f.steps.some((s) => s.triggers.concat(s.backs).some((x) => x.stepId === gone)), true);
  assert.deepEqual(validate(d), []); assert.doesNotMatch(exportLegacy(d).flowsMd, /Start/); assert.doesNotThrow(() => exportLegacy(d).flowsMd);
  restore(d, d.removed[0].id); same(d, before);
});
test('a step cannot come back before its flow, and a link not before its sheets', () => {
  const d = importLegacy({ mapMd: MAP, flowsMd: FLOWS }).data, f = d.flows[0]; ops.removeStep(d, f.id, f.steps[0].id); ops.removeFlow(d, f.id);
  assert.throws(() => restore(d, d.removed[0].id), /flow first/); restore(d, d.removed[1].id); restore(d, d.removed[0].id);
  const e = importLegacy({ mapMd: MAP }).data, link = e.links[0], from = link.fromId; ops.removeLink(e, link.id); ops.removeSheet(e, from);
  assert.throws(() => restore(e, e.removed[0].id), /sheets this link connects first/); restore(e, e.removed[1].id); restore(e, e.removed[0].id);
});

test('a file from an earlier build (no sort numbers on flows) is upgraded without changing anything else', () => {
  const d = importLegacy({ mapMd: MAP, flowsMd: FLOWS, ticketsJson: TICKETS }).data, old = structuredClone(d);
  delete old.flows[0].sort; old.flows[0].steps.forEach((s) => delete s.sort);
  assert.ok(validate(old).length > 0, 'the old file would be refused as it is');
  const { data, changes } = upgrade(old); assert.deepEqual(validate(data), []); assert.equal(changes.length, 2);
  same(data, d);                                    /* identical to a fresh import */
  assert.deepEqual(upgrade(data).changes, []);       /* running it again changes nothing */
  assert.equal(exportLegacy(data).flowsMd, exportLegacy(d).flowsMd);
  assert.deepEqual(old.flows[0].steps.map((s) => s.sort), old.flows[0].steps.map(() => undefined), 'the original object is not modified');
});
