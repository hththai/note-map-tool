/* The page's side of the AI setup. The key and the model stay on the server (data/.ai.json); the page only learns on/off, the provider's name
 * and, when off, what to fix. Nothing here sends map data. */
export async function aiStatus() {
  try {
    const r = await fetch('/api/ai/status', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    return await r.json();
  } catch { return { on: false, provider: null, label: null, problem: 'Could not reach the local server, so AI is unavailable.' }; }
}

/* One tiny request to the provider, to prove the key works. Sends no map data. */
export async function aiTest() {
  try {
    const r = await fetch('/api/ai/test', { method: 'POST', headers: { 'X-Map-Save': '1' } });
    return await r.json();
  } catch { return { ok: false, error: 'Could not reach the local server.' }; }
}

/* Ask the server to turn a brief into a flow. The server builds the rest of what is sent (descriptions, sheet names) from the Data file on disk,
 * strips emails and ticket ids, and checks the answer. Resolves to { ok: true, flow, label } or { ok: false, error }. */
export async function aiGenerate({ mapId, title, brief, draft, instruction, flow }) {
  try {
    const r = await fetch('/api/ai/flow', { method: 'POST', headers: { 'X-Map-Save': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId, title, brief, draft, instruction, flow }) });
    return await r.json();
  } catch { return { ok: false, error: 'Could not reach the local server.' }; }
}

/* the notice is shown once per provider, then remembered in this browser (it works without storage too, it just asks every time) */
const seenKey = (provider) => `ai-notice-seen:${provider}`;
export const noticeSeen = (provider) => { try { return localStorage.getItem(seenKey(provider)) === '1'; } catch { return false; } };
export const markNoticeSeen = (provider) => { try { localStorage.setItem(seenKey(provider), '1'); } catch { /* fine */ } };

export const MAX_TEXT_CHARS = 8000; // the same limit the server enforces on the brief and the draft

/* Said before anything is sent, and reused by Generate and Ask AI. */
export const aiNotice = (label) => `When you use AI, the text you write (your brief and draft, and the Department and Function descriptions it needs) leaves this computer and goes to ${label}'s servers. Member emails, tickets and other maps are never sent. Nothing is saved until you press Save.`;
