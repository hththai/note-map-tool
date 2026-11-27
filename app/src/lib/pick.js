/* Pure helpers for the pickers and the New map name. No DOM, runs in Node too. */

/* every Function as "Department › Function", the choices of the file picker */
export const functionOptions = (d) => d.departments.flatMap((dep) => dep.sections.map((sec) => ({ value: sec.id, label: `${dep.name} › ${sec.title || '(untitled)'}`, hint: '' })));
export const sheetOptions = (d) => d.sheets.map((s) => ({ value: s.id, label: s.name, hint: s.kind === 'app' ? 'App' : d.departments.find((x) => x.id === s.departmentId)?.name || '' }));

/* type-to-filter: every typed word must appear in the label (any order, any case). Best first: the last one used, then labels that start with the text, then the rest in order. */
export function rank(options, query, recent = null) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), q = words.join(' ');
  return options.map((o, i) => [o, i]).filter(([o]) => words.every((w) => (o.label + ' ' + (o.hint || '')).toLowerCase().includes(w)))
    .sort((a, b) => (b[0].value === recent) - (a[0].value === recent) || (b[0].label.toLowerCase().startsWith(q) && !!q) - (a[0].label.toLowerCase().startsWith(q) && !!q) || a[1] - b[1]).map(([o]) => o);
}

/* a file name for a new map made from its title: letters, numbers and dashes, at most 40 long; "-2", "-3"... if taken */
export function slugFromTitle(title, taken = []) {
  const base = String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '') || 'map', used = new Set(taken.map((x) => x.toLowerCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
