/* Old files (map .md, flows .md, tickets .json) -> one Data file. Pure: never touches the old files.
 * Same input always gives the same output (ids come from positions), so the import can be re-run. */
import { parse } from './parser.js';
import { mapLossy } from './serialize.js';
import { parseFlows } from './flows-parser.js';
import { SCHEMA_VERSION, idFactory } from './schema.js';
import { STEP } from './ops.js';

export function importLegacy({ mapMd, flowsMd = '', ticketsJson = null, source = {} }) {
  const id = idFactory(), model = parse(mapMd), flows = parseFlows(flowsMd), report = { unresolved: [], mapWarnings: model.warn.slice(), flowsDropped: [] };
  const data = { schemaVersion: SCHEMA_VERSION, title: model.title, departments: [], sheets: [], links: [], flows: [], tickets: { nextId: 1, extra: {}, items: [] }, removed: [], meta: { importedFrom: source } };
  const byKey = new Map(), deptByName = new Map();

  const addSheet = (n, kind, departmentId, sectionId, seed) => {
    const [owner = '', ...details] = n.parts || [];
    const s = { id: id('s', seed), kind, name: n.name, departmentId, sectionId, owner, details, crit: n.crit || null, url: n.url || null, note: n.note || '', sort: (data.sheets.length + 1) * STEP };
    data.sheets.push(s);
    if (!byKey.has(n.key)) byKey.set(n.key, s.id);
  };
  model.depts.forEach((d, di) => {
    const dep = { id: id('d', 'dept' + di), name: d.name, text: d.text.slice(), sections: [] };
    data.departments.push(dep);
    if (!deptByName.has(d.name)) deptByName.set(d.name, dep.id);
    d.sections.forEach((sc, si) => {
      const sec = { id: id('c', `sec${di}.${si}`), title: sc.title, note: sc.note || '' };
      dep.sections.push(sec);
      sc.nodes.forEach((n, ni) => addSheet(n, 'sheet', dep.id, sec.id, `${di}.${si}.${ni}`));
    });
  });
  model.apps.forEach((n, i) => addSheet(n, 'app', null, null, 'app' + i));

  model.links.forEach((l, i) => {
    const from = byKey.get(l.from.toLowerCase()), to = byKey.get(l.to.toLowerCase()), k = { id: id('l', 'link' + i) };
    if (from) k.fromId = from; else { k.fromName = l.from; report.unresolved.push(`link ${i + 1} starts at "${l.from}", which is not a sheet or app`); }
    if (to) k.toId = to; else { k.toName = l.to; report.unresolved.push(`link ${i + 1} ends at "${l.to}", which is not a sheet or app`); }
    k.label = l.label; k.sort = (i + 1) * STEP;
    data.links.push(k);
  });

  flows.forEach((fl, fi) => {
    const stepIds = fl.steps.map((_, si) => id('p', `flow${fi}.step${si}`));
    const f = { id: id('f', 'flow' + fi), sort: (fi + 1) * STEP, title: fl.title, every: fl.every, teams: fl.teams.slice(), unreadable: fl.dropped.slice(), steps: [] };
    if (fl.dropped.length) report.flowsDropped.push(...fl.dropped.map((x) => `${fl.title}: ${x}`));
    fl.steps.forEach((st, si) => {
      const s = { id: stepIds[si], sort: (si + 1) * STEP, team: st.team, title: st.title, day: st.day, ticket: st.ticket, note: st.note || '' };
      const sheetId = st.sheet && byKey.get(st.sheet.toLowerCase());
      if (st.sheet) { if (sheetId) s.sheetId = sheetId; else { s.sheetName = st.sheet; report.unresolved.push(`flow "${fl.title}" step ${si + 1} uses "${st.sheet}", which is not a sheet or app`); } }
      if (st.standalone) s.standalone = true;
      s.triggers = st.triggers.map((t) => (t.ref ? { stepId: stepIds[fl.steps.indexOf(t.ref)], msg: t.msg || '' } : t.num != null ? null : { team: t.team, msg: t.msg || '' })).filter(Boolean);
      s.backs = st.backs.map((b) => ({ stepId: stepIds[fl.steps.indexOf(b.ref)], msg: b.msg || '' }));
      f.steps.push(s);
    });
    data.flows.push(f);
  });

  const tj = ticketsJson || { nextId: 1, tickets: [] }, { tickets, nextId, ...extra } = tj;
  data.tickets.nextId = nextId ?? 1; data.tickets.extra = extra;
  (tickets || []).forEach((t) => {
    const o = {};
    for (const [k, v] of Object.entries(t)) {
      if (k !== 'target') { o[k] = v; continue; }
      const dept = typeof v === 'string' && v.startsWith('dept:') ? deptByName.get(v.slice(5)) : null, sheet = typeof v === 'string' ? byKey.get(v) : null;
      if (dept || sheet) o.targetId = dept || sheet;
      else { o.targetRaw = v; if (v) report.unresolved.push(`ticket ${t.id} is about "${v}", which is not on the map`); }
    }
    o.sort = (data.tickets.items.length + 1) * STEP;
    data.tickets.items.push(o);
  });

  /* anything the model cannot hold is kept word for word, so nothing is ever dropped */
  const legacy = {};
  if (mapLossy(mapMd)) legacy.mapMd = mapMd;
  if (flows.some((f) => f.dropped.length)) legacy.flowsMd = flowsMd;
  if (Object.keys(legacy).length) data.meta.legacy = legacy;
  report.counts = { departments: data.departments.length, sheets: data.sheets.length, links: data.links.length, flows: data.flows.length, steps: data.flows.reduce((n, f) => n + f.steps.length, 0), tickets: data.tickets.items.length };
  return { data, report };
}
