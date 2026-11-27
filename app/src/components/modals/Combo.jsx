import { useState } from 'react';
import { rank } from '../../lib/pick.js';
import { field } from './Modal.jsx';

/* One type-to-filter box instead of a long list. Arrow keys and Enter pick; the last one used comes first. */
export default function Combo({ label, options, value, onChange, recent = null, placeholder = 'Type to search…', autoFocus = false }) {
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [hi, setHi] = useState(0);
  const chosen = options.find((o) => o.value === value), shown = rank(options, q, recent).slice(0, 8);
  const pick = (o) => { onChange(o.value); setOpen(false); setQ(''); };
  return (
    <div className="relative">
      <input role="combobox" aria-expanded={open} aria-label={label} aria-autocomplete="list" autoFocus={autoFocus} className={field} placeholder={placeholder} autoComplete="off"
        value={open ? q : chosen ? chosen.label : ''}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); }} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
        }} />
      {open && (
        <ul role="listbox" aria-label={`${label} choices`} className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg">
          {shown.length ? shown.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm ${i === hi ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
                <span>{o.label}</span>{o.hint && <span className="text-xs text-slate-400">{o.hint}</span>}
              </button>
            </li>
          )) : <li className="px-2 py-1 text-sm text-slate-400">Nothing matches</li>}
        </ul>
      )}
    </div>
  );
}
