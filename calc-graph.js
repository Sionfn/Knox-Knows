// calc-graph.js — Graph mode of the Knox Calculator (Dec 2026).
//
// A Desmos-style grapher in the Knox look: type up to 6 equations (y = 2x + 1,
// y = a x² + b x + c, x = 3, sin(x)…), each in its own color; drag to move,
// scroll or pinch to zoom; letters get sliders; tap a curve to trace it, and
// the x-intercepts, y-intercept, highs, lows and crossing points of the curve
// you're on show as dots you can tap for their coordinates.
// Equations are read by the Simulation Lab's math reader
// (window.knoxSimLab.parseMath), so "2x", "ax^2" and "sin x" all work.
//   window.KnoxGraph = { mount(el, { send }), show(), set(list), state, specialPoints }
(function () {
  'use strict';
  const COLORS = ['#FF6B00', '#1CB0F6', '#1FA45A', '#A560F2', '#E5383B', '#14B8A6'];
  const MAX_ROWS = 6, KEY = 'knoxGraph.v1';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  };
  const saved = store.get();
  const st = {
    rows: Array.isArray(saved?.rows) && saved.rows.length ? saved.rows.slice(0, MAX_ROWS).map(r => ({ text: String(r.text || '').slice(0, 120), hidden: !!r.hidden })) : [{ text: 'y = 2x + 1' }, { text: 'y = x² − 3' }],
    sliders: saved?.sliders && typeof saved.sliders === 'object' ? saved.sliders : {},
    deg: !!saved?.deg,
  };
  const save = () => store.set({ rows: st.rows.map(r => ({ text: r.text, hidden: !!r.hidden })), sliders: st.sliders, deg: st.deg });
  const HOME = { cx: 0, cy: 0, k: 0 }; // k 0 = "fit about −10…10 across"
  let view = { ...HOME }, active = 0, pin = null, host = null, canvas = null, g = null, send = null, compiled = [], lastFocus = null, raf = 0;

  // ── Reading equations ──────────────────────────────────────────────────
  function compile(text) {
    // "a sin(bx)" is a × sin(bx), not arcsine: a space before a function name means times.
    const raw = String(text || '').trim().replace(/√/g, 'sqrt').replace(/([a-z0-9)²³])\s+(?=(?:sin|cos|tan|sqrt|abs|ln|log|exp)\b)/gi, '$1*');
    if (!raw) return null;
    const P = window.knoxSimLab?.parseMath;
    if (!P) return { error: 'The grapher is still loading — try again in a second.' };
    try {
      const vert = /^\s*x\s*=\s*(.+)$/i.exec(raw);
      if (vert) {
        const m = P(vert[1], { deg: st.deg });
        if (m.vars.has('x') || m.vars.has('y')) throw new Error('For a straight up-and-down line, write x = a number (like x = 3)');
        return { kind: 'x', m, vars: m.vars };
      }
      const src = raw.replace(/^\s*(?:y|[fgh]\s*\(\s*x\s*\))\s*=\s*/i, '');
      if (/[=<>≤≥]/.test(src)) throw new Error('Write it as y = … (one = sign, x on the other side)');
      const m = P(src, { deg: st.deg });
      if (m.vars.has('y')) throw new Error('Write it as y = … with only x on the other side');
      return { kind: 'y', m, vars: m.vars };
    } catch (e) { return { error: e.message || 'Knox can’t read that one yet' }; }
  }
  const letters = () => [...new Set(compiled.flatMap(c => c && !c.error ? [...c.vars].filter(v => v !== 'x' && v !== 'y') : []))].sort();
  const env = () => Object.fromEntries(letters().map(L => [L, Number.isFinite(st.sliders[L]) ? st.sliders[L] : 1]));
  function fnOf(i) {
    const c = compiled[i];
    if (!c || c.error || st.rows[i]?.hidden) return null;
    const e = env();
    if (c.kind === 'x') { const v = c.m.f(e); return Number.isFinite(v) ? { kind: 'x', at: v } : null; }
    return { kind: 'y', f: x => { e.x = x; const y = c.m.f(e); return Number.isFinite(y) ? y : NaN; } };
  }

  // ── Special points (also used by the tests) ─────────────────────────────
  const tidy = v => { const r = Math.round(v * 1e6) / 1e6; return Math.abs(r - Math.round(r)) < 1e-6 ? Math.round(r) : r; };
  function bisect(f, a, b, fa) {
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2, fm = f(m); if (!Number.isFinite(fm)) return null; if (fm === 0) return m; if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; }
    return (a + b) / 2;
  }
  function golden(f, a, b, max) {
    const r = (Math.sqrt(5) - 1) / 2; let c = b - r * (b - a), d = a + r * (b - a);
    for (let i = 0; i < 70; i++) { const fc = f(c), fd = f(d); if (max ? fc > fd : fc < fd) { b = d; d = c; c = b - r * (b - a); } else { a = c; c = d; d = a + r * (b - a); } }
    const x = (a + b) / 2, y = f(x); return Number.isFinite(y) ? { x, y } : null;
  }
  // Zeros of f in [x0, x1]: sign changes, refined, and never an asymptote (tan, 1/x).
  function zeros(f, x0, x1, n = 900) {
    const out = [], dx = (x1 - x0) / n; let px = x0, py = f(px);
    for (let i = 1; i <= n; i++) {
      const x = x0 + i * dx, y = f(x);
      if (Number.isFinite(py) && Number.isFinite(y)) {
        if (py === 0) out.push(px);
        else if (py * y < 0) { const r = bisect(f, px, x, py); if (r != null && Math.abs(f(r)) <= 1e-7 * Math.max(1, Math.abs(py), Math.abs(y))) out.push(r); }
      }
      px = x; py = y;
    }
    if (Number.isFinite(py) && py === 0) out.push(px);
    return out;
  }
  function specialPoints(f, x0, x1, others = []) {
    const pts = [], n = 900, dx = (x1 - x0) / n;
    if (x0 <= 0 && x1 >= 0) { const y = f(0); if (Number.isFinite(y)) pts.push({ x: 0, y, kind: 'y-intercept' }); }
    for (const x of zeros(f, x0, x1, n)) pts.push({ x, y: 0, kind: 'x-intercept' });
    let px = x0, py = f(px), pd = null;
    for (let i = 1; i <= n; i++) {
      const x = x0 + i * dx, y = f(x);
      if (Number.isFinite(py) && Number.isFinite(y)) {
        const d = y - py;
        if (pd !== null && d !== 0 && pd * d < 0) { const e = golden(f, px - dx, x, pd > 0); if (e && Math.abs(e.y) < 1e12) pts.push({ ...e, kind: pd > 0 ? 'high point' : 'low point' }); }
        if (d !== 0) pd = d;
      } else pd = null;
      px = x; py = y;
    }
    for (const o of others) {
      if (o.kind === 'x') { if (o.at >= x0 && o.at <= x1) { const y = f(o.at); if (Number.isFinite(y)) pts.push({ x: o.at, y, kind: 'crossing' }); } continue; }
      for (const x of zeros(t => f(t) - o.f(t), x0, x1, n)) { const y = f(x); if (Number.isFinite(y)) pts.push({ x, y, kind: 'crossing' }); }
    }
    // One dot per spot; a spot that's two things says both ("y-intercept · low point").
    const out = [];
    for (const p of pts) {
      const same = out.find(q => Math.abs(q.x - p.x) < (x1 - x0) * 1e-4 && Math.abs(q.y - p.y) < (x1 - x0) * 1e-4);
      if (!same) out.push({ x: tidy(p.x), y: tidy(p.y), kind: p.kind });
      else if (!same.kind.split(' · ').includes(p.kind)) same.kind += ' · ' + p.kind;
    }
    return out.slice(0, 60);
  }

  // ── Drawing ────────────────────────────────────────────────────────────
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const niceStep = span => { const raw = span, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
  const label = v => { const r = Math.round(v * 1e9) / 1e9; return Math.abs(r) >= 1e5 || (Math.abs(r) < 1e-3 && r !== 0) ? r.toExponential(1).replace('e+', 'e') : String(r); };
  const coord = v => { const r = tidy(v); return Math.abs(r) >= 1e6 ? r.toExponential(3) : String(Math.round(r * 1000) / 1000); };
  function geom() {
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 400;
    if (!view.k) view.k = W / 20; // about −10…10 across
    const X = x => W / 2 + (x - view.cx) * view.k, Y = y => H / 2 - (y - view.cy) * view.k;
    return { W, H, X, Y, x0: view.cx - W / 2 / view.k, x1: view.cx + W / 2 / view.k, y0: view.cy - H / 2 / view.k, y1: view.cy + H / 2 / view.k };
  }
  function draw() {
    raf = 0;
    if (!canvas || !canvas.isConnected) return;
    const { W, H, X, Y, x0, x1, y0, y1 } = geom(), dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const text = css('--text') || '#3C3C3C', light = css('--text-light') || '#8A8A8A', surface = css('--surface') || '#FFFFFF';
    // Grid: light minor lines, darker major lines, then the axes.
    const major = niceStep(90 / view.k), m = major / 10 ** Math.floor(Math.log10(major) + 1e-9), minor = major / (Math.round(m) === 2 ? 4 : 5);
    const lines = (step, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) { const p = Math.round(X(v)) + .5; g.moveTo(p, 0); g.lineTo(p, H); } for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) { const p = Math.round(Y(v)) + .5; g.moveTo(0, p); g.lineTo(W, p); } g.stroke(); };
    lines(minor, dark ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.045)', 1);
    lines(major, dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)', 1);
    const ax = Math.min(Math.max(X(0), 0), W), ay = Math.min(Math.max(Y(0), 0), H);
    g.strokeStyle = dark ? '#7F8FA6' : '#6E6A66'; g.lineWidth = 1.6; g.beginPath();
    if (x0 <= 0 && x1 >= 0) { g.moveTo(X(0), 0); g.lineTo(X(0), H); }
    if (y0 <= 0 && y1 >= 0) { g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); }
    g.stroke();
    // Numbers along the axes (along the edge when an axis is off screen).
    g.font = '800 11px Nunito, system-ui, sans-serif'; g.fillStyle = light; g.lineWidth = 3; g.strokeStyle = surface;
    const tag = (t, x, y, al, base) => { g.textAlign = al; g.textBaseline = base; g.strokeText(t, x, y); g.fillText(t, x, y); };
    const yLab = Math.min(Math.max(ay + 5, 4), H - 16), xLab = Math.min(Math.max(ax - 5, 30), W - 4);
    for (let v = Math.ceil(x0 / major) * major; v <= x1; v += major) if (Math.abs(v) > major / 1e6 && X(v) > 14 && X(v) < W - 14) tag(label(v), X(v), yLab, 'center', 'top');
    for (let v = Math.ceil(y0 / major) * major; v <= y1; v += major) if (Math.abs(v) > major / 1e6 && Y(v) > 10 && Y(v) < H - 10) tag(label(v), xLab, Y(v), 'right', 'middle');
    if (x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0) tag('0', X(0) - 5, Y(0) + 5, 'right', 'top');
    // Curves.
    const fns = st.rows.map((_, i) => fnOf(i));
    fns.forEach((fn, i) => {
      if (!fn) return;
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = i === active ? 3.6 : 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
      if (fn.kind === 'x') { const p = X(fn.at); g.moveTo(p, 0); g.lineTo(p, H); g.stroke(); return; }
      const n = Math.ceil(W * 2), lim = H * 4; let pen = false, prev = NaN;
      for (let s = 0; s <= n; s++) {
        const x = x0 + (x1 - x0) * s / n, y = fn.f(x);
        if (!Number.isFinite(y)) { pen = false; prev = NaN; continue; }
        const py = Y(y);
        // A huge jump between neighbours is an asymptote (tan, 1/x): lift the pen.
        if (pen && Number.isFinite(prev) && Math.abs(py - prev) > H * 1.2 && (py < 0 || py > H || prev < 0 || prev > H)) pen = false;
        const cy = Math.max(-lim, Math.min(H + lim, py));
        pen ? g.lineTo(X(x), cy) : g.moveTo(X(x), cy); pen = true; prev = py;
      }
      g.stroke();
    });
    // The special points of the curve you're on (grey rings), and the one you tapped.
    const cur = fns[active];
    const pts = cur && cur.kind === 'y' ? specialPoints(cur.f, x0, x1, fns.filter((f, j) => f && j !== active)) : [];
    host._pts = pts;
    for (const p of pts) { if (p.y < y0 || p.y > y1) continue; g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, Math.PI * 2); g.fillStyle = surface; g.fill(); g.lineWidth = 2.5; g.strokeStyle = dark ? '#9AA6B8' : '#8A8580'; g.stroke(); }
    if (pin && Number.isFinite(pin.y)) {
      const px = X(pin.x), py = Y(pin.y), col = COLORS[pin.row % COLORS.length];
      g.beginPath(); g.arc(px, py, 6.5, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = surface; g.stroke();
      const t = `(${coord(pin.x)}, ${coord(pin.y)})`, sub = pin.kind || '';
      g.font = '900 13px Nunito, system-ui, sans-serif'; const tw = g.measureText(t).width; g.font = '800 10.5px Nunito, system-ui, sans-serif'; const sw = sub ? g.measureText(sub).width : 0;
      const bw = Math.max(tw, sw) + 20, bh = sub ? 40 : 28; let bx = px + 12, by = py - bh - 10;
      if (bx + bw > W - 4) bx = px - bw - 12; if (by < 4) by = py + 12;
      g.fillStyle = surface; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 10) : g.rect(bx, by, bw, bh); g.fill(); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = text; g.font = '900 13px Nunito, system-ui, sans-serif'; g.fillText(t, bx + 10, by + 7);
      if (sub) { g.fillStyle = light; g.font = '800 10.5px Nunito, system-ui, sans-serif'; g.fillText(sub, bx + 10, by + 24); }
    }
    const shown = st.rows.map((r, i) => fns[i] ? r.text.trim() : '').filter(Boolean);
    canvas.setAttribute('aria-label', shown.length ? 'Graph of ' + shown.join(', ') + (pts.length ? '. ' + pts.slice(0, 8).map(p => `${p.kind} at (${coord(p.x)}, ${coord(p.y)})`).join('; ') : '') : 'An empty graph');
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // ── The panel ──────────────────────────────────────────────────────────
  const HELP = [['x', 'x'], ['²', '²'], ['^', '^'], ['√', 'sqrt('], ['π', 'π'], ['sin', 'sin('], ['cos', 'cos('], ['(', '('], [')', ')']];
  function rowsHtml() {
    return st.rows.map((r, i) => `<div class="kg-row${i === active ? ' on' : ''}" data-row="${i}" style="--c:${COLORS[i % COLORS.length]}">
        <button type="button" class="kg-dot${r.hidden ? ' off' : ''}" data-act="toggle" aria-label="${r.hidden ? 'Show' : 'Hide'} this graph" aria-pressed="${!r.hidden}"></button>
        <input class="kg-in" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120" value="${esc(r.text)}" placeholder="y = 2x + 1" aria-label="Equation ${i + 1}">
        <button type="button" class="kg-x" data-act="remove" aria-label="Remove this equation">×</button>
        <p class="kg-err" role="alert"></p>
      </div>`).join('');
  }
  function slidersHtml() {
    const L = letters();
    if (!L.length) return '';
    return `<span class="kg-label">Sliders</span>` + L.map(k => { const v = Number.isFinite(st.sliders[k]) ? st.sliders[k] : 1;
      return `<label class="kg-slider"><span><b>${esc(k)}</b> = <output data-out="${esc(k)}">${coord(v)}</output></span><input type="range" min="-10" max="10" step="0.1" value="${v}" data-letter="${esc(k)}" aria-label="${esc(k)}" style="--p:${(v + 10) * 5}%"></label>`; }).join('');
  }
  function errors() {
    st.rows.forEach((r, i) => { const el = host.querySelector(`[data-row="${i}"] .kg-err`); if (el) el.textContent = compiled[i]?.error || ''; host.querySelector(`[data-row="${i}"]`)?.classList.toggle('bad', !!compiled[i]?.error); });
  }
  function renderPanel() {
    host.querySelector('.kg-rows').innerHTML = rowsHtml();
    host.querySelector('.kg-add').hidden = st.rows.length >= MAX_ROWS;
    host.querySelector('.kg-sliders').innerHTML = slidersHtml();
    host.querySelector('[data-act="deg"]').textContent = st.deg ? 'Degrees' : 'Radians';
    errors();
  }
  function recompile() { compiled = st.rows.map(r => compile(r.text)); }
  function syncSliders() {
    const box = host.querySelector('.kg-sliders'), want = letters().join(',');
    if (box.dataset.letters !== want) { box.innerHTML = slidersHtml(); box.dataset.letters = want; }
  }
  function mount(el, opts = {}) {
    host = el; send = opts.send || null;
    host.innerHTML = `<div class="kg">
      <div class="kg-side">
        <div class="kg-rows"></div>
        <button type="button" class="kg-add" data-act="add">+ Add an equation</button>
        <div class="kg-help" aria-label="Math keys">${HELP.map(([l, v]) => `<button type="button" class="kg-hk" data-ins="${esc(v)}" tabindex="-1">${esc(l)}</button>`).join('')}</div>
        <div class="kg-sliders"></div>
        <div class="kg-acts">
          <button type="button" class="kc-act kc-act-ask" data-act="ask">➤ Ask Knox</button>
          <button type="button" class="kc-act kc-act-main kc-act-learn" data-act="explain">💡 Explain it</button>
        </div>
      </div>
      <div class="kg-stage">
        <canvas class="kg-canvas" tabindex="0" role="img" aria-label="Graph"></canvas>
        <div class="kg-zoom">
          <button type="button" data-act="zin" aria-label="Zoom in">+</button><button type="button" data-act="zout" aria-label="Zoom out">−</button><button type="button" data-act="home" aria-label="Back to the start view">⌂</button>
        </div>
        <button type="button" class="kg-deg" data-act="deg" title="How sin, cos and tan read x"></button>
        <p class="kg-hint"${(() => { try { return localStorage.getItem('knoxGraphHint') ? ' hidden' : ''; } catch { return ''; } })()}>Drag to move · scroll or pinch to zoom · tap a curve</p>
      </div>
    </div>`;
    canvas = host.querySelector('.kg-canvas'); g = canvas.getContext('2d');
    recompile(); renderPanel();
    new ResizeObserver(redraw).observe(canvas);
    wire();
    redraw();
  }
  function show() { if (!host) return; recompile(); renderPanel(); redraw(); }
  // Graph these (from a Learn graph's "Open in Calculator").
  function set(list) {
    const rows = (Array.isArray(list) ? list : [list]).map(t => String(t || '').trim()).filter(Boolean).slice(0, MAX_ROWS);
    if (!rows.length) return;
    st.rows = rows.map(text => ({ text })); active = 0; pin = null; view = { ...HOME }; save();
    show();
  }
  function insert(text) {
    const inp = lastFocus && lastFocus.isConnected ? lastFocus : host.querySelector('.kg-in');
    if (!inp) return;
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
    if (/^[a-z]{2}/i.test(text) && /[a-z0-9)]$/i.test(inp.value.slice(0, a))) text = ' ' + text; // a + sin( → "a sin(" (times, not arcsine)
    inp.value = inp.value.slice(0, a) + text + inp.value.slice(b);
    inp.focus(); const at = a + text.length; inp.setSelectionRange(at, at);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function summary() {
    const eqs = st.rows.filter((r, i) => r.text.trim() && compiled[i] && !compiled[i].error && !r.hidden).map(r => r.text.trim());
    const vals = letters().map(L => `${L} = ${coord(Number.isFinite(st.sliders[L]) ? st.sliders[L] : 1)}`);
    return eqs.join(' and ') + (vals.length ? ` (with ${vals.join(', ')})` : '');
  }
  function zoomAt(f, sx, sy) {
    const { W, H } = geom(), wx = view.cx + (sx - W / 2) / view.k, wy = view.cy - (sy - H / 2) / view.k;
    view.k = Math.min(1e6, Math.max(1e-4, view.k * f));
    view.cx = wx - (sx - W / 2) / view.k; view.cy = wy + (sy - H / 2) / view.k; redraw();
  }
  // Which curve (or special point) is under the pointer?
  function hit(sx, sy) {
    const { X, Y } = geom();
    let near = null; for (const p of host._pts || []) { const d = Math.hypot(X(p.x) - sx, Y(p.y) - sy); if (d <= 18 && (!near || d < near.d)) near = { d, p }; }
    if (near) return { point: near.p, row: active };
    let best = null;
    st.rows.forEach((_, i) => {
      const fn = fnOf(i); if (!fn) return;
      if (fn.kind === 'x') { const d = Math.abs(X(fn.at) - sx); if (d <= 12 && (!best || d < best.d)) best = { d, row: i, x: fn.at, y: view.cy - (sy - geom().H / 2) / view.k }; return; }
      const x = view.cx + (sx - geom().W / 2) / view.k, y = fn.f(x);
      if (!Number.isFinite(y)) return;
      const d = Math.abs(Y(y) - sy); if (d <= 14 && (!best || d < best.d)) best = { d, row: i, x, y };
    });
    return best;
  }
  function wire() {
    host.addEventListener('input', e => {
      const inp = e.target.closest('.kg-in');
      if (inp) {
        const i = +inp.closest('[data-row]').dataset.row; st.rows[i].text = inp.value; active = i; pin = null;
        compiled[i] = compile(inp.value); errors(); syncSliders(); save(); redraw();
        host.querySelectorAll('.kg-row').forEach((r, j) => r.classList.toggle('on', j === i));
        return;
      }
      const s = e.target.closest('[data-letter]');
      if (s) { const L = s.dataset.letter, v = Number(s.value); st.sliders[L] = v; s.style.setProperty('--p', (v + 10) * 5 + '%'); const o = host.querySelector(`[data-out="${CSS.escape(L)}"]`); if (o) o.textContent = coord(v); if (pin) pin = null; save(); redraw(); }
    });
    host.addEventListener('focusin', e => { const inp = e.target.closest('.kg-in'); if (!inp) return; lastFocus = inp; const i = +inp.closest('[data-row]').dataset.row; if (i !== active) { active = i; pin = null; host.querySelectorAll('.kg-row').forEach((r, j) => r.classList.toggle('on', j === i)); redraw(); } });
    host.addEventListener('keydown', e => {
      const inp = e.target.closest('.kg-in');
      if (inp && e.key === 'Enter') { e.preventDefault(); const i = +inp.closest('[data-row]').dataset.row; if (i === st.rows.length - 1 && st.rows.length < MAX_ROWS && inp.value.trim()) addRow(); else host.querySelectorAll('.kg-in')[i + 1]?.focus(); }
      if (e.target === canvas) {
        const step = 60 / view.k, keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (keys[e.key]) { e.preventDefault(); view.cx += keys[e.key][0]; view.cy += keys[e.key][1]; redraw(); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.4, geom().W / 2, geom().H / 2); }
        else if (e.key === '-') { e.preventDefault(); zoomAt(1 / 1.4, geom().W / 2, geom().H / 2); }
      }
    });
    // The math keys type into the equation you were on (without stealing focus).
    host.addEventListener('pointerdown', e => { if (e.target.closest('.kg-hk')) e.preventDefault(); });
    host.addEventListener('click', e => {
      const hk = e.target.closest('[data-ins]'); if (hk) { insert(hk.dataset.ins); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act, row = b.closest('[data-row]'), i = row ? +row.dataset.row : -1;
      if (act === 'add') addRow();
      else if (act === 'remove') { st.rows.splice(i, 1); if (!st.rows.length) st.rows.push({ text: '' }); active = Math.min(active, st.rows.length - 1); pin = null; recompile(); renderPanel(); save(); redraw(); }
      else if (act === 'toggle') { st.rows[i].hidden = !st.rows[i].hidden; pin = null; renderPanel(); save(); redraw(); }
      else if (act === 'zin' || act === 'zout') { const { W, H } = geom(); zoomAt(act === 'zin' ? 1.5 : 1 / 1.5, W / 2, H / 2); }
      else if (act === 'home') { view = { ...HOME }; pin = null; redraw(); }
      else if (act === 'deg') { st.deg = !st.deg; recompile(); renderPanel(); save(); pin = null; redraw(); }
      else if ((act === 'ask' || act === 'explain') && send) {
        const what = summary();
        if (!what) { host.querySelector('.kg-in')?.focus(); return; }
        const many = summary().includes(' and ');
        send(act === 'ask' ? `I graphed ${what}. What does the graph show — where it crosses the axes, its highs and lows${many ? ', and where the graphs meet' : ''}?` : `Teach me how to graph ${what}, step by step.`, act === 'ask' ? 'send' : 'explain');
      }
    });
    // Drag to move, pinch or scroll to zoom, tap to trace.
    const ptrs = new Map(); let start = null, pinch = null, tracing = null;
    // The how-to line goes away once you've used the graph (and stays gone).
    const used = () => { const h = host.querySelector('.kg-hint'); if (h && !h.hidden) { h.hidden = true; try { localStorage.setItem('knoxGraphHint', '1'); } catch {} } };
    canvas.addEventListener('pointerdown', used); canvas.addEventListener('wheel', used, { passive: true });
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {} ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; tracing = null; start = null; return; }
      const h = hit(e.offsetX, e.offsetY);
      start = { x: e.offsetX, y: e.offsetY, cx: view.cx, cy: view.cy, moved: false, h };
      if (h && !h.point) { tracing = h.row; active = h.row; pin = { x: h.x, y: h.y, row: h.row, kind: '' }; host.querySelectorAll('.kg-row').forEach((r, j) => r.classList.toggle('on', j === h.row)); redraw(); }
    });
    canvas.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 0) zoomAt((pinch.k * d / pinch.d) / view.k, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (!start) return;
      if (Math.hypot(e.offsetX - start.x, e.offsetY - start.y) > 4) start.moved = true;
      if (tracing != null) { // slide along the curve
        const fn = fnOf(tracing); if (!fn || fn.kind !== 'y') return;
        const x = view.cx + (e.offsetX - geom().W / 2) / view.k, y = fn.f(x);
        const snap = tracing === active && (host._pts || []).find(p => Math.abs((p.x - x) * view.k) <= 8);
        if (snap) { pin = { ...snap, row: tracing }; redraw(); }
        else if (Number.isFinite(y)) { pin = { x, y, row: tracing, kind: '' }; redraw(); }
        return;
      }
      if (start.moved) { view.cx = start.cx - (e.offsetX - start.x) / view.k; view.cy = start.cy + (e.offsetY - start.y) / view.k; redraw(); }
    });
    const end = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (start && !start.moved && tracing == null) { const h = start.h; pin = h?.point ? { ...h.point, row: active } : null; redraw(); }
      if (!ptrs.size) { start = null; tracing = null; }
    };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.offsetX, e.offsetY); }, { passive: false });
  }
  function addRow() {
    if (st.rows.length >= MAX_ROWS) return;
    st.rows.push({ text: '' }); active = st.rows.length - 1; pin = null; recompile(); renderPanel(); save(); redraw();
    host.querySelectorAll('.kg-in')[active]?.focus();
  }

  window.KnoxGraph = { mount, show, set, state: st, specialPoints, compile };
})();
