/* Draw a flow diagram as SVG (and from that as PNG), straight from the same graph the canvas shows, in the chosen skin, so what you export is what you see:
 * lanes, boxes of every shape, arrows with their labels, and sticky notes. No DOM needed for the SVG, so it is easy to test. */
import { SKINS } from './skins.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* a rough word wrap (no font metrics without a DOM): about 0.56 em per character */
function wrap(text, width, size, maxLines = 99) {
  const per = Math.max(4, Math.floor(width / (size * 0.56))), out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word; else if ((line + ' ' + word).length <= per) line += ' ' + word; else { out.push(line); line = word; }
      while (line.length > per) { out.push(line.slice(0, per)); line = line.slice(per); }
    }
    out.push(line);
  }
  const lines = out.filter((l, i) => l || i < out.length - 1); return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines[maxLines - 1].slice(0, Math.max(1, per - 1)) + '…'] : lines;
}
const textBlock = (lines, x, y, size, color, { anchor = 'middle', lh = 1.25, weight = 400 } = {}) => lines.map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${esc(l)}</text>`).join('');
const centred = (lines, cx, cy, size, color, opts = {}) => textBlock(lines, cx, cy - ((lines.length - 1) * size * 1.25) / 2 + size * 0.35, size, color, opts);

const side = (box, s) => ({ r: [box.x + box.w, box.y + box.h / 2], l: [box.x, box.y + box.h / 2], t: [box.x + box.w / 2, box.y], b: [box.x + box.w / 2, box.y + box.h] }[s]);
/* the points of an arrow: out of one side of a box and into one side of another, with a right-angle elbow */
export function route(a, b, sa, sb) {
  const [x1, y1] = side(a, sa), [x2, y2] = side(b, sb), hz = (s) => s === 'r' || s === 'l';
  if (hz(sa) && hz(sb)) { if (Math.abs(y1 - y2) < 2) return [[x1, y1], [x2, y2]]; const mx = (x1 + x2) / 2; return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]]; }
  if (!hz(sa) && !hz(sb)) {
    if (sa === sb) { const yy = (sa === 'b' ? Math.max(y1, y2) + 26 : Math.min(y1, y2) - 26); return [[x1, y1], [x1, yy], [x2, yy], [x2, y2]]; }
    if (Math.abs(x1 - x2) < 2) return [[x1, y1], [x2, y2]]; const my = (y1 + y2) / 2; return [[x1, y1], [x1, my], [x2, my], [x2, y2]];
  }
  return hz(sa) ? [[x1, y1], [x2, y1], [x2, y2]] : [[x1, y1], [x1, y2], [x2, y2]];
}
function pathOf(pts, r = 8) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1], r1 = Math.min(r, Math.hypot(x - px, y - py) / 2), r2 = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ax = x + ((px - x) / (Math.hypot(px - x, py - y) || 1)) * r1, ay = y + ((py - y) / (Math.hypot(px - x, py - y) || 1)) * r1, bx = x + ((nx - x) / (Math.hypot(nx - x, ny - y) || 1)) * r2, by = y + ((ny - y) / (Math.hypot(nx - x, ny - y) || 1)) * r2;
    d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  const [lx, ly] = pts[pts.length - 1]; return d + ` L${lx} ${ly}`;
}

/* the SVG for a graph ({ nodes, edges } as built by buildFlow or buildFree), in a skin. Returns { svg, width, height }. */
export function flowToSvg(graph, skinId = 'paper') {
  const T = SKINS[skinId] || SKINS.paper, by = new Map(graph.nodes.map((n) => [n.id, n]));
  const abs = (n) => { const p = n.parentId ? by.get(n.parentId) : null; return { x: (p?.position.x || 0) + n.position.x, y: (p?.position.y || 0) + n.position.y, w: n.width || 180, h: n.height || 74 }; };
  const boxes = new Map(graph.nodes.filter((n) => !['draft', 'notedraft'].includes(n.type)).map((n) => [n.id, abs(n)]));
  const parts = { lanes: [], edges: [], nodes: [], labels: [] }, colors = new Set(), xs = [], ys = [];
  const bound = (x, y) => { xs.push(x); ys.push(y); };
  const FONT = T.font, S = T.stroke, TH = T.thin;

  graph.nodes.forEach((n) => {
    if (!boxes.has(n.id)) return; const b = boxes.get(n.id); bound(b.x, b.y); bound(b.x + b.w, b.y + b.h);
    if (n.type === 'lane') {
      parts.lanes.push(`<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${T.laneBg}" stroke="${T.laneBorder}" stroke-width="1"/><path d="M${b.x + 110} ${b.y} V${b.y + b.h}" stroke="${T.laneBorder}"/><rect x="${b.x}" y="${b.y}" width="110" height="${b.h}" rx="8" fill="${T.laneLabelBg}" stroke="${T.laneBorder}"/>${centred(wrap(n.data.team, 94, 13, 4), b.x + 55, b.y + b.h / 2, 13, T.laneLabelText, { weight: 600 })}</g>`);
    } else if (n.type === 'note') {
      parts.nodes.push(`<g data-note="1"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${T.noteFill}" stroke="${T.noteStroke}"/>${textBlock(wrap(n.data.text, b.w - 20, 12, Math.floor((b.h - 14) / 15)), b.x + 10, b.y + 20, 12, T.noteText, { anchor: 'start', lh: 1.25 })}</g>`);
    } else if (n.type === 'step') {
      const { st, idx, kind } = n.data, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (kind === 'decision') parts.nodes.push(`<g data-step="${idx}"><polygon points="${cx},${b.y + 2} ${b.x + b.w - 2},${cy} ${cx},${b.y + b.h - 2} ${b.x + 2},${cy}" fill="${T.decisionFill}" stroke="${T.decisionStroke}" stroke-width="2"/>${centred(wrap(st.title, b.w - 76, 12, 3), cx, cy, 12, T.boxText, { weight: 700 })}</g>`);
      else if (kind === 'start' || kind === 'end') { const h = 44, k = kind === 'start' ? ['startFill', 'startStroke'] : ['endFill', 'endStroke']; parts.nodes.push(`<g data-step="${idx}"><rect x="${b.x}" y="${cy - h / 2}" width="${b.w}" height="${h}" rx="${h / 2}" fill="${T[k[0]]}" stroke="${T[k[1]]}" stroke-width="${S}"/>${centred(wrap(st.title, b.w - 28, 13, 2), cx, cy, 13, T.boxText, { weight: 700 })}</g>`); }
      else {
        const tags = [st.day, st.sheet, st.ticket].filter(Boolean).join(' · ');
        parts.nodes.push(`<g data-step="${idx}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${T.radius}" fill="${T.boxFill}" stroke="${T.boxStroke}" stroke-width="${TH}"/><circle cx="${b.x + 16}" cy="${b.y + 18}" r="8" fill="#2563eb"/><text x="${b.x + 16}" y="${b.y + 21.5}" font-size="10" fill="#fff" text-anchor="middle">${idx + 1}</text>${textBlock(wrap(st.title, b.w - 46, 13, 2), b.x + 30, b.y + 22, 13, T.boxText, { anchor: 'start', weight: 700 })}${tags ? textBlock(wrap(tags, b.w - 16, 10, 1), b.x + 10, b.y + b.h - 10, 10, T.boxText, { anchor: 'start' }) : ''}</g>`);
      }
    } else if (n.type === 'free') {
      const { st, idx, kind, shape, sheetName } = n.data, cx = b.x + b.w / 2, cy = b.y + b.h / 2, lines = wrap(st.title, b.w - 24, 13, Math.max(1, Math.floor((b.h - 12) / 17)));
      if (shape === 'entity') {
        const body = String(st.note || '').split('\n').filter((l) => l.trim()), foot = sheetName ? 20 : 0;
        parts.nodes.push(`<g data-free="${idx}" data-shape="entity"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="5" fill="${T.entityBody}" stroke="${T.entityStroke}" stroke-width="${S}"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="28" rx="5" fill="${T.entityHead}" stroke="${T.entityStroke}" stroke-width="${S}"/>${textBlock(wrap(st.title, b.w - 16, 13, 1), b.x + 8, b.y + 19, 13, T.boxText, { anchor: 'start', weight: 700 })}${textBlock(body.slice(0, Math.max(1, Math.floor((b.h - 34 - foot) / 15))).map((l) => wrap(l, b.w - 16, 11, 1)[0]), b.x + 8, b.y + 46, 11, T.boxText, { anchor: 'start', lh: 1.35 })}${sheetName ? `<rect x="${b.x}" y="${b.y + b.h - foot}" width="${b.w}" height="${foot}" fill="${T.entityHead}" stroke="${T.entityStroke}"/>${textBlock(wrap('▦ ' + sheetName, b.w - 16, 10, 1), b.x + 8, b.y + b.h - 7, 10, T.boxText, { anchor: 'start' })}` : ''}</g>`);
      } else if (kind === 'decision' || shape === 'diamond') {
        parts.nodes.push(`<g data-free="${idx}" data-shape="diamond"><polygon points="${cx},${b.y + 1} ${b.x + b.w - 1},${cy} ${cx},${b.y + b.h - 1} ${b.x + 1},${cy}" fill="${T.decisionFill}" stroke="${T.decisionStroke}" stroke-width="2"/>${centred(wrap(st.title, b.w * 0.56, 12, 3), cx, cy, 12, T.boxText, { weight: 700 })}</g>`);
      } else {
        const pill = kind === 'start' || kind === 'end' || shape === 'pill', f = kind === 'start' ? ['startFill', 'startStroke'] : kind === 'end' ? ['endFill', 'endStroke'] : ['boxFill', 'boxStroke'], rx = pill ? Math.min(b.w, b.h) / 2 : shape === 'rect' ? 0 : T.radius;
        parts.nodes.push(`<g data-free="${idx}" data-shape="${esc(shape || 'rounded')}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" fill="${T[f[0]]}" stroke="${T[f[1]]}" stroke-width="${S}"/>${centred(lines, cx, cy, 13, T.boxText, { weight: 600 })}</g>`);
      }
    }
  });

  graph.edges.forEach((e) => {
    const a = boxes.get(e.source), b = boxes.get(e.target); if (!a || !b) return;
    const noteLink = String(e.id).startsWith('nl'), sa = e.sourceHandle === 'bs' ? 'b' : e.sourceHandle || 'r', sb = e.targetHandle === 'bt' ? 'b' : e.targetHandle || (noteLink ? 't' : 'l');
    const pts = noteLink ? [side(a, sa), side(b, 't')] : route(a, b, sa, sb), color = e.style?.stroke || T.edge, dash = e.style?.strokeDasharray;
    pts.forEach(([x, y]) => bound(x, y));
    if (!noteLink) colors.add(color);
    parts.edges.push(`<path d="${pathOf(pts)}" fill="none" stroke="${color}" stroke-width="${e.style?.strokeWidth || 1.5}"${dash ? ` stroke-dasharray="${esc(dash)}"` : ''}${noteLink ? '' : ` marker-end="url(#a${[...colors].indexOf(color)})"`} data-edge="${esc(e.id)}"/>`);
    if (e.label && !noteLink) { const m = pts[Math.floor((pts.length - 1) / 2)], n2 = pts[Math.floor((pts.length - 1) / 2) + 1] || m, lx = (m[0] + n2[0]) / 2, ly = (m[1] + n2[1]) / 2, w = String(e.label).length * 6 + 10; parts.labels.push(`<g data-label="1"><rect x="${lx - w / 2}" y="${ly - 9}" width="${w}" height="17" rx="3" fill="${T.labelBg}" opacity="0.92"/>${textBlock([String(e.label)], lx, ly + 4, 11, e.labelStyle?.fill || T.labelText, { weight: e.labelStyle?.fontWeight || 400 })}</g>`); bound(lx - w / 2, ly - 9); bound(lx + w / 2, ly + 9); }
  });

  const pad = 28, minX = Math.min(0, ...xs) - pad, minY = Math.min(0, ...ys) - pad, W = Math.ceil(Math.max(...xs, 1) - minX + pad), H = Math.ceil(Math.max(...ys, 1) - minY + pad);
  const markers = [...colors].map((c, i) => `<marker id="a${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${minX} ${minY} ${W} ${H}" font-family="${esc(FONT)}" data-skin="${esc(skinId)}"><defs>${markers}</defs><rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="${T.canvas}"/>${parts.lanes.join('')}${parts.edges.join('')}${parts.nodes.join('')}${parts.labels.join('')}</svg>`;
  return { svg, width: W, height: H };
}

/* the SVG as a PNG (2x, so it stays sharp), drawn in the browser */
export function svgToPng({ svg, width, height }, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = width * scale; c.height = height * scale; const g = c.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0, width, height); c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'); };
    img.onerror = () => reject(new Error('Could not draw the diagram as an image.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export const fileSlug = (title) => String(title || 'flow').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'flow';
export function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
