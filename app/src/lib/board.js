/* Pure helpers for the ticket board and table (no DOM, runs in Node too). */
export const STATUS_LIST = [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
const RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
export const priorityOf = (t) => t.priority || 'normal';
/* urgent first; tickets of equal priority keep their file order */
export const byPriority = (list) => list.map((t, i) => [t, i]).sort((a, b) => (RANK[priorityOf(a[0])] ?? 2) - (RANK[priorityOf(b[0])] ?? 2) || a[1] - b[1]).map((x) => x[0]);
export const hoursOf = (t) => (t.log || []).reduce((a, e) => a + (+e.hours || 0), 0);
export const fmtH = (h) => `${Math.round(h * 100) / 100} h`;
export const initials = (n) => { const w = String(n || '').trim().split(/\s+/); return ((w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)) || '').toUpperCase(); };

/* counts for the summary strip, and the blocked tickets (each gets a red line) */
export function summary(items) {
  const counts = Object.fromEntries(STATUS_LIST.map(([k]) => [k, items.filter((t) => t.status === k).length]));
  return { counts, total: items.length, open: items.length - counts.done, blocked: items.filter((t) => t.status === 'blocked') };
}
/* a project's items (rejected change requests do not count), how many are done, and the hours on it and on them */
export function projectStats(items, p) {
  const its = items.filter((x) => x.project === p.id && x.decision !== 'rejected');
  return { total: its.length, done: its.filter((x) => x.status === 'done').length, hours: its.reduce((a, x) => a + hoursOf(x), hoursOf(p)) };
}
export const statsLine = (s) => [s.total && `${s.done} of ${s.total} items done`, s.hours && `⏱ ${fmtH(s.hours)}`].filter(Boolean).join(' · ');

/* what a ticket is about: 'sheet' | 'app' | 'dept' (resolved), 'orphan' (points at nothing now), or null (no target) */
export function targetOf(d, t) {
  const s = d.sheets.find((x) => x.id === t.targetId), dep = d.departments.find((x) => x.id === t.targetId);
  if (s) return { kind: s.kind, name: s.name, departmentId: s.departmentId };
  if (dep) return { kind: 'dept', name: dep.name, departmentId: dep.id };
  return t.targetId || t.targetRaw ? { kind: 'orphan', name: 'unlinked' } : null;
}
/* table groups: one per department (in map order), then apps, then everything not linked */
export function groupByDepartment(d, items) {
  const groups = d.departments.map((x) => ({ id: x.id, name: x.name, items: [] })), apps = { id: 'apps', name: 'Connected apps', items: [] }, none = { id: 'none', name: 'Not linked', items: [] };
  items.forEach((t) => {
    const id = groupIdOf(d, t), g = id === 'apps' ? apps : id === 'none' ? none : groups.find((x) => x.id === id);
    (g || none).items.push(t);
  });
  return [...groups, apps, none].filter((g) => g.items.length);
}
/* which table group a ticket falls in: a department id, 'apps', or 'none' (also the filter value for "Department") */
export function groupIdOf(d, t) {
  const tg = targetOf(d, t);
  return tg?.departmentId && d.departments.some((x) => x.id === tg.departmentId) ? tg.departmentId : tg?.kind === 'app' ? 'apps' : 'none';
}
