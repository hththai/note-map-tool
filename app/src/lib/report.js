/* Numbers for the Tickets report (no DOM, runs in Node too).
 * Dates are 'YYYY-MM-DD' strings, so plain string comparison orders them. A ticket has no "finished on" date:
 * a done ticket counts as finished on its `updated` date, and it was opened on the date inside its id (T20261115.001). */
import { hoursOf, targetOf, groupByDepartment } from './board.js';

const pad = (n) => String(n).padStart(2, '0');
export const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const addDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };

export const PRESETS = [['30d', 'Last 30 days'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom range']];
/* the [from, to] dates for a preset, counted from `today` (a Date) */
export function rangeFor(preset, today = new Date()) {
  if (preset === 'week') { const mon = addDays(today, -((today.getDay() + 6) % 7)); return [iso(mon), iso(today)]; }
  if (preset === 'month') return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)];
  if (preset === 'lastmonth') return [iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))];
  return [iso(addDays(today, -29)), iso(today)];
}

/* when a ticket was opened, read from its id; null if the id has no date */
export function openedOn(t) {
  const m = /^[A-Z](\d{4})(\d{2})(\d{2})\./.exec(String(t.id || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const within = (date, from, to) => !!date && date >= from && date <= to;
const hoursIn = (t, from, to) => (t.log || []).reduce((a, e) => a + (within(e.date, from, to) ? +e.hours || 0 : 0), 0);

const parse = (str) => { const [y, m, dd] = str.split('-').map(Number); return new Date(y, m - 1, dd); };
const mondayOf = (str) => { const x = parse(str); return addDays(x, -((x.getDay() + 6) % 7)); };

/* one bucket per week (Monday to Sunday) from the week containing `from` to the week containing `to`;
 * only dates inside [from, to] are counted, so the first and last weeks can be partial */
export function weekly(items, from, to) {
  const out = [], idx = new Map();
  for (let w = mondayOf(from); iso(w) <= to; w = addDays(w, 7)) { const b = { start: iso(w), opened: 0, finished: 0 }; idx.set(b.start, b); out.push(b); }
  items.forEach((t) => {
    const o = openedOn(t); if (within(o, from, to)) idx.get(iso(mondayOf(o))).opened++;
    if (t.status === 'done' && within(t.updated, from, to)) idx.get(iso(mondayOf(t.updated))).finished++;
  });
  return out;
}

/* d: the whole data file; items: the tickets in scope (the tab's filters); [from, to]: inclusive period */
export function buildReport(d, items, from, to) {
  const all = d.tickets.items, byId = new Map(all.map((t) => [t.id, t]));
  const opened = items.filter((t) => within(openedOn(t), from, to));
  const finished = items.filter((t) => t.status === 'done' && within(t.updated, from, to)).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const open = items.filter((t) => t.status !== 'done'), blocked = items.filter((t) => t.status === 'blocked');

  /* hours logged inside the period, per ticket, per project (a ticket counts toward the project it belongs to) and in total */
  const perTicket = items.map((t) => ({ t, h: hoursIn(t, from, to) })).filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
  const projHours = new Map();
  perTicket.forEach(({ t, h }) => { const p = t.type === 'project' ? t : byId.get(t.project); if (p) projHours.set(p.id, (projHours.get(p.id) || 0) + h); });
  const projects = items.filter((t) => t.type === 'project').map((p) => {
    const its = all.filter((x) => x.project === p.id && x.decision !== 'rejected');
    return { p, total: its.length, done: its.filter((x) => x.status === 'done').length, hoursTotal: its.reduce((a, x) => a + hoursOf(x), hoursOf(p)), hoursPeriod: projHours.get(p.id) || 0 };
  });

  const departments = groupByDepartment(d, items).map((g) => ({
    id: g.id, name: g.name, opened: g.items.filter((t) => within(openedOn(t), from, to)).length,
    finished: g.items.filter((t) => t.status === 'done' && within(t.updated, from, to)).length,
    open: g.items.filter((t) => t.status !== 'done').length, blocked: g.items.filter((t) => t.status === 'blocked').length,
    hours: g.items.reduce((a, t) => a + hoursIn(t, from, to), 0),
  }));

  return {
    from, to, scope: items.length,
    totals: { opened: opened.length, finished: finished.length, open: open.length, blocked: blocked.length, hours: perTicket.reduce((a, x) => a + x.h, 0) },
    finished, blocked, projects, perTicket, departments, weeks: weekly(items, from, to),
    about: (t) => targetOf(d, t)?.name || '',
  };
}

/* the period as text, for the heading */
export const periodLabel = (from, to) => (from === to ? from : `${from} to ${to}`);
