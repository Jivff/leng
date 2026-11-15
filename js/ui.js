export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtDate = (t) => (t && isFinite(t) ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'n/a');
export const fmtMonth = (t) => (t && isFinite(t) ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'n/a');
export const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
export const go = (hash) => { location.hash = hash; };
export function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
/** Delegate clicks on [data-act] elements inside root. */
export function on(root, handlers) {
  // one handler per root: binding again replaces the previous view's handlers
  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (el && root.contains(el) && handlers[el.dataset.act]) handlers[el.dataset.act](el, e);
  };
}

// ---- tiny inline SVG charts ----
export function bars(values, { h = 64, max, line, color = 'var(--accent)', title = (v) => v } = {}) {
  const n = values.length; const m = Math.max(max || 0, line || 0, ...values, 1); const bw = 100 / n;
  const rects = values.map((v, i) => { const bh = (v / m) * (h - 4); return `<rect x="${(i * bw + bw * 0.15).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(bw * 0.7).toFixed(2)}" height="${Math.max(bh, v > 0 ? 1 : 0).toFixed(2)}" rx="0.8" fill="${color}"><title>${esc(title(v, i))}</title></rect>`; }).join('');
  const l = line ? `<line x1="0" x2="100" y1="${(h - (line / m) * (h - 4)).toFixed(2)}" y2="${(h - (line / m) * (h - 4)).toFixed(2)}" stroke="var(--muted)" stroke-width="0.6" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>` : '';
  return `<svg class="chart" viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="height:${h}px">${rects}${l}</svg>`;
}
export function meter(frac, { target, color = 'var(--accent)' } = {}) {
  const f = Math.max(0, Math.min(1, frac || 0));
  return `<div class="meter"><div class="meter-fill" style="width:${(f * 100).toFixed(1)}%;background:${color}"></div>${target != null ? `<div class="meter-target" style="left:${(Math.min(1, target) * 100).toFixed(1)}%"></div>` : ''}</div>`;
}
/** Step line for level history. points: [{x (ms), y (0..6)}] */
export function levelLine(points, labels, targetY) {
  if (!points.length) return '<p class="muted">No assessments yet.</p>';
  const W = 300, H = 110, pl = 26, pr = 8, pt = 8, pb = 16; const ys = labels.length - 1;
  const x0 = points[0].x, x1 = Math.max(points[points.length - 1].x, x0 + 1);
  const X = (x) => pl + ((x - x0) / (x1 - x0)) * (W - pl - pr) * (points.length > 1 ? 1 : 0);
  const Y = (y) => pt + (1 - y / ys) * (H - pt - pb);
  const grid = labels.map((l, i) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(i)}" y2="${Y(i)}" stroke="var(--line)" stroke-width="1"/><text x="2" y="${Y(i) + 3}" font-size="9" fill="var(--muted)">${l}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const dots = points.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"><title>${esc(labels[p.y])} · ${fmtDate(p.x)}</title></circle>`).join('');
  const tgt = targetY != null ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(targetY)}" y2="${Y(targetY)}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="4 3"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:${H}px">${grid}${tgt}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}<text x="${pl}" y="${H - 3}" font-size="9" fill="var(--muted)">${fmtMonth(x0)}</text><text x="${W - pr}" y="${H - 3}" font-size="9" text-anchor="end" fill="var(--muted)">${fmtMonth(x1)}</text></svg>`;
}
