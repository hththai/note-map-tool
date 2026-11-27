/* Skins for a flow diagram: colour, line weight, corner radius and font, and nothing else. A skin never changes data. The same tokens style the diagram on
 * screen (as CSS variables on the canvas, read by the boxes) and the exported SVG and PNG, so an exported image matches what you see. */
export const SKINS = {
  paper: { label: 'Paper', dark: false, canvas: '#ffffff', dot: '#e2e8f0', laneBg: 'rgba(255,255,255,0.7)', laneBorder: '#cbd5e1', laneLabelBg: '#e2e8f0', laneLabelText: '#0f172a',
    boxFill: '#eff6ff', boxStroke: '#93c5fd', boxText: '#0f172a', startFill: '#d1fae5', startStroke: '#10b981', endFill: '#e2e8f0', endStroke: '#475569', decisionFill: '#fef3c7', decisionStroke: '#f59e0b',
    entityHead: '#e0e7ff', entityStroke: '#818cf8', entityBody: '#ffffff', noteFill: '#fef08a', noteStroke: '#eab308', noteText: '#1c1917', edge: '#475569', handoff: '#0b6bcb', back: '#b3261e',
    labelBg: '#ffffff', labelText: '#0f172a', font: "'IBM Plex Sans', system-ui, sans-serif", radius: 10, stroke: 2, thin: 1 },
  blueprint: { label: 'Blueprint', dark: true, canvas: '#0b2545', dot: '#1d4373', laneBg: 'rgba(255,255,255,0.04)', laneBorder: '#3b6aa3', laneLabelBg: '#13315c', laneLabelText: '#dbeafe',
    boxFill: '#0f3b73', boxStroke: '#7fb2ff', boxText: '#e6f0ff', startFill: '#0d5c4a', startStroke: '#5eead4', endFill: '#1e3a5f', endStroke: '#bfdbfe', decisionFill: '#5b4a14', decisionStroke: '#fcd34d',
    entityHead: '#1d4f91', entityStroke: '#7fb2ff', entityBody: '#0b2f5e', noteFill: '#27598f', noteStroke: '#9cc4ff', noteText: '#f0f6ff', edge: '#a9c7f5', handoff: '#7fb2ff', back: '#ff9b9b',
    labelBg: '#0b2545', labelText: '#e6f0ff', font: "'IBM Plex Mono', ui-monospace, Menlo, monospace", radius: 3, stroke: 1.5, thin: 1 },
  marker: { label: 'Marker', dark: false, canvas: '#fffbeb', dot: '#fde68a', laneBg: 'rgba(255,255,255,0.55)', laneBorder: '#111827', laneLabelBg: '#fde047', laneLabelText: '#111827',
    boxFill: '#ffffff', boxStroke: '#111827', boxText: '#111827', startFill: '#86efac', startStroke: '#111827', endFill: '#fca5a5', endStroke: '#111827', decisionFill: '#fde68a', decisionStroke: '#111827',
    entityHead: '#a5b4fc', entityStroke: '#111827', entityBody: '#ffffff', noteFill: '#fdba74', noteStroke: '#111827', noteText: '#111827', edge: '#111827', handoff: '#1d4ed8', back: '#dc2626',
    labelBg: '#fffbeb', labelText: '#111827', font: "'Comic Sans MS', 'Marker Felt', 'Bradley Hand', cursive", radius: 16, stroke: 3, thin: 2.5 },
};
export const SKIN_IDS = Object.keys(SKINS);

/* a CSS value for one token: the skin's variable on the canvas, falling back to Paper so a box shown outside a skinned canvas still looks right */
export const sk = (key) => `var(--sk-${key}, ${SKINS.paper[key]})`;

/* the CSS variables a canvas sets for a skin (px for the numbers) */
export function skinVars(skin) {
  const t = SKINS[skin] || SKINS.paper, v = {};
  for (const [k, val] of Object.entries(t)) if (k !== 'label' && k !== 'dark') v['--sk-' + k] = typeof val === 'number' ? val + 'px' : val;
  /* React Flow's own variables (grid, edge labels), so its built-ins follow the skin too */
  v['--xy-background-color'] = t.canvas; v['--xy-edge-label-background-color'] = t.labelBg; v['--xy-edge-label-color'] = t.labelText;
  v['--xy-edge-label-background-color-default'] = t.labelBg; v['--xy-edge-label-color-default'] = t.labelText; v['--xy-background-color-default'] = t.canvas;
  return v;
}

/* the chosen skin is a per-viewer convenience, kept in this browser only (it works without storage too) */
const KEY = 'flow-skin';
export const loadSkin = () => { try { const s = localStorage.getItem(KEY); return SKINS[s] ? s : 'paper'; } catch { return 'paper'; } };
export const saveSkin = (s) => { try { localStorage.setItem(KEY, s); } catch { /* fine */ } };
