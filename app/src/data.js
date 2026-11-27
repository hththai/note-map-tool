/* Records for the page: the parsed map, flows and tickets of the map that is open.
 * setRecords() swaps them (live bindings), and App remounts the views when it does. Read helpers only; saving lives in lib/store.js. */
import { parse } from './lib/parser.js';
import { parseFlows } from './lib/flows-parser.js';

export let model = parse('');
export let flows = [];
export let tickets = [];
export function setRecords({ mapMd, flowsMd, ticketsJson }) {
  model = parse(mapMd);
  flows = parseFlows(flowsMd);
  tickets = ticketsJson.tickets || [];
}
export const low = (s) => String(s || '').toLowerCase();

export const allNodes = () => model.depts.flatMap((d) => d.sections.flatMap((s) => s.nodes)).concat(model.apps);
export function whereIs() {
  const idx = {};
  model.depts.forEach((d) => d.sections.forEach((sc) => sc.nodes.forEach((n) => { idx[n.key] = { dept: d.name, sec: sc }; })));
  return idx;
}
export const openFor = (key) => tickets.filter((t) => t.target === key && t.status !== 'done');
export const STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };

/* ---- helpers for the "new concept" layouts (C, D, E) ---- */
const SLATE = { dot: 'bg-slate-500', soft: 'bg-slate-50', text: 'text-slate-700', ring: 'border-slate-200', hex: '#64748b' };
const TONES = [
  { dot: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-700', ring: 'border-sky-200', hex: '#0ea5e9' },
  { dot: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-700', ring: 'border-violet-200', hex: '#8b5cf6' },
  { dot: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700', ring: 'border-emerald-200', hex: '#10b981' },
  { dot: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700', ring: 'border-amber-200', hex: '#f59e0b' },
  { dot: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-700', ring: 'border-rose-200', hex: '#f43f5e' },
];
export const toneOf = (dept) => { const i = model.depts.findIndex((d) => d.name === dept); return i < 0 ? SLATE : TONES[i % TONES.length]; };
export const deptOf = (key) => whereIs()[key]?.dept || 'Connected apps';
export const nodeByKey = (key) => allNodes().find((n) => n.key === key);
const mk = (name, l) => ({ key: low(name), name, label: l.label, manual: /manual/i.test(l.label) });
export const feedsOf = (key) => model.links.filter((l) => low(l.from) === key).map((l) => mk(l.to, l));
export const fedByOf = (key) => model.links.filter((l) => low(l.to) === key).map((l) => mk(l.from, l));
export const flowsOf = (name) => flows.flatMap((f) => f.steps.map((s, i) => ({ f, s, i })).filter((x) => x.s.sheet && low(x.s.sheet) === low(name)));
export const CRIT = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-200 text-slate-700' };
