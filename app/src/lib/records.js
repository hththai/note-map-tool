/* The open map: its Data file, what has been saved, and the undo history. Every change goes through apply(), so there is
 * one place that checks the file is still valid, tracks "unsaved", and keeps the previous copy for undo.
 * Views read the old-style model (data.js), which is re-derived from the Data file after every change. */
import { useSyncExternalStore } from 'react';
import { exportLegacy } from './export-legacy.js';
import { importLegacy } from './import-legacy.js';
import { roundTrip } from './roundtrip.js';
import { validate, emptyData, upgrade } from './schema.js';
import { loadData, loadRecords, saveFile } from './store.js';
import { setRecords } from '../data.js';

const COALESCE_MS = 2000, MAX_UNDO = 100;
let s = { name: null, data: null, baseHash: null, savedText: '', undo: [], redo: [], status: 'idle', savedAt: null, conflict: false, error: null, notice: null, rev: 0 };
const listeners = new Set();
export const subscribe = (f) => (listeners.add(f), () => listeners.delete(f));
export const getState = () => s;
export const useRecords = () => useSyncExternalStore(subscribe, getState);
const set = (patch) => { s = { ...s, ...patch, rev: s.rev + 1 }; listeners.forEach((f) => f()); };
const text = (d) => JSON.stringify(d, null, 2) + '\n';

function derive(d) { const x = exportLegacy(d); setRecords({ mapMd: x.mapMd, flowsMd: x.flowsMd, ticketsJson: x.ticketsJson }); }
export const isDirty = (st = s) => !!st.data && JSON.stringify(st.data) !== st.savedText;
export const sheetByKey = (key) => s.data?.sheets.find((x) => x.name.toLowerCase() === key);

export function openData(name, loaded, hash) {
  /* an older file is upgraded in memory only; the saved copy stays as it was until you press Save */
  const { data, changes } = upgrade(loaded);
  const bad = validate(data);
  if (bad.length) throw new Error('This data file is not valid: ' + bad.slice(0, 3).join('; '));
  derive(data);
  set({ name, data, baseHash: hash, savedText: changes.length ? JSON.stringify(loaded) : JSON.stringify(data), undo: [], redo: [], status: 'idle', conflict: false, error: null,
    notice: changes.length ? `This file was written by an earlier version and has been brought up to date (${changes.join('; ')}). Nothing is lost. Press Save to keep it; a snapshot of the old file is taken first.` : null });
}

/* fn changes a copy of the data; the copy replaces it only if it is still a valid file. Returns { ok } or { ok: false, error }. */
function tryApply(fn, { key = null } = {}) {
  const next = structuredClone(s.data);
  try { fn(next); } catch (e) { return { ok: false, error: e.message }; }
  const bad = validate(next);
  if (bad.length) { console.error('edit refused:', bad); return { ok: false, error: 'That change would break the data file, so it was not made: ' + bad[0] }; }
  const last = s.undo[s.undo.length - 1], t = Date.now(), merge = key && last && last.key === key && t - last.t < COALESCE_MS;
  const undo = merge ? s.undo.map((u, i) => (i === s.undo.length - 1 ? { ...u, t } : u)) : [...s.undo, { data: s.data, key, t }].slice(-MAX_UNDO);
  derive(next);
  set({ data: next, undo, redo: [], error: null });
  return { ok: true };
}
/* an edit from the page: a refusal shows in the banner above the page */
export function apply(fn, opts = {}) { const r = tryApply(fn, opts); if (!r.ok) set({ error: r.error }); return r.ok; }
/* an edit from a modal: apply it and write the file at once (a Snapshot is taken as always). The answer goes back to the modal:
 * { ok: true }, { ok: false, error } (nothing changed, or the write failed), or { ok: false, conflict: true } (the file changed on disk; the edit is kept in memory). */
export async function commit(fn) {
  const r = tryApply(fn); if (!r.ok) return r;
  await save();
  if (s.conflict) return { ok: false, conflict: true };
  if (s.status === 'error') return { ok: false, error: s.error || 'Could not save.' };
  return { ok: true };
}
export function undo() { if (!s.undo.length) return; const u = s.undo[s.undo.length - 1]; derive(u.data); set({ data: u.data, undo: s.undo.slice(0, -1), redo: [...s.redo, { data: s.data }] }); }
export function redo() { if (!s.redo.length) return; const r = s.redo[s.redo.length - 1]; derive(r.data); set({ data: r.data, redo: s.redo.slice(0, -1), undo: [...s.undo, { data: s.data, key: null, t: 0 }] }); }

export async function save({ force = false } = {}) {
  if (!s.data || s.status === 'saving') return;
  const snap = JSON.stringify(s.data), body = text(s.data);
  set({ status: 'saving', error: null });
  try {
    const r = await saveFile(`/data/${s.name}.json`, body, s.baseHash, { force });
    if (r.conflict) set({ status: 'idle', conflict: true });
    else set({ status: 'saved', savedAt: new Date(), baseHash: r.hash, savedText: snap, conflict: false, notice: null });
  } catch (e) { set({ status: 'error', error: e.message }); }
}
/* the file changed on disk since it was opened: keep my edits (overwrite) or take the file as it is now (reload) */
export async function resolveConflict(choice) {
  if (choice === 'overwrite') return save({ force: true });
  if (choice === 'reload') { const got = await loadData(s.name); if (got) openData(s.name, got.data, got.hash); }
  set({ conflict: false });
}

/* Maps that only exist as old files: preview the import, then create the Data file (refuses if it already exists). */
export async function previewImport(name) {
  const old = await loadRecords(name + '.md'), src = { mapMd: old.mapMd, flowsMd: old.flowsMd, ticketsJson: old.ticketsJson };
  const { data, report } = importLegacy({ ...src, source: { map: name + '.md' } });
  return { data, report, problems: roundTrip(src, data) };
}
export async function createFromLegacy(name, data) {
  const r = await saveFile(`/data/${name}.json`, text(data), null);
  if (r.conflict) throw new Error(`data/${name}.json already exists`);
  const got = await loadData(name); openData(name, got.data, got.hash);
}

/* A brand-new, empty map. The name becomes the file name, so it is kept to letters, numbers, - and _. */
export async function createMap(name, title) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new Error('Use only letters, numbers, - and _ in the file name.');
  const r = await saveFile(`/data/${name}.json`, text(emptyData(title.trim() || name)), null);
  if (r.conflict) throw new Error(`A map called "${name}" already exists.`);
  const got = await loadData(name); openData(name, got.data, got.hash);
}
