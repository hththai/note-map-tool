import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecords } from '../lib/records.js';
import { validate } from '../lib/schema.js';
import { countIdMismatches } from '../lib/ops.js';
import { useModals } from './modals/ModalHost.jsx';

/* The gear beside the map title: Check map… and AI settings…. A count shows when the open map has problems to look at. */
export default function MapMenu() {
  const { data } = useRecords(), { open } = useModals(), [shown, setShown] = useState(false), box = useRef(null);
  const n = useMemo(() => (data ? countIdMismatches(data) + validate(data).length : 0), [data]);
  useEffect(() => {
    if (!shown) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setShown(false); }, esc = (e) => { if (e.key === 'Escape') setShown(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [shown]);
  const go = (kind) => { setShown(false); open(kind); };
  const item = 'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100';
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={n ? `Map settings (${n} to check)` : 'Map settings'} aria-haspopup="menu" aria-expanded={shown} title="Map settings" onClick={() => setShown(!shown)}
        className="relative grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
        {n > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">{n}</span>}
      </button>
      {shown && (
        <div role="menu" className="absolute right-0 top-8 z-30 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => go('check')}>Check map…{n > 0 && <span className="rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700">{n}</span>}</button>
          <button type="button" role="menuitem" className={item} onClick={() => go('ai')}>AI settings…</button>
        </div>
      )}
    </div>
  );
}
