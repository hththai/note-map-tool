/* Proof that an import lost nothing: export the Data file back to the old formats and compare with the original files. */
import { parse } from './parser.js';
import { parseFlows } from './flows-parser.js';
import { exportLegacy } from './export-legacy.js';
import { validate } from './schema.js';

const plain = (m) => JSON.stringify(m, (k, v) => (k === 'el' ? undefined : v));
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const flowSig = (flows) => JSON.stringify(flows.map((f) => ({
  title: f.title, every: f.every, teams: f.teams, dropped: f.dropped, edges: f.edges,
  steps: f.steps.map((s) => ({ team: s.team, title: s.title, day: s.day, sheet: s.sheet, ticket: s.ticket, note: s.note, standalone: !!s.standalone,
    triggers: s.triggers.map((t) => ({ team: t.team, num: t.num, msg: t.msg, ref: f.steps.indexOf(t.ref) })), backs: s.backs.map((b) => ({ msg: b.msg, ref: f.steps.indexOf(b.ref) })) })),
})));

/* returns a list of problems; empty means the Data file holds everything the old files held */
export function roundTrip({ mapMd, flowsMd = '', ticketsJson = null }, data) {
  const problems = validate(data).map((p) => 'invalid data file: ' + p), ex = exportLegacy(data), kept = data.meta?.legacy || {};
  if (!kept.mapMd && plain(parse(mapMd)) !== plain(parse(ex.mapMd))) problems.push('the map changed on its way through');
  if (!kept.flowsMd && flowSig(parseFlows(flowsMd)) !== flowSig(parseFlows(ex.flowsMd))) problems.push('the flows changed on their way through');
  const before = ticketsJson || { nextId: 1, tickets: [] };
  if (JSON.stringify(canon(before)) !== JSON.stringify(canon(ex.ticketsJson))) problems.push('the tickets changed on their way through');
  return problems;
}
