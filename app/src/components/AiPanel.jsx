import { useEffect, useState } from 'react';
import { aiStatus, aiTest, aiNotice } from '../lib/ai.js';
import { btn, quiet } from './modals/Modal.jsx';

const EXAMPLE = '{\n  "provider": "claude",\n  "apiKey": "paste your key here"\n}';

/* The AI settings: is it on, which provider, and a Test connection button. The key itself is never shown (it lives in data/.ai.json). */
export default function AiPanel({ onClose }) {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  useEffect(() => { aiStatus().then(setSt); }, []);
  const test = async () => { setBusy(true); setResult(null); setResult(await aiTest()); setBusy(false); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="AI" className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">AI</h2><button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={onClose}>×</button></div>
        {!st && <p className="text-sm text-slate-500">Checking…</p>}
        {st?.on && (<>
          <p className="text-sm" aria-label="AI status"><b>On.</b> Provider: <b>{st.label}</b>. The key is read from <code>data/.ai.json</code> on this computer and is never sent to the page.</p>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700" aria-label="AI notice">{aiNotice(st.label)}</p>
          <div className="mt-3 flex items-center gap-3"><button type="button" className={quiet} onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test connection'}</button>
            {result?.ok && <span role="status" className="text-sm text-green-700">Works: {result.label} answered.</span>}
            {result && !result.ok && <span role="alert" className="text-sm text-red-700">{result.error}</span>}</div>
        </>)}
        {st && !st.on && (<>
          <p className="text-sm" aria-label="AI status"><b>Off.</b> {st.problem}</p>
          <p className="mt-3 text-sm text-slate-600">Create <code>data/.ai.json</code> next to your Data files (it is gitignored and never shown in the page). Use <code>"claude"</code> or <code>"deepseek"</code> as the provider, then restart or reopen this panel:</p>
          <pre className="mt-2 rounded-lg bg-slate-100 p-3 text-xs">{EXAMPLE}</pre>
        </>)}
        <div className="mt-4 flex justify-end"><button type="button" className={`${btn} border-slate-300 bg-white`} onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
