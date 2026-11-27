/* Where the boxes of a generated diagram go, for each chart type. The app does this, not the AI, so there are no overlapping boxes, changing the chart type
 * is instant, and the same answer always looks the same. Pure: input is the checked answer's steps ({ title, kind, note, sheet, waits: [{ on, msg }] }),
 * output is one { x, y, w, h, shape } per step. */

export const CHART_TYPES = {
  swimlane: 'Swimlane (a lane per team)',
  flowchart: 'Flowchart (one column)',
  waterfall: 'Waterfall (stages in a staircase)',
  entity: 'Entity diagram',
};

const GAP = { x: 50, y: 60 }, MARGIN = 40;

/* how far a step is from the start: 0 when it waits on nothing, else one more than the furthest step it waits on */
export function ranks(steps) {
  const r = [];
  steps.forEach((s, i) => { r[i] = Math.max(-1, ...(s.waits || []).filter((w) => w.on < i).map((w) => r[w.on])) + 1; });
  return r;
}

/* a decision is a diamond, a start or end is a pill, an entity grows with its lines, the rest are plain boxes */
export function sizeOf(st, chart) {
  if (chart === 'entity') { const lines = String(st.note || '').split('\n').filter(Boolean).length; return { w: 210, h: Math.max(100, 44 + Math.max(2, lines) * 18 + (st.sheet || st.sheetName ? 22 : 0)), shape: 'entity' }; }
  if (st.kind === 'decision') return { w: 200, h: 96, shape: 'diamond' };
  if (st.kind === 'start' || st.kind === 'end') return { w: 170, h: 60, shape: 'pill' };
  return { w: 180, h: 74, shape: 'rounded' };
}

export function layoutSteps(steps, chart) {
  const size = steps.map((s) => sizeOf(s, chart)), rank = ranks(steps), out = steps.map(() => ({}));
  if (chart === 'waterfall') {
    /* each stage a step to the right and a step down from the one before: a staircase */
    let y = MARGIN;
    steps.forEach((_, i) => { out[i] = { x: MARGIN + i * 150, y, ...size[i] }; y += size[i].h + 26; });
  } else if (chart === 'entity') {
    /* columns by rank, left to right; each column stacked and centred against the tallest one */
    const cols = []; steps.forEach((_, i) => (cols[rank[i]] ||= []).push(i));
    const heights = cols.map((c) => c.reduce((n, i) => n + size[i].h, 0) + (c.length - 1) * GAP.y), tallest = Math.max(...heights);
    cols.forEach((c, k) => { let y = MARGIN + (tallest - heights[k]) / 2; c.forEach((i) => { out[i] = { x: MARGIN + k * (210 + 120), y, ...size[i] }; y += size[i].h + GAP.y; }); });
  } else {
    /* flowchart (and the default): rows by rank, top to bottom; each row centred against the widest one, in the order the steps were listed */
    const rows = []; steps.forEach((_, i) => (rows[rank[i]] ||= []).push(i));
    const widths = rows.map((r) => r.reduce((n, i) => n + size[i].w, 0) + (r.length - 1) * GAP.x), widest = Math.max(...widths);
    let y = MARGIN;
    rows.forEach((r, k) => { let x = MARGIN + (widest - widths[k]) / 2; const rowH = Math.max(...r.map((i) => size[i].h)); r.forEach((i) => { out[i] = { x, y: y + (rowH - size[i].h) / 2, ...size[i] }; x += size[i].w + GAP.x; }); y += rowH + GAP.y; });
  }
  return out.map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y) }));
}

/* the lowest edge of the laid-out boxes, so free notes can go in a row underneath */
export const bottomOf = (boxes) => Math.max(0, ...boxes.map((b) => b.y + b.h));

/* A place for one new box on a canvas that already has boxes (boxes are { x, y, w, h }): beside the box it connects to if there is room (to its right, then a
 * row up or down), otherwise under everything. Never overlaps, and keeps some air around each box. */
export function freeSpot(boxes, size, anchor = null, clear = 50) {
  const hit = (x, y) => boxes.some((b) => x < b.x + b.w + clear && b.x < x + size.w + clear && y < b.y + b.h + clear && b.y < y + size.h + clear);
  if (anchor) for (let ring = 0; ring < 8; ring++) {
    const x = anchor.x + anchor.w + 70 + ring * (size.w + 70);
    for (const k of [0, 1, -1, 2, -2, 3, -3]) { const y = anchor.y + k * (size.h + 40); if (!hit(x, y)) return { x: Math.round(x), y: Math.round(y) }; }
  }
  return { x: Math.round(boxes.length ? Math.min(...boxes.map((b) => b.x)) : MARGIN), y: Math.round((boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : 0) + 70) };
}
