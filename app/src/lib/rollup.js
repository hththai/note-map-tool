/* Read-only questions about people and open work, answered from the Data file. Nothing here is stored: "current tickets" are the
 * Tickets whose Target is the file and whose status is not done, so they can never go stale. Pure: no DOM, runs in Node too. */
export const isOpen = (t) => t.status !== 'done';
const low = (s) => String(s || '').trim().toLowerCase();

export const openTicketsForSheet = (d, sheetId) => d.tickets.items.filter((t) => t.targetId === sheetId && isOpen(t));
/* a Function (Section) counts only its files' tickets */
export const openTicketsForSection = (d, sectionId) => d.sheets.filter((s) => s.sectionId === sectionId).flatMap((s) => openTicketsForSheet(d, s.id));
/* a Department counts tickets aimed at it directly plus those of all its files */
export const openTicketsForDepartment = (d, depId) => [
  ...d.tickets.items.filter((t) => t.targetId === depId && isOpen(t)),
  ...d.sheets.filter((s) => s.departmentId === depId).flatMap((s) => openTicketsForSheet(d, s.id)),
];
export const membersOf = (d, depId) => d.departments.find((x) => x.id === depId)?.members || [];
/* 'none' = no owner written, 'member' = the name matches a member of the file's department, 'other' = free text */
export function ownerStatus(d, sheet) {
  if (!low(sheet.owner)) return 'none';
  return membersOf(d, sheet.departmentId).some((m) => low(m.name) === low(sheet.owner)) ? 'member' : 'other';
}
/* names the Owner pick-list offers: the members of the department a Target belongs to (a file's or the department itself), or everyone if it has none */
export function memberNamesFor(d, targetId) {
  const sheet = d.sheets.find((x) => x.id === targetId), depId = sheet ? sheet.departmentId : d.departments.some((x) => x.id === targetId) ? targetId : null;
  const list = depId ? membersOf(d, depId) : d.departments.flatMap((x) => x.members || []);
  return [...new Set(list.map((m) => m.name))];
}
