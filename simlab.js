/* simlab.js — the Simulation Lab (the sidebar's Simulations page; notes.js
   mounts it in #simsPanel).

   Three parts:
     • Knox builds it — describe what you want to see; Knox picks one of the
       built-in simulations below and fills in its settings
       (/api/me?route=sim-build, api/_sim-build.js). The model never writes code.
     • Playground — every simulation, with its sliders plus "More settings"
       (gravity by planet, air resistance, trails, speed, grid, labels…).
     • My sims — what you saved, on this device.

   Plans, like Flashcards:
     Free      6 starter sims, basic sliders, Knox builds for 2 credits, 3 saved
     ⚡ Plus   every sim and setting, 20 Knox builds a day, 25 saved
     💎 Mega   100 Knox builds a day, unlimited saves, Compare (a ghost run)

   window.knoxSimLab = { show(host), open(type, values, meta) } */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ki = (name, tint) => window.KI ? window.KI(name, tint === false ? { tint: false } : undefined) : '';
  const fill = html => (window.KI?.fill || (x => x))(html);
  const fmt = (n, dp = 2) => { if (!Number.isFinite(n)) return '—'; const r = Math.round(n * 10 ** dp) / 10 ** dp; return (Object.is(r, -0) ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: dp }); };
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ── Plans ────────────────────────────────────────────────────────────────
  // Testing: ?simlab=free|plus|mega on the preview or localhost.
  const testTier = (() => { try { const p = new URLSearchParams(location.search).get('simlab'); return /localhost|127\.0\.0\.1|knoxknowspreview/.test(location.hostname) && ['free', 'plus', 'mega'].includes(p) ? p : null; } catch (_) { return null; } })();
  const tier = () => testTier || (window.userTier === 'mega' ? 'mega' : window.userTier === 'plus' ? 'plus' : 'free');
  const paid = () => tier() !== 'free';
  const SAVE_MAX = { free: 3, plus: 25, mega: Infinity };
  const tag = t => t === 'mega' ? '<span class="sl-tag mega">💎 Mega</span>' : '<span class="sl-tag">⚡ Plus</span>';

  // ── Shared bits ──────────────────────────────────────────────────────────
  const PLANETS = { earth: [9.81, 'Earth'], moon: [1.62, 'Moon'], mars: [3.71, 'Mars'], jupiter: [24.79, 'Jupiter'], sun: [274, 'The Sun'], pluto: [0.62, 'Pluto'] };
  const planetOpts = Object.entries(PLANETS).map(([k, [g, n]]) => [k, `${n} (${g} m/s²)`]);
  const ITEMS = { soccer: ['Soccer ball', '#FFFFFF', '#3C3C3C', 9], basketball: ['Basketball', '#FF8A3D', '#B84A00', 10], football: ['Football', '#A0622D', '#6B3E1E', 9], baseball: ['Baseball', '#FFFFFF', '#E5383B', 7], tennis: ['Tennis ball', '#D7F25C', '#8AA516', 7], golf: ['Golf ball', '#FFFFFF', '#9A9A9A', 6], rocket: ['Rocket', '#E5383B', '#8A1F22', 9], arrow: ['Arrow', '#A0622D', '#6B3E1E', 6], cannonball: ['Cannonball', '#3C3C3C', '#111111', 10], rock: ['Rock', '#8C8C8C', '#5A5A5A', 9], water: ['Water drop', '#1CB0F6', '#0A85C2', 7], apple: ['Apple', '#E5383B', '#8A1F22', 8], frisbee: ['Frisbee', '#CE82FF', '#7C3AED', 9] };
  const itemOpts = Object.entries(ITEMS).map(([k, v]) => [k, v[0]]);
  const DROPS = { ball: ['Ball', .01, '#FF8A3D'], rock: ['Rock', .002, '#8C8C8C'], apple: ['Apple', .006, '#E5383B'], skydiver: ['Skydiver', .004, '#1CB0F6'], feather: ['Feather', 1.5, '#FFE7A8'] };
  const MOVERS = ['car', 'runner', 'person', 'train', 'bike', 'plane', 'boat', 'dog', 'bus', 'truck'];

  // A chart in world coordinates.
  function chart(g, c, x0, x1, y0, y1, pad = 34) {
    const L = pad + 8, R = c.w - 14, T = 14, B = c.h - pad;
    const X = x => L + (x - x0) / (x1 - x0) * (R - L), Y = y => B - (y - y0) / (y1 - y0) * (B - T);
    return {
      X, Y, L, R, T, B,
      axes(xl = '', yl = '', ticks = true) {
        if (c.ghost) return;
        g.save(); g.lineWidth = 1; g.font = '700 11px Nunito, system-ui, sans-serif'; g.fillStyle = c.light;
        const step = r => { const raw = r / 8, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
        const sx = step(x1 - x0), sy = step(y1 - y0);
        if (c.s.grid !== false) {
          g.strokeStyle = c.grid;
          for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + 1e-9; x += sx) { g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), B); g.stroke(); }
          for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) { g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(R, Y(y)); g.stroke(); }
        }
        g.strokeStyle = c.axis; g.lineWidth = 2;
        const ax = clamp(0, x0, x1), ay = clamp(0, y0, y1);
        g.beginPath(); g.moveTo(L, Y(ay)); g.lineTo(R, Y(ay)); g.moveTo(X(ax), T); g.lineTo(X(ax), B); g.stroke();
        if (ticks && c.s.labels !== false) {
          g.textAlign = 'center'; g.textBaseline = 'top';
          for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + 1e-9; x += sx) if (Math.abs(x) > 1e-9) g.fillText(fmt(x), X(x), Math.min(B + 4, Y(ay) + 4));
          g.textAlign = 'right'; g.textBaseline = 'middle';
          for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) if (Math.abs(y) > 1e-9) g.fillText(fmt(y), Math.max(L - 4, X(ax) - 4), Y(y));
          g.font = '800 12px Nunito, system-ui, sans-serif'; g.fillStyle = c.text;
          if (xl) { g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(xl, R, c.h - 4); }
          if (yl) { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(yl, L + 4, 2); }
        }
        g.restore();
      },
      plot(f, col, w = 3, from = x0, to = x1) {
        g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath();
        let started = false;
        for (let i = 0; i <= 400; i++) { const x = from + (to - from) * i / 400, y = f(x); if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) { started = false; continue; } started ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); started = true; }
        g.stroke(); g.restore();
      },
      dot(x, y, col, r = 7) { if (x < x0 || x > x1 || y < y0 || y > y1) return; ball(g, X(x), Y(y), col, '#FFFFFF', r); },
    };
  }
  function ball(g, x, y, col, edge, r = 9) { g.save(); g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
  function label(g, c, text, x, y, col, align = 'center', size = 12) { if (c.s.labels === false || c.ghost) return; g.save(); g.font = `800 ${size}px Nunito, system-ui, sans-serif`; g.fillStyle = col || c.text; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y); g.restore(); }
  function arrow(g, x1, y1, x2, y2, col) { const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1); if (L < 4) return; g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 10 * Math.cos(a - .45), y2 - 10 * Math.sin(a - .45)); g.lineTo(x2 - 10 * Math.cos(a + .45), y2 - 10 * Math.sin(a + .45)); g.closePath(); g.fill(); g.restore(); }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // Precomputed motion: run step(state, dt) to tEnd; at(t) reads it back.
  function integrate(init, step, tEnd, dt = 1 / 240, stop) {
    const pts = [{ t: 0, ...init }]; let st = { ...init }, t = 0;
    while (t < tEnd) { st = step(st, dt, t); t += dt; pts.push({ t, ...st }); if (stop && stop(st)) break; }
    return { pts, end: t, at(tt) { const i = clamp(Math.round(tt / dt), 0, pts.length - 1); return pts[i]; } };
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  // A seeded random, so "Roll again" makes a new run and replays stay the same.
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // ── A safe math reader (for "Graph your own"): turns what a student types
  // into a tree and evaluates it — never eval(), never code.
  const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round };
  function parseMath(src) {
    const text = String(src || '').replace(/\s+/g, '').replace(/^y=/i, '').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi');
    if (!text) throw new Error('Type an equation, like y = 2x + 1');
    const toks = []; let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/[0-9.]/.test(ch)) { let j = i; while (j < text.length && /[0-9.]/.test(text[j])) j++; const n = Number(text.slice(i, j)); if (!Number.isFinite(n)) throw new Error('That number looks off: ' + text.slice(i, j)); toks.push({ t: 'n', v: n }); i = j; }
      else if (/[a-z]/i.test(ch)) { let j = i; while (j < text.length && /[a-z]/i.test(text[j])) j++; const w = text.slice(i, j).toLowerCase();
        // A known function or constant, else single letters (so "ax" is a·x).
        let k = 0; while (k < w.length) { const f = Object.keys(FUNCS).concat(['pi']).sort((a, b) => b.length - a.length).find(fn => w.startsWith(fn, k)); if (f) { toks.push(f === 'pi' ? { t: 'n', v: Math.PI } : { t: 'f', v: f }); k += f.length; } else { toks.push(w[k] === 'e' ? { t: 'n', v: Math.E } : { t: 'v', v: w[k] }); k++; } }
        i = j; }
      else if ('+-*/^(),'.includes(ch)) { toks.push({ t: ch }); i++; }
      else throw new Error(`Knox can’t read “${ch}” — use numbers, x, letters, + − × ÷ ^ and ( )`);
    }
    // Implied multiplication: 2x, 3(x+1), x(x-1), (x+1)(x-1), 2sin(x).
    const out = [];
    toks.forEach((tk, k) => { const prev = out[out.length - 1]; if (prev && (prev.t === 'n' || prev.t === 'v' || prev.t === ')') && (tk.t === 'n' || tk.t === 'v' || tk.t === 'f' || tk.t === '(')) out.push({ t: '*' }); out.push(tk); });
    let p = 0; const peek = () => out[p], eat = t => { if (out[p]?.t !== t) throw new Error(t === ')' ? 'A “(” is missing its “)”' : 'Something is missing near the end'); p++; };
    const expr = () => { let n = term(); while (peek()?.t === '+' || peek()?.t === '-') { const op = out[p++].t, r = term(); n = { op, a: n, b: r }; } return n; };
    const term = () => { let n = unary(); while (peek()?.t === '*' || peek()?.t === '/') { const op = out[p++].t, r = unary(); n = { op, a: n, b: r }; } return n; };
    const unary = () => { if (peek()?.t === '-') { p++; return { op: 'neg', a: unary() }; } if (peek()?.t === '+') { p++; return unary(); } return power(); };
    const power = () => { const b = atom(); if (peek()?.t === '^') { p++; return { op: '^', a: b, b: unary() }; } return b; };
    const atom = () => {
      const tk = out[p++]; if (!tk) throw new Error('Something is missing near the end');
      if (tk.t === 'n') return { n: tk.v };
      if (tk.t === 'v') return { v: tk.v };
      if (tk.t === 'f') { if (peek()?.t !== '(') { const a = atom(); return { f: tk.v, a }; } p++; const a = expr(); eat(')'); return { f: tk.v, a }; }
      if (tk.t === '(') { const a = expr(); eat(')'); return a; }
      throw new Error('Knox can’t read that part: “' + (tk.t) + '”');
    };
    const tree = expr(); if (p < out.length) throw new Error('Knox couldn’t read the end of that equation');
    const vars = new Set(); (function walk(n) { if (!n) return; if (n.v) vars.add(n.v); walk(n.a); walk(n.b); })(tree);
    const ev = (n, env) => n.n != null ? n.n : n.v ? (env[n.v] ?? 0) : n.f ? FUNCS[n.f](ev(n.a, env)) : n.op === 'neg' ? -ev(n.a, env)
      : n.op === '+' ? ev(n.a, env) + ev(n.b, env) : n.op === '-' ? ev(n.a, env) - ev(n.b, env) : n.op === '*' ? ev(n.a, env) * ev(n.b, env) : n.op === '/' ? ev(n.a, env) / ev(n.b, env) : Math.pow(ev(n.a, env), ev(n.b, env));
    return { vars, f: env => ev(tree, env) };
  }
  const LETTERS = 'abcdfghjkmnpqrstuvw'.split(''); // slider letters (x is the input; e is 2.718…)
  const text = (k, label, v, more = false) => ({ k, label, type: 'text', v, more });
  const range = (k, label, min, max, step, v, unit = '', more = false) => ({ k, label, type: 'range', min, max, step, v, unit, more });
  const toggle = (k, label, v = false, more = true) => ({ k, label, type: 'toggle', v, more });
  const select = (k, label, options, v, more = true) => ({ k, label, type: 'select', options, v, more });

  // ── The simulations ──────────────────────────────────────────────────────
  // group, icon (Knox icon), free (in the starter set), anim (has Play),
  // loop (repeats), params, presets, draw(g, s, c, t) → the readout.
  const T = {
    equation: {
      group: 'Math', icon: 'pencil', free: true, title: 'Graph your own', blurb: 'Type any equation — letters become sliders', anim: true, loop: true,
      params: [text('eq', 'Your equation (y = …)', 'y = a x^2 + b x + c'), text('eq2', 'A second equation (optional)', ''),
        ...LETTERS.map(L => ({ ...range('p_' + L, `Slider ${L}`, -10, 10, .1, L === 'a' ? 1 : L === 'c' ? -2 : 0), show: s => [s.eq, s.eq2].some(e => { try { return parseMath(e).vars.has(L); } catch (_) { return false; } }) })),
        range('xmax', 'How far x goes (±)', 1, 100, 1, 10, '', true), toggle('fity', 'Fit y to the graph', true), range('ymax', 'How far y goes (±) when not fitting', 1, 200, 1, 10, '', true),
        toggle('roots', 'Mark where it crosses the x-axis', true), toggle('meet', 'Mark where the two graphs meet', true), toggle('trace', 'A dot traces the graph when playing', true)],
      presets: [['Parabola', { eq: 'y = a x^2 + b x + c', p_a: 1, p_b: 0, p_c: -4 }], ['Wave', { eq: 'y = a sin(b x) + c', p_a: 3, p_b: 1, p_c: 0 }], ['Line vs curve', { eq: 'y = m x + b', eq2: 'y = x^2 - 3', p_m: 2, p_b: 1 }], ['Exponential', { eq: 'y = a * 2^(x/b)', p_a: 1, p_b: 1 }], ['Circle-ish', { eq: 'y = sqrt(r^2 - x^2)', eq2: 'y = -sqrt(r^2 - x^2)', p_r: 5 }]],
      duration: () => 6,
      draw(g, s, c, t) {
        const env = Object.fromEntries(LETTERS.map(L => [L, s['p_' + L]])), cols = [c.blue, c.red];
        const fs = []; let err = '';
        for (const e of [s.eq, s.eq2]) { if (!String(e || '').trim()) continue; try { const m = parseMath(e); fs.push(x => m.f({ ...env, x })); } catch (ex) { err = err || ex.message; } }
        const X = s.xmax; let Y = s.ymax;
        if (s.fity && fs.length) { let lo = Infinity, hi = -Infinity; for (const f of fs) for (let i = 0; i <= 200; i++) { const y = f(-X + 2 * X * i / 200); if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } } if (Number.isFinite(lo)) Y = clamp(Math.max(Math.abs(lo), Math.abs(hi), 1) * 1.2, 1, 1e6); }
        const ch = chart(g, c, -X, X, -Y, Y); ch.axes('x', 'y');
        fs.forEach((f, i) => ch.plot(f, c.ghost ? c.light : cols[i]));
        if (err) return err;
        if (!fs.length) return 'Type an equation above, like y = 2x + 1 — every letter besides x becomes a slider.';
        const zeros = (f, from, to) => { const out = []; let px = from, py = f(px); for (let i = 1; i <= 800; i++) { const x = from + (to - from) * i / 800, y = f(x); if (Number.isFinite(py) && Number.isFinite(y) && (py === 0 || py * y < 0) && Math.abs(y - py) < Y) { let a = px, b = x; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; (f(a) * f(m) <= 0) ? b = m : a = m; } out.push((a + b) / 2); } px = x; py = y; } return out.slice(0, 6); };
        let out = '';
        if (s.roots) { const r = zeros(fs[0], -X, X); r.forEach(x => ch.dot(x, 0, c.green, 6)); out += r.length ? `Crosses the x-axis at x = ${r.map(v => fmt(v)).join(', ')}` : 'Doesn’t cross the x-axis here'; }
        if (fs[1] && s.meet) { const m = zeros(x => fs[0](x) - fs[1](x), -X, X); m.forEach(x => ch.dot(x, fs[0](x), c.orange, 8)); out += (out ? ' · ' : '') + (m.length ? `The graphs meet at ${m.map(x => `(${fmt(x)}, ${fmt(fs[0](x))})`).join(', ')}` : 'The two graphs don’t meet here'); }
        if (s.trace && t != null) { const x = -X + 2 * X * (t / 6); ch.dot(x, fs[0](x), c.orange, 7); out += ` · tracing x = ${fmt(x, 1)}, y = ${fmt(fs[0](x))}`; }
        const used = LETTERS.filter(L => [s.eq, s.eq2].some(e => { try { return parseMath(e).vars.has(L); } catch (_) { return false; } }));
        return (used.length ? used.map(L => `${L} = ${fmt(s['p_' + L])}`).join(', ') + ' · ' : '') + out;
      },
    },
    line: {
      group: 'Math', icon: 'chart', free: true, title: 'Lines', blurb: 'Slope and the y-intercept',
      params: [range('m', 'Slope (m)', -10, 10, .5, 2), range('b', 'Y-intercept (b)', -20, 20, 1, 1),
        toggle('tri', 'Show the slope triangle', true), toggle('second', 'Add a second line'), range('m2', 'Second slope', -10, 10, .5, -1, '', true), range('b2', 'Second intercept', -20, 20, 1, 5, '', true),
        range('zoom', 'Zoom (how far the axes go)', 5, 50, 5, 10, '', true)],
      presets: [['Steep', { m: 4, b: 0 }], ['Flat', { m: 0, b: 3 }], ['Going down', { m: -2, b: 6 }], ['Two lines crossing', { m: 1, b: -2, second: 1, m2: -1, b2: 4 }]],
      draw(g, s, c) {
        const Z = s.zoom, ch = chart(g, c, -Z, Z, -Z, Z); ch.axes('x', 'y');
        ch.plot(x => s.m * x + s.b, c.ghost ? c.light : c.blue);
        if (s.tri && !c.ghost && Math.abs(s.m) > 1e-9) { g.save(); g.setLineDash([6, 5]); g.strokeStyle = c.orange; g.lineWidth = 2.5; const xA = 1, xB = 2; g.beginPath(); g.moveTo(ch.X(xA), ch.Y(s.m * xA + s.b)); g.lineTo(ch.X(xB), ch.Y(s.m * xA + s.b)); g.lineTo(ch.X(xB), ch.Y(s.m * xB + s.b)); g.stroke(); g.restore(); label(g, c, 'run 1', ch.X(1.5), ch.Y(s.m + s.b) + (s.m > 0 ? 12 : -12), c.orange); label(g, c, `rise ${fmt(s.m)}`, ch.X(2) + 30, ch.Y(s.m * 1.5 + s.b), c.orange); }
        ch.dot(0, s.b, c.orange);
        let out = `y = ${fmt(s.m)}x ${s.b < 0 ? '−' : '+'} ${fmt(Math.abs(s.b))} · crosses the y-axis at ${fmt(s.b)}${s.m ? ` and the x-axis at ${fmt(-s.b / s.m)}` : ' (flat: it never crosses the x-axis unless b is 0)'}`;
        if (s.second) {
          ch.plot(x => s.m2 * x + s.b2, c.red);
          if (s.m !== s.m2) { const x = (s.b2 - s.b) / (s.m - s.m2), y = s.m * x + s.b; ch.dot(x, y, c.green, 8); out += ` · the lines cross at (${fmt(x)}, ${fmt(y)})`; }
          else out += s.b === s.b2 ? ' · same line twice!' : ' · same slope, so they never cross (parallel)';
        }
        return out;
      },
    },
    parabola: {
      group: 'Math', icon: 'math', free: true, title: 'Parabolas', blurb: 'Vertex, roots and the axis',
      params: [range('a', 'a (opens up or down)', -5, 5, .25, 1), range('b', 'b', -20, 20, 1, 0), range('c', 'c', -20, 20, 1, -4),
        toggle('vertex', 'Show the vertex', true), toggle('roots', 'Show the x-intercepts', true), toggle('axis', 'Show the axis of symmetry', true), range('zoom', 'Zoom', 5, 50, 5, 10, '', true)],
      presets: [['Two roots', { a: 1, b: 0, c: -4 }], ['One root', { a: 1, b: -4, c: 4 }], ['No roots', { a: 1, b: 0, c: 3 }], ['Upside down', { a: -1, b: 2, c: 3 }]],
      draw(g, s, c) {
        const Z = s.zoom, ch = chart(g, c, -Z, Z, -Z, Z); ch.axes('x', 'y');
        ch.plot(x => s.a * x * x + s.b * x + s.c, c.ghost ? c.light : c.purple);
        if (!s.a) return 'a = 0 makes it a straight line, not a parabola. Move a away from 0.';
        const vx = -s.b / (2 * s.a), vy = s.a * vx * vx + s.b * vx + s.c, disc = s.b * s.b - 4 * s.a * s.c;
        if (s.axis && !c.ghost) { g.save(); g.setLineDash([5, 5]); g.strokeStyle = c.light; g.lineWidth = 2; g.beginPath(); g.moveTo(ch.X(vx), ch.T); g.lineTo(ch.X(vx), ch.B); g.stroke(); g.restore(); }
        if (s.vertex) ch.dot(vx, vy, c.orange, 8);
        const roots = disc < 0 ? [] : disc === 0 ? [vx] : [(-s.b - Math.sqrt(disc)) / (2 * s.a), (-s.b + Math.sqrt(disc)) / (2 * s.a)];
        if (s.roots) roots.forEach(r => ch.dot(r, 0, c.green, 7));
        return `Vertex (${fmt(vx)}, ${fmt(vy)}) · opens ${s.a > 0 ? 'up' : 'down'} · discriminant b² − 4ac = ${fmt(disc)} → ${roots.length === 0 ? 'no x-intercepts' : roots.length === 1 ? `one x-intercept at ${fmt(roots[0])}` : `x-intercepts at ${fmt(roots[0])} and ${fmt(roots[1])}`}`;
      },
    },
    sine: {
      group: 'Math', icon: 'spark', title: 'Waves (sine)', blurb: 'Amplitude, period and phase', anim: true, loop: true,
      params: [range('amp', 'Amplitude (A)', 0, 10, .5, 3), range('freq', 'Frequency (B)', .1, 5, .1, 1), range('phase', 'Phase shift (C, degrees)', -180, 180, 5, 0), range('shift', 'Up/down shift (D)', -10, 10, .5, 0),
        toggle('cosine', 'Compare with cosine'), toggle('rider', 'A dot rides the wave', true)],
      presets: [['Tall wave', { amp: 8, freq: 1 }], ['Fast wave', { amp: 3, freq: 3 }], ['Shifted', { amp: 3, freq: 1, phase: 90, shift: 2 }]],
      duration: () => 6,
      draw(g, s, c, t) {
        const top = Math.max(2, s.amp + Math.abs(s.shift)) * 1.25, ch = chart(g, c, -2 * Math.PI, 2 * Math.PI, -top, top); ch.axes('x (radians)', 'y');
        const f = x => s.amp * Math.sin(s.freq * x + s.phase * Math.PI / 180) + s.shift;
        ch.plot(f, c.ghost ? c.light : c.blue);
        if (s.cosine) ch.plot(x => s.amp * Math.cos(s.freq * x + s.phase * Math.PI / 180) + s.shift, c.red, 2);
        if (s.rider && t != null) { const x = -2 * Math.PI + (t / 6) * 4 * Math.PI; ch.dot(x, f(x), c.orange, 8); }
        const period = 2 * Math.PI / s.freq;
        return `y = ${fmt(s.amp)} sin(${fmt(s.freq)}x ${s.phase < 0 ? '−' : '+'} ${fmt(Math.abs(s.phase))}°) ${s.shift < 0 ? '−' : '+'} ${fmt(Math.abs(s.shift))} · amplitude ${fmt(s.amp)} · period ${fmt(period)} (${fmt(360 / s.freq)}°) · goes from ${fmt(s.shift - s.amp)} to ${fmt(s.shift + s.amp)}`;
      },
    },
    exponential: {
      group: 'Math', icon: 'rocket', title: 'Growth & decay', blurb: 'Exponential vs straight-line', anim: true,
      params: [range('start', 'Starting amount', 1, 10000, 1, 100), range('rate', 'Change each step (%)', -50, 100, 1, 10), range('steps', 'Number of steps', 1, 60, 1, 20),
        toggle('linear', 'Compare with straight-line growth', true), toggle('points', 'Show each step', true)],
      presets: [['Doubling', { start: 1, rate: 100, steps: 10 }], ['Bacteria', { start: 50, rate: 30, steps: 24 }], ['Half-life', { start: 1000, rate: -50, steps: 10 }]],
      duration: s => 3,
      draw(g, s, c, t) {
        const r = s.rate / 100, f = n => s.start * Math.pow(1 + r, n), lin = n => s.start + s.start * r * n;
        const show = t == null ? s.steps : clamp(t / 3, 0, 1) * s.steps;
        const ymax = Math.max(f(0), f(s.steps), s.linear ? lin(s.steps) : 0) * 1.1, ymin = Math.min(0, s.linear ? lin(s.steps) : 0);
        const ch = chart(g, c, 0, s.steps, ymin, ymax, 42); ch.axes('steps', 'amount');
        if (s.linear) ch.plot(lin, c.green, 2, 0, show);
        ch.plot(f, c.ghost ? c.light : c.orange, 3, 0, show);
        if (s.points && !c.ghost) for (let n = 0; n <= Math.floor(show); n++) ch.dot(n, f(n), c.orange, 4);
        const twice = r > 0 ? Math.log(2) / Math.log(1 + r) : r < 0 ? Math.log(.5) / Math.log(1 + r) : Infinity;
        return `After ${s.steps} steps: ${fmt(f(s.steps), 1)} (started at ${fmt(s.start)}) · ${r > 0 ? `doubles about every ${fmt(twice, 1)} steps` : r < 0 ? `halves about every ${fmt(twice, 1)} steps` : 'no change'}${s.linear ? ` · straight-line growth would reach ${fmt(lin(s.steps), 1)}` : ''}`;
      },
    },
    fraction: {
      group: 'Math', icon: 'calc', free: true, title: 'Fractions', blurb: 'Pictures, decimals and percents',
      params: [range('n', 'Top (numerator)', 0, 24, 1, 3), range('d', 'Bottom (denominator)', 1, 24, 1, 4),
        select('shape', 'Draw it as', [['pie', 'A pie'], ['bar', 'A bar']], 'pie'), toggle('compare', 'Compare with a second fraction'), range('n2', 'Second top', 0, 24, 1, 2, '', true), range('d2', 'Second bottom', 1, 24, 1, 3, '', true)],
      presets: [['One half', { n: 1, d: 2 }], ['Three quarters', { n: 3, d: 4 }], ['More than 1', { n: 7, d: 4 }], ['Which is bigger?', { n: 2, d: 3, compare: 1, n2: 3, d2: 5 }]],
      draw(g, s, c) {
        if (c.ghost) return '';
        const one = (n, d, cx, cy, size, col) => {
          const wholes = Math.max(1, Math.ceil(n / d));
          for (let w = 0; w < Math.min(wholes, 3); w++) {
            const filled = clamp(n - w * d, 0, d), ox = cx + (w - (Math.min(wholes, 3) - 1) / 2) * (size * 2.3);
            if (s.shape === 'bar') {
              const W = size * 2, H = size * .7, x = ox - W / 2, y = cy - H / 2;
              for (let i = 0; i < d; i++) { g.fillStyle = i < filled ? col : c.surface; g.strokeStyle = c.axis; g.lineWidth = 2; g.fillRect(x + i * W / d, y, W / d, H); g.strokeRect(x + i * W / d, y, W / d, H); }
            } else {
              for (let i = 0; i < d; i++) { const a0 = -Math.PI / 2 + i * 2 * Math.PI / d, a1 = a0 + 2 * Math.PI / d; g.beginPath(); g.moveTo(ox, cy); g.arc(ox, cy, size, a0, a1); g.closePath(); g.fillStyle = i < filled ? col : c.surface; g.fill(); g.strokeStyle = c.axis; g.lineWidth = 2; g.stroke(); }
            }
          }
        };
        const size = Math.min(c.h * .3, c.w * (s.compare ? .1 : .16));
        if (s.compare) { one(s.n, s.d, c.w * .28, c.h * .5, size, c.orange); one(s.n2, s.d2, c.w * .72, c.h * .5, size, c.blue); label(g, c, `${s.n}/${s.d}`, c.w * .28, c.h - 18, c.orange, 'center', 16); label(g, c, `${s.n2}/${s.d2}`, c.w * .72, c.h - 18, c.blue, 'center', 16); }
        else { one(s.n, s.d, c.w / 2, c.h * .47, size, c.orange); label(g, c, `${s.n}/${s.d}`, c.w / 2, c.h - 18, c.orange, 'center', 16); }
        const k = gcd(s.n, s.d) || 1, simple = k > 1 ? ` = ${s.n / k}/${s.d / k}` : '';
        let out = `${s.n}/${s.d}${simple} = ${fmt(s.n / s.d, 3)} = ${fmt(s.n / s.d * 100, 1)}%${s.n > s.d ? ` = ${Math.floor(s.n / s.d)} and ${s.n % s.d}/${s.d}` : ''}`;
        if (s.compare) { const a = s.n / s.d, b = s.n2 / s.d2; out += ` · ${s.n}/${s.d} ${a > b ? '>' : a < b ? '<' : '='} ${s.n2}/${s.d2} (${fmt(b * 100, 1)}%)`; }
        return out;
      },
    },
    unitcircle: {
      group: 'Math', icon: 'globe', title: 'Unit circle', blurb: 'Sine, cosine and tangent', anim: true, loop: true,
      params: [range('angle', 'Angle (degrees)', 0, 360, 1, 30), toggle('spin', 'Spin around when playing', true), toggle('tan', 'Show tangent')],
      presets: [['30°', { angle: 30 }], ['45°', { angle: 45 }], ['60°', { angle: 60 }], ['135°', { angle: 135 }], ['270°', { angle: 270 }]],
      duration: () => 8,
      draw(g, s, c, t) {
        const deg = s.spin && t != null ? (s.angle + t / 8 * 360) % 360 : s.angle, a = deg * Math.PI / 180;
        const R = Math.min(c.w, c.h) * .36, cx = c.w / 2, cy = c.h / 2;
        if (!c.ghost) { g.save(); g.strokeStyle = c.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R * 1.3, cy); g.lineTo(cx + R * 1.3, cy); g.moveTo(cx, cy - R * 1.3); g.lineTo(cx, cy + R * 1.3); g.stroke(); g.strokeStyle = c.axis; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.restore(); }
        const px = cx + R * Math.cos(a), py = cy - R * Math.sin(a);
        g.save(); g.strokeStyle = c.ghost ? c.light : c.text; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke();
        g.strokeStyle = c.blue; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, cy); g.stroke();
        g.strokeStyle = c.red; g.beginPath(); g.moveTo(px, cy); g.lineTo(px, py); g.stroke();
        g.strokeStyle = c.orange; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, R * .22, 0, -a, true); g.stroke();
        if (s.tan && Math.abs(Math.cos(a)) > .05) { g.strokeStyle = c.purple; g.lineWidth = 3; const ty = cy - R * Math.tan(a); g.beginPath(); g.moveTo(cx + R, cy); g.lineTo(cx + R, clamp(ty, 0, c.h)); g.stroke(); }
        g.restore(); ball(g, px, py, c.orange, '#FFFFFF', 8);
        label(g, c, `cos ${fmt(Math.cos(a))}`, (cx + px) / 2, cy + (Math.sin(a) >= 0 ? 16 : -16), c.blue);
        label(g, c, `sin ${fmt(Math.sin(a))}`, px + (Math.cos(a) >= 0 ? 34 : -34), (cy + py) / 2, c.red);
        const tn = Math.abs(Math.cos(a)) < 1e-9 ? 'undefined' : fmt(Math.tan(a));
        return `${fmt(deg, 0)}° = ${fmt(a, 3)} radians · cos = ${fmt(Math.cos(a), 3)} (blue) · sin = ${fmt(Math.sin(a), 3)} (red) · tan = ${tn}`;
      },
    },
    projectile: {
      group: 'Physics', icon: 'target', free: true, title: 'Launch something', blurb: 'Angle, speed, gravity and air', anim: true,
      params: [range('speed', 'Launch speed', 1, 80, 1, 20, 'm/s'), range('angle', 'Angle', 0, 90, 1, 45, '°'),
        range('height', 'Launch height (a cliff)', 0, 200, 1, 0, 'm', true), select('planet', 'Gravity', planetOpts, 'earth'), toggle('drag', 'Air resistance'), select('item', 'What is launched', itemOpts, 'soccer'),
        toggle('trail', 'Show the whole path', true), toggle('vectors', 'Show speed arrows'), toggle('peak', 'Mark the highest point', true)],
      presets: [['Best angle (45°)', { speed: 20, angle: 45 }], ['Off a cliff', { speed: 15, angle: 20, height: 40 }], ['On the Moon', { speed: 20, angle: 45, planet: 'moon' }], ['Cannon with air', { speed: 60, angle: 35, drag: 1, item: 'cannonball' }]],
      model(s) {
        const gr = PLANETS[s.planet]?.[0] || 9.81, k = s.drag ? .02 : 0, a = s.angle * Math.PI / 180;
        return integrate({ x: 0, y: s.height, vx: s.speed * Math.cos(a), vy: s.speed * Math.sin(a) }, (p, dt) => {
          const v = Math.hypot(p.vx, p.vy), ax = -k * v * p.vx, ay = -gr - k * v * p.vy;
          return { x: p.x + p.vx * dt, y: p.y + p.vy * dt, vx: p.vx + ax * dt, vy: p.vy + ay * dt };
        }, 600, 1 / 240, p => p.y < 0);
      },
      duration(s) { return this.model(s).end; },
      draw(g, s, c, t) {
        const m = this.model(s), pts = m.pts, maxX = Math.max(...pts.map(p => p.x), 1), maxY = Math.max(...pts.map(p => p.y), 1);
        const sc = Math.min((c.w - 70) / maxX, (c.h - 60) / maxY), X = x => 40 + x * sc, Y = y => c.h - 28 - y * sc;
        if (!c.ghost) {
          g.fillStyle = c.ground; g.fillRect(0, Y(0), c.w, c.h - Y(0));
          if (s.height > 0) { g.fillStyle = c.cliff; g.fillRect(0, Y(s.height), X(0), Y(0) - Y(s.height)); }
          if (c.s.grid !== false) { g.save(); g.strokeStyle = c.grid; g.lineWidth = 1; const step = Math.pow(10, Math.floor(Math.log10(Math.max(maxX, maxY) / 3))); for (let x = 0; x <= maxX; x += step) { g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), 8); g.stroke(); label(g, c, fmt(x, 0) + ' m', X(x), Y(0) + 12, c.light, 'center', 10); } g.restore(); }
        }
        const now = t == null ? m.end : Math.min(t, m.end), p = m.at(now);
        g.save(); g.strokeStyle = c.ghost ? c.light : c.orange; g.lineWidth = 2.5; g.setLineDash(s.trail ? [] : [2, 6]); g.beginPath();
        for (const q of pts) { if (!s.trail && q.t > now) break; q === pts[0] ? g.moveTo(X(q.x), Y(q.y)) : g.lineTo(X(q.x), Y(q.y)); }
        g.stroke(); g.restore();
        const peak = pts.reduce((a, b) => b.y > a.y ? b : a, pts[0]);
        if (s.peak && !c.ghost) { ball(g, X(peak.x), Y(peak.y), c.green, '#FFFFFF', 5); label(g, c, `top ${fmt(peak.y, 1)} m`, X(peak.x), Y(peak.y) - 14, c.green); }
        const it = ITEMS[s.item] || ITEMS.soccer;
        if (s.vectors && !c.ghost) { arrow(g, X(p.x), Y(p.y), X(p.x) + p.vx * 2.2, Y(p.y), c.blue); arrow(g, X(p.x), Y(p.y), X(p.x), Y(p.y) - p.vy * 2.2, c.red); }
        ball(g, X(p.x), Y(Math.max(0, p.y)), c.ghost ? c.light : it[1], it[2], it[3]);
        const land = pts[pts.length - 1], vLand = Math.hypot(land.vx, land.vy);
        return `${it[0]} on ${PLANETS[s.planet]?.[1] || 'Earth'}: flies ${fmt(m.end, 2)} s, lands ${fmt(land.x, 1)} m away, highest point ${fmt(peak.y, 1)} m, hits the ground at ${fmt(vLand, 1)} m/s${s.drag ? ' (air slows it down)' : ''}${t != null && now < m.end ? ` · now: ${fmt(now, 1)} s` : ''}`;
      },
    },
    freefall: {
      group: 'Physics', icon: 'apple', title: 'Drop it', blurb: 'Free fall, gravity and air', anim: true,
      params: [range('height', 'Drop height', 1, 500, 1, 50, 'm'), select('planet', 'Gravity', planetOpts, 'earth'), toggle('drag', 'Air resistance', true), select('item', 'What is dropped', Object.entries(DROPS).map(([k, v]) => [k, v[0]]), 'ball'), toggle('graph', 'Graph the speed', true)],
      presets: [['Feather vs air', { item: 'feather', drag: 1, height: 10 }], ['Feather on the Moon (no air)', { item: 'feather', drag: 0, planet: 'moon', height: 10 }], ['Skydiver', { item: 'skydiver', drag: 1, height: 500 }]],
      model(s) {
        const gr = PLANETS[s.planet]?.[0] || 9.81, k = s.drag ? (DROPS[s.item] || DROPS.ball)[1] : 0;
        return integrate({ y: s.height, v: 0 }, (p, dt) => ({ y: p.y - p.v * dt, v: p.v + (gr - k * p.v * p.v) * dt }), 400, 1 / 240, p => p.y <= 0);
      },
      duration(s) { return this.model(s).end; },
      draw(g, s, c, t) {
        const m = this.model(s), now = t == null ? m.end : Math.min(t, m.end), p = m.at(now), it = DROPS[s.item] || DROPS.ball;
        const top = 24, bot = c.h - 30, Y = y => bot - y / s.height * (bot - top), tx = s.graph ? c.w * .28 : c.w / 2;
        if (!c.ghost) { g.fillStyle = c.ground; g.fillRect(0, bot, c.w, c.h - bot); g.fillStyle = c.cliff; g.fillRect(tx - 60, top - 6, 46, bot - top + 6); label(g, c, `${fmt(s.height, 0)} m`, tx - 37, top - 14, c.text); }
        ball(g, tx, Y(Math.max(0, p.y)), c.ghost ? c.light : it[2], '#5A5A5A', 10);
        if (s.graph && !c.ghost) {
          const vmax = Math.max(...m.pts.map(q => q.v), 1), gx = c.w * .48, gw = c.w * .48, gy = 24, gh = c.h - 60;
          g.save(); g.strokeStyle = c.axis; g.lineWidth = 2; g.strokeRect(gx, gy, gw, gh); g.strokeStyle = c.orange; g.lineWidth = 3; g.beginPath();
          for (const q of m.pts) { if (q.t > now) break; const x = gx + q.t / m.end * gw, y = gy + gh - q.v / vmax * gh; q === m.pts[0] ? g.moveTo(x, y) : g.lineTo(x, y); }
          g.stroke(); g.restore(); label(g, c, 'speed', gx + 4, gy + 10, c.text, 'left'); label(g, c, 'time →', gx + gw - 4, gy + gh + 12, c.light, 'right');
        }
        const vEnd = m.pts[m.pts.length - 1].v, gr = PLANETS[s.planet]?.[0] || 9.81, term = s.drag ? Math.sqrt(gr / it[1]) : Infinity;
        return `${it[0]} from ${fmt(s.height, 0)} m on ${PLANETS[s.planet]?.[1]}: lands in ${fmt(m.end, 2)} s at ${fmt(vEnd, 1)} m/s (${fmt(vEnd * 3.6, 0)} km/h)${s.drag ? ` · top speed with air ≈ ${fmt(term, 1)} m/s` : ' · no air, so everything falls the same'}${t != null && now < m.end ? ` · now ${fmt(p.v, 1)} m/s` : ''}`;
      },
    },
    pendulum: {
      group: 'Physics', icon: 'clock', title: 'Pendulum', blurb: 'Length, gravity and the swing', anim: true, loop: true,
      params: [range('length', 'String length', .1, 20, .1, 2, 'm'), range('angle', 'Start angle', 1, 80, 1, 30, '°'), select('planet', 'Gravity', planetOpts, 'earth'), range('damping', 'Friction (slows it down)', 0, 1, .05, 0, '', true), toggle('trace', 'Show the swing path', true)],
      presets: [['Grandfather clock', { length: 1, angle: 10 }], ['Long swing', { length: 10, angle: 30 }], ['On Jupiter', { length: 2, planet: 'jupiter' }]],
      model(s) { const gr = PLANETS[s.planet]?.[0] || 9.81; return integrate({ th: s.angle * Math.PI / 180, w: 0 }, (p, dt) => { const al = -(gr / s.length) * Math.sin(p.th) - s.damping * p.w; return { th: p.th + p.w * dt, w: p.w + al * dt }; }, 20, 1 / 240); },
      duration: () => 20,
      draw(g, s, c, t) {
        const m = this.model(s), p = m.at(t == null ? 0 : t % 20), ox = c.w / 2, oy = 24, L = c.h - 70;
        const bx = ox + L * Math.sin(p.th), by = oy + L * Math.cos(p.th);
        if (!c.ghost) { g.fillStyle = c.axis; g.fillRect(ox - 60, oy - 8, 120, 8); if (s.trace) { g.save(); g.strokeStyle = c.grid; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.arc(ox, oy, L, Math.PI / 2 - s.angle * Math.PI / 180, Math.PI / 2 + s.angle * Math.PI / 180); g.stroke(); g.restore(); } }
        g.save(); g.strokeStyle = c.ghost ? c.light : c.text; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ox, oy); g.lineTo(bx, by); g.stroke(); g.restore();
        ball(g, bx, by, c.ghost ? c.light : c.yellow, '#B98500', 16);
        const gr = PLANETS[s.planet]?.[0] || 9.81, T0 = 2 * Math.PI * Math.sqrt(s.length / gr);
        return `One full swing takes about ${fmt(T0, 2)} s (T = 2π√(L/g)) · longer string = slower · stronger gravity = faster${s.damping ? ' · friction makes the swings smaller' : ''}`;
      },
    },
    spring: {
      group: 'Physics', icon: 'bolt', title: 'Spring & mass', blurb: 'Hooke’s law and bouncing', anim: true, loop: true,
      params: [range('mass', 'Mass', .1, 20, .1, 1, 'kg'), range('k', 'Spring stiffness (k)', 1, 200, 1, 20, 'N/m'), range('stretch', 'Start stretch', -2, 2, .1, 1, 'm'), range('damping', 'Friction', 0, 1, .05, 0, '', true), toggle('graph', 'Graph the position', true)],
      presets: [['Soft spring', { k: 5 }], ['Stiff spring', { k: 150 }], ['Heavy', { mass: 15, k: 20 }], ['With friction', { damping: .4 }]],
      model(s) { return integrate({ x: s.stretch, v: 0 }, (p, dt) => ({ x: p.x + p.v * dt, v: p.v + (-(s.k / s.mass) * p.x - s.damping * p.v) * dt }), 20, 1 / 240); },
      duration: () => 20,
      draw(g, s, c, t) {
        const m = this.model(s), now = t == null ? 0 : t % 20, p = m.at(now), cx = s.graph ? c.w * .25 : c.w / 2, rest = c.h * .45, sc = (c.h * .4) / 2.2;
        const by = rest + p.x * sc;
        if (!c.ghost) { g.fillStyle = c.axis; g.fillRect(cx - 50, 10, 100, 8); g.save(); g.setLineDash([4, 5]); g.strokeStyle = c.light; g.beginPath(); g.moveTo(cx - 70, rest + 22); g.lineTo(cx + 70, rest + 22); g.stroke(); g.restore(); label(g, c, 'rest', cx + 74, rest + 22, c.light, 'left', 11); }
        g.save(); g.strokeStyle = c.ghost ? c.light : c.text; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, 18);
        const coils = 12; for (let i = 1; i <= coils; i++) g.lineTo(cx + (i % 2 ? 14 : -14), 18 + (by - 18) * i / (coils + 1)); g.lineTo(cx, by); g.stroke(); g.restore();
        g.save(); g.fillStyle = c.ghost ? c.light : c.blue; g.strokeStyle = '#0A85C2'; g.lineWidth = 2.5; const bs = 24 + Math.min(20, s.mass * 2); rr(g, cx - bs / 2, by, bs, bs, 6); g.fill(); g.stroke(); g.restore();
        if (s.graph && !c.ghost) {
          const gx = c.w * .48, gw = c.w * .48, gy = 20, gh = c.h - 50, span = 10, t0 = Math.max(0, now - span);
          g.save(); g.strokeStyle = c.axis; g.lineWidth = 1.5; g.strokeRect(gx, gy, gw, gh); g.beginPath(); g.moveTo(gx, gy + gh / 2); g.lineTo(gx + gw, gy + gh / 2); g.stroke();
          g.strokeStyle = c.orange; g.lineWidth = 3; g.beginPath(); let first = true;
          for (let tt = t0; tt <= now; tt += 1 / 60) { const q = m.at(tt), x = gx + (tt - t0) / span * gw, y = gy + gh / 2 + q.x / 2.2 * gh / 2; first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
          g.stroke(); g.restore(); label(g, c, 'position over time', gx + 6, gy + 10, c.text, 'left', 11);
        }
        const T0 = 2 * Math.PI * Math.sqrt(s.mass / s.k);
        return `One bounce takes ${fmt(T0, 2)} s (T = 2π√(m/k)) · spring force F = −kx = ${fmt(-s.k * p.x, 1)} N right now · heavier = slower, stiffer = faster`;
      },
    },
    motion: {
      group: 'Physics', icon: 'clock', title: 'Catch-up race', blurb: 'When does B catch A?', anim: true,
      params: [range('a', 'A’s speed', 1, 150, 1, 60), range('b', 'B’s speed', 1, 150, 1, 75), range('head', 'A’s head start', 0, 300, 1, 30),
        select('unit', 'Distance in', [['mi', 'miles'], ['km', 'kilometers'], ['m', 'meters'], ['ft', 'feet']], 'mi'), select('time', 'Time in', [['h', 'hours'], ['min', 'minutes'], ['s', 'seconds']], 'h'), select('who', 'Who is racing', MOVERS.map(m => [m, m[0].toUpperCase() + m.slice(1) + 's']), 'car')],
      presets: [['Cars on a highway', { a: 55, b: 70, head: 30 }], ['Runners', { a: 6, b: 8, head: 1, unit: 'mi' }], ['Never catches up', { a: 70, b: 60, head: 10 }]],
      duration: () => 4,
      draw(g, s, c, t) {
        const catchT = s.b > s.a ? s.head / (s.b - s.a) : Infinity, end = Number.isFinite(catchT) ? catchT * 1.3 : 4, now = t == null ? end : t / 4 * end;
        const pa = s.head + s.a * now, pb = s.b * now, far = Math.max(s.head + s.a * end, s.b * end, 1), L = 30, W = c.w - 70;
        const lane = (y, pos, col, name) => { if (!c.ghost) { g.fillStyle = c.grid; g.fillRect(L, y - 3, W, 6); } ball(g, L + W * pos / far, y, c.ghost ? c.light : col, '#FFFFFF', 12); label(g, c, name, L + W * pos / far, y - 22, col); };
        lane(c.h * .35, pa, c.orange, 'A'); lane(c.h * .68, pb, c.blue, 'B');
        if (Number.isFinite(catchT) && now >= catchT && !c.ghost) { const x = L + W * (s.head + s.a * catchT) / far; g.save(); g.setLineDash([5, 5]); g.strokeStyle = c.green; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, 12); g.lineTo(x, c.h - 12); g.stroke(); g.restore(); label(g, c, 'caught up!', x, c.h - 10, c.green); }
        const who = s.who ? s.who[0].toUpperCase() + s.who.slice(1) : '';
        return `${who} A starts ${fmt(s.head)} ${s.unit} ahead going ${fmt(s.a)} ${s.unit}/${s.time}; ${who} B chases at ${fmt(s.b)} · ${Number.isFinite(catchT) ? `B catches up after ${fmt(catchT, 2)} ${s.time}, ${fmt(s.b * catchT, 1)} ${s.unit} from the start (gap ÷ speed difference = ${fmt(s.head)} ÷ ${fmt(s.b - s.a)})` : 'B is not faster, so B never catches up'}`;
      },
    },
    ohm: {
      group: 'Physics', icon: 'bulb', title: 'Circuits (Ohm’s law)', blurb: 'Volts, amps and ohms', anim: true, loop: true,
      params: [range('volts', 'Battery voltage', 0, 24, .5, 9, 'V'), range('ohms', 'Each bulb’s resistance', 1, 1000, 1, 30, 'Ω'), range('bulbs', 'Bulbs in a row (series)', 1, 4, 1, 1)],
      presets: [['AA battery', { volts: 1.5, ohms: 5 }], ['Car battery', { volts: 12, ohms: 6 }], ['Many bulbs', { volts: 9, ohms: 10, bulbs: 4 }]],
      duration: () => 4,
      draw(g, s, c, t) {
        const R = s.ohms * s.bulbs, I = s.volts / R, P = I * I * s.ohms;
        const x0 = c.w * .15, x1 = c.w * .85, y0 = c.h * .2, y1 = c.h * .8;
        if (!c.ghost) {
          g.save(); g.strokeStyle = c.axis; g.lineWidth = 4; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
          g.fillStyle = c.surface; g.fillRect(x0 - 16, (y0 + y1) / 2 - 30, 32, 60); g.strokeRect(x0 - 16, (y0 + y1) / 2 - 30, 32, 60); g.fillStyle = c.text; g.fillRect(x0 - 8, (y0 + y1) / 2 - 36, 16, 6);
          label(g, c, `${fmt(s.volts, 1)} V`, x0 + 34, (y0 + y1) / 2, c.text, 'left');
          for (let i = 0; i < s.bulbs; i++) {
            const bx = x0 + (x1 - x0) * (i + 1) / (s.bulbs + 1), glow = clamp(P / 2, 0, 1);
            const gr = g.createRadialGradient(bx, y0, 2, bx, y0, 40); gr.addColorStop(0, `rgba(255,200,0,${.8 * glow})`); gr.addColorStop(1, 'rgba(255,200,0,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(bx, y0, 40, 0, Math.PI * 2); g.fill();
            ball(g, bx, y0, glow > .05 ? `rgb(255,${200 + 55 * (1 - glow)},${80 * (1 - glow)})` : c.surface, c.axis, 13);
          }
          // Current: dots moving around the loop, faster with more amps.
          if (t != null && I > 0) { const per = 2 * ((x1 - x0) + (y1 - y0)), sp = clamp(I * 600, 30, 900); for (let k = 0; k < 14; k++) { let d = ((t * sp) + k * per / 14) % per; let px, py; if (d < x1 - x0) { px = x0 + d; py = y0; } else if ((d -= x1 - x0) < y1 - y0) { px = x1; py = y0 + d; } else if ((d -= y1 - y0) < x1 - x0) { px = x1 - d; py = y1; } else { d -= x1 - x0; px = x0; py = y1 - d; } ball(g, px, py, c.blue, '#FFFFFF', 4); } }
          g.restore();
        }
        return `Current I = V ÷ R = ${fmt(s.volts, 1)} V ÷ ${fmt(R)} Ω = ${fmt(I, 3)} A (${fmt(I * 1000, 0)} mA) · each bulb uses ${fmt(P, 2)} W · more bulbs in a row = more resistance = dimmer`;
      },
    },
    interest: {
      group: 'Money', icon: 'coin', free: true, title: 'Interest', blurb: 'Saving, compounding, adding monthly',
      params: [range('p', 'Starting amount', 0, 100000, 100, 1000, '$'), range('r', 'Interest rate (per year)', 0, 30, .5, 5, '%'), range('t', 'Years', 1, 50, 1, 10),
        range('add', 'Added every month', 0, 5000, 25, 0, '$', true), select('every', 'Interest is added', [['year', 'every year'], ['month', 'every month'], ['day', 'every day']], 'year'), toggle('simple', 'Compare with simple interest', true)],
      presets: [['Save $50 a month', { p: 0, add: 50, r: 7, t: 30 }], ['Credit card debt', { p: 2000, r: 24, t: 5 }], ['Start young (50 years)', { p: 1000, r: 8, t: 50 }]],
      draw(g, s, c) {
        const n = { year: 1, month: 12, day: 365 }[s.every] || 1, r = s.r / 100;
        // Month by month: add this month's money, then grow it at the plan's
        // compounding (once a year, every month, or daily rolled into the month).
        const bal = [s.p], simple = [s.p]; let b = s.p;
        const monthly = n === 12 ? r / 12 : n === 365 ? Math.pow(1 + r / 365, 365 / 12) - 1 : 0;
        for (let y = 1; y <= s.t; y++) {
          for (let m = 0; m < 12; m++) { b += s.add; if (monthly) b *= 1 + monthly; }
          if (!monthly) b *= 1 + r;
          bal.push(b); simple.push(s.p + s.p * r * y + s.add * 12 * y);
        }
        const top = Math.max(...bal, ...(s.simple ? simple : [0]), 1) * 1.1, ch = chart(g, c, 0, s.t, 0, top, 46);
        ch.axes('years', 'dollars');
        if (!c.ghost) { const bw = Math.max(2, (ch.R - ch.L) / (s.t + 1) * .7); bal.forEach((v, y) => { g.fillStyle = c.green; g.fillRect(ch.X(y) - bw / 2, ch.Y(v), bw, ch.Y(0) - ch.Y(v)); }); }
        else ch.plot(y => bal[Math.round(y)], c.light, 3);
        if (s.simple) ch.plot(y => simple[Math.round(y)] ?? 0, c.orange, 3);
        const end = bal[bal.length - 1], putIn = s.p + s.add * 12 * s.t;
        return `After ${s.t} years: ${money(end)} (you put in ${money(putIn)}, interest earned ${money(end - putIn)})${s.simple ? ` · simple interest would give ${money(simple[simple.length - 1])}` : ''} · compounding ${s.every === 'year' ? 'once a year' : s.every === 'month' ? 'every month' : 'every day'}`;
      },
    },
    probability: {
      group: 'Chance', icon: 'coin', free: true, title: 'Coins & dice', blurb: 'Do results match the odds?', anim: true,
      params: [select('kind', 'Flip or roll', [['coin', 'A coin'], ['die', 'One die'], ['twodice', 'Two dice (add them)']], 'coin', false), range('trials', 'How many times', 10, 5000, 10, 100),
        toggle('expect', 'Show what to expect', true), select('pace', 'Speed', [['fast', 'Fast'], ['slow', 'Slow, one at a time']], 'fast')],
      presets: [['10 coin flips', { kind: 'coin', trials: 10 }], ['1000 coin flips', { kind: 'coin', trials: 1000 }], ['Two dice ×500', { kind: 'twodice', trials: 500 }]],
      duration: s => s.pace === 'slow' ? Math.min(30, s.trials * .25) : 3,
      draw(g, s, c, t) {
        const sides = s.kind === 'coin' ? 2 : 6, faces = s.kind === 'twodice' ? 11 : sides, R = rng(c.seed || 7);
        const done = t == null ? s.trials : Math.floor(clamp(t / this.duration(s), 0, 1) * s.trials), count = Array(faces).fill(0);
        for (let i = 0; i < done; i++) { const r1 = Math.floor(R() * sides); if (s.kind === 'twodice') count[r1 + Math.floor(R() * 6)]++; else count[r1]++; }
        const name = i => s.kind === 'coin' ? (i ? 'Tails' : 'Heads') : s.kind === 'die' ? String(i + 1) : String(i + 2);
        const prob = i => s.kind === 'twodice' ? (6 - Math.abs(i - 5)) / 36 : 1 / sides;
        const top = Math.max(...count, ...count.map((_, i) => prob(i) * s.trials)) * 1.15 || 1, L = 30, W = c.w - 50, B = c.h - 30, H = B - 20, bw = W / faces;
        if (!c.ghost) count.forEach((n, i) => {
          g.fillStyle = [c.orange, c.blue, c.green, c.purple, c.red, c.yellow][i % 6]; g.fillRect(L + i * bw + bw * .15, B - n / top * H, bw * .7, n / top * H);
          if (s.expect) { g.save(); g.setLineDash([5, 4]); g.strokeStyle = c.text; g.lineWidth = 2; const ey = B - prob(i) * s.trials / top * H; g.beginPath(); g.moveTo(L + i * bw + 4, ey); g.lineTo(L + (i + 1) * bw - 4, ey); g.stroke(); g.restore(); }
          label(g, c, name(i), L + i * bw + bw / 2, B + 12, c.text, 'center', 11); if (n) label(g, c, String(n), L + i * bw + bw / 2, B - n / top * H - 9, c.light, 'center', 10);
        });
        const best = count.indexOf(Math.max(...count));
        return `${done} of ${s.trials} ${s.kind === 'coin' ? 'flips' : 'rolls'} · ${count.map((n, i) => `${name(i)}: ${done ? fmt(n / done * 100, 1) : 0}%`).slice(0, 6).join(', ')}${faces > 6 ? '…' : ''} · expected ${s.kind === 'twodice' ? '7 is the most likely sum (6 of 36 ways)' : `${fmt(100 / sides, 1)}% each`}${done ? ` · most so far: ${name(best)}` : ''} · more tries get closer to the odds`;
      },
    },
    population: {
      group: 'Biology', icon: 'leaf', title: 'Population growth', blurb: 'Exponential vs carrying capacity', anim: true,
      params: [range('start', 'Starting population', 1, 1000, 1, 10), range('rate', 'Growth per generation', 1, 100, 1, 30, '%'), range('capacity', 'Carrying capacity (food & space)', 10, 10000, 10, 1000), range('years', 'Generations', 5, 100, 1, 40),
        toggle('logistic', 'Limited by food & space', true), toggle('both', 'Show unlimited growth too', true)],
      presets: [['Rabbits', { start: 2, rate: 60, capacity: 2000, years: 30 }], ['Slow growth', { rate: 5, years: 100 }]],
      duration: () => 4,
      draw(g, s, c, t) {
        const r = s.rate / 100, K = s.capacity, logi = [s.start], expo = [s.start];
        for (let y = 1; y <= s.years; y++) { const p = logi[y - 1]; logi.push(p + r * p * (1 - p / K)); expo.push(expo[y - 1] * (1 + r)); }
        const main = s.logistic ? logi : expo, show = t == null ? s.years : clamp(t / 4, 0, 1) * s.years;
        const top = Math.max(K * 1.15, ...(s.logistic ? logi : expo).map(v => v * 1.1));
        const ch = chart(g, c, 0, s.years, 0, Math.min(top, K * 3), 48); ch.axes('generations', 'population');
        if (s.logistic && !c.ghost) { g.save(); g.setLineDash([6, 5]); g.strokeStyle = c.red; g.lineWidth = 2; g.beginPath(); g.moveTo(ch.L, ch.Y(K)); g.lineTo(ch.R, ch.Y(K)); g.stroke(); g.restore(); label(g, c, 'carrying capacity', ch.R - 4, ch.Y(K) - 10, c.red, 'right', 11); }
        if (s.both && s.logistic) ch.plot(y => expo[Math.round(y)], c.light, 2, 0, show);
        ch.plot(y => { const i = Math.floor(y), f = y - i; return main[i] + ((main[i + 1] ?? main[i]) - main[i]) * f; }, c.ghost ? c.light : c.green, 3, 0, show);
        const half = logi.findIndex(v => v >= K / 2);
        return `After ${s.years} generations: ${fmt(main[main.length - 1], 0)}${s.logistic ? ` (levels off near ${fmt(K)})${half > 0 ? ` · reaches half of it at generation ${half}` : ''}` : ' (no limit, so it keeps exploding)'}${s.both && s.logistic ? ` · unlimited growth would be ${fmt(expo[expo.length - 1], 0)}` : ''}`;
      },
    },
  };
  // ── Challenges: goals checked live as you move things (done ones are kept on this device).
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const rootsOf = (f, X = 10) => { const out = []; let px = -X, py = f(px); for (let i = 1; i <= 400; i++) { const x = -X + 2 * X * i / 400, y = f(x); if (Number.isFinite(py) && Number.isFinite(y) && py * y <= 0 && py !== y) out.push(px - py * (x - px) / (y - py)); px = x; py = y; } return out; };
  const CHALLENGES = {
    equation: [['Make your graph cross the x-axis at x = 3', s => { try { const m = parseMath(s.eq), env = Object.fromEntries(LETTERS.map(L => [L, s['p_' + L]])); return rootsOf(x => m.f({ ...env, x }), s.xmax).some(r => near(r, 3, .05)); } catch (_) { return false; } }],
      ['Graph two equations that meet at exactly one point', s => { try { if (!s.eq2.trim()) return false; const a = parseMath(s.eq), b = parseMath(s.eq2), env = Object.fromEntries(LETTERS.map(L => [L, s['p_' + L]])); return rootsOf(x => a.f({ ...env, x }) - b.f({ ...env, x }), s.xmax).length === 1; } catch (_) { return false; } }]],
    line: [['Make a line that goes through (2, 7)', s => near(s.m * 2 + s.b, 7, .01)], ['Make a line parallel to y = 3x − 1 (but not the same line)', s => s.m === 3 && s.b !== -1], ['Turn on a second line and make them cross at (1, 4)', s => s.second && s.m !== s.m2 && near(s.m + s.b, 4, .01) && near(s.m2 + s.b2, 4, .01)]],
    parabola: [['Put the vertex at (2, −1)', s => s.a && near(-s.b / (2 * s.a), 2, .01) && near(s.c - s.b * s.b / (4 * s.a), -1, .01)], ['Make a parabola with no x-intercepts that opens up', s => s.a > 0 && s.b * s.b - 4 * s.a * s.c < 0], ['Make it open down and cross at x = −1 and x = 3', s => s.a < 0 && rootsOf(x => s.a * x * x + s.b * x + s.c).length === 2 && rootsOf(x => s.a * x * x + s.b * x + s.c).every(r => near(r, -1, .05) || near(r, 3, .05))]],
    sine: [['Make the period 4π (one wave every 12.57 units)', s => near(s.freq, .5, .001)], ['Make the wave go from −1 up to 5', s => near(s.shift - s.amp, -1, .01) && near(s.shift + s.amp, 5, .01)]],
    exponential: [['Make the amount double about every 4 steps', s => s.rate > 0 && near(Math.log(2) / Math.log(1 + s.rate / 100), 4, .3)], ['Shrink 1000 to under 10 in 10 steps', s => s.start >= 1000 && s.start * Math.pow(1 + s.rate / 100, s.steps) < 10 && s.steps <= 10]],
    fraction: [['Make a fraction equal to 40%', s => near(s.n / s.d, .4, 1e-9)], ['Make a fraction equal to 2/3 with a bottom of 9', s => s.n === 6 && s.d === 9], ['Make a fraction bigger than 1', s => s.n > s.d]],
    unitcircle: [['Find an angle where sine and cosine are equal', s => near(Math.sin(s.angle * Math.PI / 180), Math.cos(s.angle * Math.PI / 180), .01)], ['Find an angle where cosine is −1', s => near(Math.cos(s.angle * Math.PI / 180), -1, 1e-6)]],
    projectile: [['Land exactly 30 m away (±0.5 m)', s => { const m = T.projectile.model(s), p = m.pts[m.pts.length - 1]; return near(p.x, 30, .5); }], ['Reach a height of 20 m', s => T.projectile.model(s).pts.some(p => p.y >= 20)], ['On the Moon, land 100 m away (±2 m)', s => s.planet === 'moon' && near(T.projectile.model(s).pts.slice(-1)[0].x, 100, 2)]],
    freefall: [['On Earth with no air, find a drop that takes 3 s', s => s.planet === 'earth' && !s.drag && near(T.freefall.model(s).end, 3, .06)], ['Make something land slower than 10 m/s from 50 m or higher', s => s.height >= 50 && T.freefall.model(s).pts.slice(-1)[0].v < 10]],
    pendulum: [['Make one full swing take 2 s on Earth', s => s.planet === 'earth' && near(2 * Math.PI * Math.sqrt(s.length / 9.81), 2, .03)], ['Make a 1 m pendulum swing faster than 1 s', s => s.length === 1 && 2 * Math.PI * Math.sqrt(1 / PLANETS[s.planet][0]) < 1]],
    spring: [['Make one bounce take exactly 1 s', s => near(2 * Math.PI * Math.sqrt(s.mass / s.k), 1, .02)], ['Use a 5 kg mass and still bounce faster than 1 s', s => s.mass >= 5 && 2 * Math.PI * Math.sqrt(s.mass / s.k) < 1]],
    motion: [['Make B catch A after exactly 3 hours', s => s.time === 'h' && s.b > s.a && near(s.head / (s.b - s.a), 3, .01)], ['Make B never catch up', s => s.b <= s.a && s.head > 0]],
    ohm: [['Make exactly 0.5 A flow', s => near(s.volts / (s.ohms * s.bulbs), .5, .001)], ['Light 4 bulbs with a 12 V battery and at least 0.1 A', s => s.bulbs === 4 && s.volts === 12 && s.volts / (s.ohms * 4) >= .1]],
    interest: [['Grow $1,000 into $5,000 (no monthly adds)', s => s.p === 1000 && s.add === 0 && s.p * Math.pow(1 + s.r / 100, s.t) >= 5000], ['Reach $100,000 in 30 years or less', s => { const r = s.r / 100; let b = s.p; for (let y = 0; y < s.t; y++) { b += s.add * 12; b *= 1 + r; } return s.t <= 30 && b >= 100000; }]],
    probability: [['Flip a coin 1000 times or more', s => s.kind === 'coin' && s.trials >= 1000], ['Roll two dice 500 times and look for the most common sum', s => s.kind === 'twodice' && s.trials >= 500]],
    population: [['Make it reach half its capacity by generation 10', s => { const r = s.rate / 100; let p = s.start; for (let y = 1; y <= 10; y++) p += r * p * (1 - p / s.capacity); return s.logistic && p >= s.capacity / 2; }], ['Turn off the limit and pass 1,000,000', s => !s.logistic && s.start * Math.pow(1 + s.rate / 100, s.years) > 1e6]],
  };
  const DONE_KEY = 'knoxSimChallenges.v1';
  const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch (_) { return new Set(); } };
  const markDone = id => { const d = doneSet(); d.add(id); try { localStorage.setItem(DONE_KEY, JSON.stringify([...d])); } catch (_) {} };

  const GROUPS = ['Math', 'Physics', 'Money', 'Chance', 'Biology'];
  const ORDER = ['equation', 'projectile', 'line', 'parabola', 'fraction', 'interest', 'probability', 'freefall', 'pendulum', 'spring', 'motion', 'ohm', 'sine', 'exponential', 'unitcircle', 'population'];
  const COMMON = [range('speedx', 'Playback speed', .25, 3, .25, 1, '×', true), toggle('grid', 'Show the grid', true), toggle('labels', 'Show labels and numbers', true)];
  const paramsOf = id => [...T[id].params, ...COMMON.filter(p => p.k !== 'speedx' || T[id].anim)];
  const defaults = id => Object.fromEntries(paramsOf(id).map(p => [p.k, p.v]));
  function cleanValues(id, vals) {
    const s = defaults(id);
    for (const p of paramsOf(id)) {
      const v = vals?.[p.k]; if (v == null) continue;
      if (p.type === 'range') { const n = Number(v); if (Number.isFinite(n)) s[p.k] = clamp(Math.round(n / p.step) * p.step, p.min, p.max); }
      else if (p.type === 'text') s[p.k] = String(v).slice(0, 200);
      else if (p.type === 'toggle') s[p.k] = v === true || v === 1 || v === '1' || v === 'true';
      else if (p.type === 'select' && p.options.some(o => o[0] === String(v))) s[p.k] = String(v);
    }
    // A second line/fraction the builder filled in should show.
    if (id === 'line' && (vals?.m2 != null || vals?.b2 != null) && vals?.second == null) s.second = true;
    if (id === 'fraction' && (vals?.n2 != null || vals?.d2 != null) && vals?.compare == null) s.compare = true;
    return s;
  }
  const canUse = id => T[id].free || paid();
  const unitFmt = (p, v) => p.unit === '$' ? '$' + fmt(v) : fmt(v) + (p.unit ? ' ' + p.unit : '');

  // ── Saved sims (this device, per account) ────────────────────────────────
  const saveKey = () => 'knoxSimLab.v1:' + (window.currentUser?.uid || 'guest');
  const readSaved = () => { try { const v = JSON.parse(localStorage.getItem(saveKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const writeSaved = list => { try { localStorage.setItem(saveKey(), JSON.stringify(list.slice(0, 200))); return true; } catch (_) { return false; } };

  // ── The page ─────────────────────────────────────────────────────────────
  let host = null, tab = 'build', filter = 'All', editor = null, buildBusy = false, buildMsg = '', lastPrompt = '';
  const EXAMPLES = ['A soccer ball kicked at 25 m/s off a 30 m cliff', 'Dropping a feather and a rock on the Moon', 'Saving $50 a month at 7% for 30 years', 'Rolling two dice 1000 times', 'Where y = 2x + 1 and y = -x + 7 cross', 'A 3 m pendulum on Mars', 'How fast rabbits grow with limited food'];
  function show(h) { host = h; editor?.stop(); editor = null; renderHome(); }
  function costLine() {
    const t = tier();
    return t === 'mega' ? '💎 Mega Knox — up to 100 Knox builds a day, every simulation and setting, unlimited saves and Compare runs.'
      : t === 'plus' ? '⚡ Knox Plus — up to 20 Knox builds a day, every simulation and setting, 25 saves. 💎 Mega Knox adds 100 builds a day and Compare runs.'
      : 'Free — each Knox build costs 2 credits and uses the 6 starter simulations; 3 saves. ⚡ Knox Plus unlocks every simulation and setting and 20 builds a day.';
  }
  function renderHome() {
    if (!host) return;
    const saved = readSaved();
    const tabs = [['build', 'sparkle', 'Knox builds it'], ['play', 'sliders', 'Playground'], ['make', 'pencil', 'Make your own'], ['mine', 'cards', `My sims${saved.length ? ` (${saved.length})` : ''}`]];
    let body = '';
    if (tab === 'build') {
      body = `<div class="sl-build">
          <label class="sl-label" for="slPrompt">What do you want to see?</label>
          <textarea id="slPrompt" class="sl-prompt" maxlength="500" placeholder="e.g. A basketball thrown at 8 m/s at 50° from 2 m up — does it reach a hoop 5 m away?">${esc(lastPrompt)}</textarea>
          <div class="sl-examples">${EXAMPLES.map(e => `<button type="button" class="sl-chip" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>
          <div class="sl-build-row"><button type="button" class="sl-btn sl-go" data-build${buildBusy ? ' disabled' : ''}>${buildBusy ? '<span class="sl-spin" aria-hidden="true"></span> Knox is building…' : `${ki('spark', false)} Build it`}</button></div>
          ${buildMsg ? `<p class="sl-msg" role="status">${buildMsg}</p>` : ''}
          <p class="sl-cost">${costLine()}</p>
        </div>`;
    } else if (tab === 'make') {
      body = `<div class="sl-make">
          <div class="sl-make-hero"><span class="sl-ico" aria-hidden="true">${ki('pencil')}</span><div><b>Build a simulation from scratch</b><span>Drop in balls, blocks, ramps, walls, springs and targets. Set gravity, air and bounce. Add sliders and graphs, then press Play.</span></div></div>
          <div class="sl-make-grid">
            <button type="button" class="sl-tile g-physics" data-make="blank"><span class="sl-ico" aria-hidden="true">${ki('target')}</span><b>Hit the target</b><small>A ball, a target and a slider to start from</small></button>
            <button type="button" class="sl-tile g-math" data-make="ramp"><span class="sl-ico" aria-hidden="true">${ki('chart')}</span><b>Ramp race</b><small>Two balls roll down ramps — which wins?</small></button>
            <button type="button" class="sl-tile g-chance" data-make="spring"><span class="sl-ico" aria-hidden="true">${ki('bolt')}</span><b>Bouncy spring</b><small>A block on a spring with a graph</small></button>
            <button type="button" class="sl-tile g-money" data-make="crash"><span class="sl-ico" aria-hidden="true">${ki('spark')}</span><b>Collisions</b><small>A heavy and a light ball crash</small></button>
            <button type="button" class="sl-tile g-biology" data-make="empty"><span class="sl-ico" aria-hidden="true">${ki('pencil')}</span><b>Empty world</b><small>Start with nothing at all</small></button>
          </div>
          <p class="sl-cost">${window.knoxSimBuilder ? (() => { const L = window.knoxSimBuilder.LIMITS[tier()]; return `Your plan: up to ${L.objects} things, ${L.sliders} slider${L.sliders === 1 ? '' : 's'} and ${L.graphs} graph${L.graphs === 1 ? '' : 's'} per simulation.` + (tier() === 'free' ? ' ⚡ Knox Plus: 20 things, 6 sliders, 3 graphs.' : tier() === 'plus' ? ' 💎 Mega Knox: 50 things, 12 sliders, 6 graphs.' : ''); })() : ''}</p></div>`;
    } else if (tab === 'play') {
      const ids = ORDER.filter(id => filter === 'All' || T[id].group === filter);
      body = `<div class="sl-filters">${['All', ...GROUPS].map(g => `<button type="button" class="sl-chip${filter === g ? ' on' : ''}" data-filter="${g}">${g}</button>`).join('')}</div>
        <div class="sl-grid">${ids.map(id => `<button type="button" class="sl-tile g-${T[id].group.toLowerCase()}" data-open="${id}"><span class="sl-ico" aria-hidden="true">${ki(T[id].icon)}</span><b>${esc(T[id].title)}</b><small>${esc(T[id].blurb)}</small>${canUse(id) ? '' : tag('plus')}</button>`).join('')}</div>
        <p class="sl-cost">${costLine()}</p>`;
    } else {
      body = saved.length ? `<div class="sl-saved">${saved.map((x, i) => `<div class="sl-save-row"><button type="button" class="sl-save-open" data-saved="${i}"><span class="sl-ico" aria-hidden="true">${ki(T[x.type]?.icon || 'sliders')}</span><span><b>${esc(x.title)}</b><small>${esc(T[x.type]?.title || '')} · ${new Date(x.at).toLocaleDateString()}</small></span></button><button type="button" class="sl-x" data-unsave="${i}" aria-label="Delete ${esc(x.title)}">✕</button></div>`).join('')}</div>`
        : `<div class="sl-empty"><b>Nothing saved yet</b><span>Open a simulation, set it up, and press Save — it shows up here.</span></div>`;
      body += `<p class="sl-cost">Saves on this device: ${SAVE_MAX[tier()] === Infinity ? 'unlimited (Mega Knox)' : `${saved.length} of ${SAVE_MAX[tier()]}`}.</p>`;
    }
    host.innerHTML = fill(`<div class="sl-wrap"><div class="sl-head"><span class="sl-badge">${ki('sliders', false)} Simulation Lab</span><h2>Play with <span>math &amp; science</span></h2><p>Build a simulation with Knox, or open one and change everything.</p></div>
      <div class="sl-tabs" role="tablist">${tabs.map(([id, icon, name]) => `<button type="button" role="tab" class="sl-tab${tab === id ? ' on' : ''}" aria-selected="${tab === id}" data-tab="${id}">${ki(icon === 'sparkle' ? 'spark' : icon, false)}<span>${name}</span></button>`).join('')}</div>
      ${body}</div>`);
    host.scrollTop = 0;
  }

  async function build() {
    const box = $('#slPrompt', host), prompt = (box?.value || '').trim(); lastPrompt = prompt;
    if (prompt.length < 3) { buildMsg = 'Tell Knox what you want to see first.'; renderHome(); return; }
    const user = window.currentUser;
    if (!user?.getIdToken) { window.openAuthModal?.('signup'); buildMsg = 'Sign in so Knox can build it for you.'; renderHome(); return; }
    buildBusy = true; buildMsg = ''; renderHome();
    try {
      const r = await fetch('/api/me?route=sim-build', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.sim?.type === 'custom' && j.sim.scene) { buildBusy = false; if (typeof j.creditsLeft === 'number') window.knoxRefreshPlan?.(); openBuilder(j.sim.scene, { explain: j.sim.explain }); return; }
      if (!r.ok || !j.sim || !T[j.sim.type]) throw Object.assign(new Error(j.error || 'Knox couldn’t build that one. Try saying it another way.'), { upgrade: j.upgrade });
      buildBusy = false;
      if (typeof j.creditsLeft === 'number') window.knoxRefreshPlan?.();
      open(j.sim.type, j.sim.values, { title: j.sim.title, explain: j.sim.explain, prompt });
    } catch (e) {
      buildBusy = false; buildMsg = esc(e.message) + (e.upgrade && !window.knoxNativeApp ? ' <button type="button" class="sl-link" data-upgrade>See plans</button>' : ''); renderHome();
    }
  }

  // ── Make your own (simbuilder.js) ────────────────────────────────────────
  const STARTERS = {
    blank: () => window.knoxSimBuilder.blank(),
    empty: () => ({ title: 'My simulation', world: { planet: 'earth', air: 0, bounce: .5, friction: .3, width: 40 }, objects: [] }),
    ramp: () => ({ title: 'Ramp race', world: { planet: 'earth', air: 0, bounce: .3, friction: .2, width: 40 }, objects: [
      { id: 'r1', kind: 'ramp', x: 2, y: 14, len: 16, angle: -40, color: '#1CB0F6', name: 'Steep ramp' }, { id: 'r2', kind: 'ramp', x: 2, y: 6, len: 20, angle: -15, color: '#A560F2', name: 'Gentle ramp' },
      { id: 'a', kind: 'ball', x: 2.6, y: 14.9, r: .6, mass: 1, color: '#FF6B00', name: 'Ball A' }, { id: 'b', kind: 'ball', x: 2.6, y: 6.9, r: .6, mass: 1, color: '#1FA45A', name: 'Ball B' },
      { id: 'w', kind: 'wall', x: 38, len: 4, color: '#3C3C3C', name: 'Finish' }], sliders: [{ obj: 'r1', prop: 'angle', min: -70, max: -5 }], graphs: [{ obj: 'a', prop: 'speed' }] }),
    spring: () => ({ title: 'Bouncy spring', world: { planet: 'earth', air: .1, bounce: .5, friction: .3, width: 20 }, objects: [
      { id: 's', kind: 'spring', x: 10, y: 14, k: 40, rest: 4, to: 'm', color: '#A560F2', name: 'Spring' }, { id: 'm', kind: 'box', x: 10, y: 6, w: 1.4, mass: 2, color: '#1CB0F6', name: 'Block' }],
      sliders: [{ obj: 's', prop: 'k', min: 5, max: 200 }, { obj: 'm', prop: 'mass', min: .5, max: 10 }], graphs: [{ obj: 'm', prop: 'y' }] }),
    crash: () => ({ title: 'Collisions', world: { planet: 'space', air: 0, bounce: .9, friction: 0, width: 40 }, objects: [
      { id: 'h', kind: 'ball', x: 6, y: 8, r: 1.4, mass: 10, speed: 8, dir: 0, color: '#E5383B', name: 'Heavy' }, { id: 'l', kind: 'ball', x: 26, y: 8, r: .7, mass: 1, speed: 0, dir: 0, color: '#FFC800', name: 'Light' }],
      sliders: [{ obj: 'h', prop: 'mass', min: .5, max: 50 }], graphs: [{ obj: 'l', prop: 'speed' }] }),
  };
  function openBuilder(scene, meta = {}) {
    if (!window.knoxSimBuilder) return;
    editor?.stop();
    const b = window.knoxSimBuilder.mount(host, scene, {
      tier: tier(), explain: meta.explain,
      onBack: () => { editor = null; tab = 'make'; renderHome(); },
      onSave: sc => { const list = readSaved(), max = SAVE_MAX[tier()]; if (list.length >= max) { upsell(tier() === 'plus' ? 'mega' : 'plus', `You’ve saved ${max} — that’s the limit on your plan. Delete one in My sims, or upgrade to save more.`); return false; } list.unshift({ type: 'custom', values: sc, title: sc.title, at: Date.now() }); writeSaved(list); return true; },
      onShare: (sc, btn) => shareSim({ type: 'custom', values: sc, title: sc.title }, btn),
    });
    editor = { stop: b.stop, click: () => {} };
  }

  // ── The editor ───────────────────────────────────────────────────────────
  function open(id, vals, meta = {}) {
    if (!T[id]) return;
    if (!canUse(id)) { tab = 'play'; renderHome(); upsell('plus', `${T[id].title} is in ⚡ Knox Plus — every simulation and all the settings.`); return; }
    editor?.stop();
    editor = makeEditor(id, cleanValues(id, vals), meta);
  }
  // Share: a link that opens this exact setup (filled in by the share step).
  function shareSim(item, btn) { window.knoxSimShare ? window.knoxSimShare(item, btn) : (btn.textContent = 'Sharing soon'); }
  function upsell(level, text) {
    const n = host?.querySelector('.sl-upsell'); n?.remove();
    host?.querySelector('.sl-wrap, .sl-ed')?.insertAdjacentHTML('afterbegin', fill(`<div class="sl-upsell">${level === 'mega' ? '💎' : '⚡'} <span>${text}</span>${window.knoxNativeApp ? '' : '<button type="button" class="sl-btn sm" data-upgrade>See plans</button>'}<button type="button" class="sl-x" data-close-upsell aria-label="Close">✕</button></div>`));
  }

  function makeEditor(id, s, meta) {
    const def = T[id], params = paramsOf(id), basic = params.filter(p => !p.more), more = params.filter(p => p.more);
    let t = def.anim ? 0 : null, playing = false, raf = 0, last = 0, ghost = null, seed = (Math.random() * 1e9) | 0, title = meta.title || def.title, moreOpen = paid();
    const ctl = p => {
      const v = s[p.k], lock = p.more && !paid();
      if (p.type === 'text') return `<label class="sl-field sl-text${lock ? ' locked' : ''}"><span>${esc(p.label)}</span><input type="text" data-k="${p.k}" value="${esc(v)}" spellcheck="false" autocomplete="off" maxlength="200"${lock ? ' disabled' : ''}></label>`;
      const hide = p.show && !p.show(s) ? ' hidden' : '';
      if (p.type === 'toggle') return `<label class="sl-toggle${lock ? ' locked' : ''}"><input type="checkbox" data-k="${p.k}"${v ? ' checked' : ''}${lock ? ' disabled' : ''}><span class="sl-sw" aria-hidden="true"></span><span>${esc(p.label)}</span></label>`;
      if (p.type === 'select') return `<label class="sl-field${lock ? ' locked' : ''}"><span>${esc(p.label)}</span><select data-k="${p.k}"${lock ? ' disabled' : ''}>${p.options.map(([o, n]) => `<option value="${o}"${o === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
      return `<label class="sl-field${lock ? ' locked' : ''}"${hide}><span>${esc(p.label)} <output data-out="${p.k}">${esc(unitFmt(p, v))}</output></span><input type="range" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"${lock ? ' disabled' : ''}></label>`;
    };
    const presets = def.presets || [];
    host.innerHTML = fill(`<div class="sl-ed">
      <div class="sl-top"><button type="button" class="sl-back" data-back>← Simulation Lab</button>
        <input class="sl-title" value="${esc(title)}" maxlength="40" aria-label="Name">
        <div class="sl-top-btns"><button type="button" class="sl-btn ghost sm" data-ask>${ki('think', false)} Ask Knox</button><button type="button" class="sl-btn sm" data-save>Save</button></div></div>
      ${meta.explain ? `<div class="sl-explain">${ki('spark', false)}<span>${esc(meta.explain)}</span></div>` : ''}
      <div class="sl-main">
        <div class="sl-stage"><canvas class="sl-canvas" aria-label="${esc(def.title)} simulation"></canvas>
          <div class="sl-play">${def.anim ? `<button type="button" class="sl-btn" data-play>▶ Play</button><button type="button" class="sl-btn ghost" data-restart>↺ Restart</button>` : ''}
            ${id === 'probability' ? '<button type="button" class="sl-btn ghost" data-reroll>🎲 New run</button>' : ''}
            <button type="button" class="sl-btn ghost" data-random>Randomize</button><button type="button" class="sl-btn ghost" data-reset>Reset</button>
            <button type="button" class="sl-btn ghost${tier() === 'mega' ? '' : ' locked'}" data-compare>${ghost ? 'Stop comparing' : 'Compare'} ${tier() === 'mega' ? '' : tag('mega')}</button></div>
          <p class="sl-readout" aria-live="polite"></p></div>
        <div class="sl-controls">
          ${CHALLENGES[id] ? `<div class="sl-chal"><span class="sl-label">${ki('target', false)} Challenges</span>${CHALLENGES[id].map(([txt], i) => `<div class="sl-chal-row${doneSet().has(id + i) ? ' done' : ''}" data-ch="${i}"><span class="sl-chal-box" aria-hidden="true"></span><span>${esc(txt)}</span></div>`).join('')}</div>` : ''}
          ${presets.length ? `<div class="sl-presets"><span class="sl-label">Try</span>${presets.map(([n], i) => `<button type="button" class="sl-chip" data-preset="${i}">${esc(n)}</button>`).join('')}</div>` : ''}
          <div class="sl-group">${basic.map(ctl).join('')}</div>
          ${more.length ? `<button type="button" class="sl-more${moreOpen ? ' open' : ''}" data-more aria-expanded="${moreOpen}">More settings ${paid() ? '' : tag('plus')}<span aria-hidden="true">▾</span></button>
          <div class="sl-group sl-more-box"${moreOpen ? '' : ' hidden'}>${more.map(ctl).join('')}</div>` : ''}
        </div>
      </div></div>`);
    host.scrollTop = 0;
    const canvas = $('.sl-canvas', host), g = canvas.getContext('2d'), readout = $('.sl-readout', host);
    const colors = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      return { orange: css('--orange') || '#FF6B00', blue: '#1CB0F6', purple: '#A560F2', green: '#1FA45A', red: '#E5383B', yellow: '#FFC800',
        text: css('--text') || '#3C3C3C', light: css('--text-light') || '#8A8A8A', surface: css('--surface') || '#FFFFFF', axis: dark ? '#7F8FA6' : '#9A8F86',
        grid: dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)', ground: dark ? '#2A3A2E' : '#DDF4E6', cliff: dark ? '#4A3B30' : '#D9C3AE' };
    };
    function size() { const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(2, devicePixelRatio || 1); canvas.width = w * d; canvas.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); }
    function draw() {
      const c = { w: canvas.clientWidth, h: canvas.clientHeight, s, seed, ...colors() };
      g.clearRect(0, 0, c.w, c.h);
      let text = '';
      try {
        if (ghost) { g.save(); g.globalAlpha = .4; def.draw.call(def, g, ghost, { ...c, s: ghost, ghost: true }, t); g.restore(); }
        text = def.draw.call(def, g, s, c, t);
      } catch (e) { text = 'That setup can’t be drawn — try different numbers.'; }
      readout.textContent = (ghost ? 'Faded = your saved setup · ' : '') + (text || '');
      checkChallenges();
    }
    // A challenge you meet lights up with confetti (once).
    let chTimer = 0;
    function checkChallenges() {
      clearTimeout(chTimer);
      chTimer = setTimeout(() => (CHALLENGES[id] || []).forEach(([, ok], i) => {
        const row = host.querySelector(`.sl-chal-row[data-ch="${i}"]`); if (!row) return;
        let met = false; try { met = !!ok(s); } catch (_) {}
        row.classList.toggle('now', met);
        if (met && !row.classList.contains('done')) { row.classList.add('done'); markDone(id + i); celebrate(); }
      }), 250);
    }
    function celebrate() {
      window.knoxSound?.fx?.fanfare?.(false);
      const st = host.querySelector('.sl-stage'); if (!st) return;
      const c = document.createElement('div'); c.className = 'sb-confetti'; c.innerHTML = Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--c:${['#FF6B00', '#1CB0F6', '#1FA45A', '#A560F2', '#E5383B', '#FFC800'][i % 6]};--d:${.9 + (i % 5) * .2}s"></i>`).join('');
      st.append(c); setTimeout(() => c.remove(), 2200);
    }
    const dur = () => def.duration ? def.duration.call(def, s) : 4;
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      t += dt * (s.speedx || 1);
      if (t >= dur()) { if (def.loop) t %= dur(); else { t = dur(); setPlaying(false); draw(); return; } }
      draw(); raf = requestAnimationFrame(frame);
    }
    function setPlaying(on) {
      playing = on; cancelAnimationFrame(raf);
      const b = $('[data-play]', host); if (b) b.textContent = on ? '⏸ Pause' : '▶ Play';
      if (on) { if (t >= dur() && !def.loop) t = 0; last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    function syncControls() {
      for (const p of params) {
        const el = host.querySelector(`[data-k="${p.k}"]`); if (!el) continue;
        if (p.type === 'toggle') el.checked = !!s[p.k]; else el.value = s[p.k];
        const o = host.querySelector(`[data-out="${p.k}"]`); if (o) o.textContent = unitFmt(p, s[p.k]);
      }
    }
    const onInput = e => {
      const k = e.target.dataset.k; if (!k) return;
      const p = params.find(x => x.k === k);
      s[k] = p.type === 'toggle' ? e.target.checked : p.type === 'select' || p.type === 'text' ? e.target.value : Number(e.target.value);
      if (p.type === 'text') for (const q of params) if (q.show) { const el = host.querySelector(`[data-k="${q.k}"]`)?.closest('.sl-field'); if (el) el.hidden = !q.show(s); }
      const o = host.querySelector(`[data-out="${k}"]`); if (o) o.textContent = unitFmt(p, s[k]);
      if (def.anim && !playing && k !== 'speedx') t = def.loop ? t : 0;
      draw();
    };
    host.addEventListener('input', onInput); host.addEventListener('change', onInput);
    const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(canvas);
    size(); draw();
    if (def.anim) setPlaying(true);
    const ed = {
      stop() { cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener('input', onInput); host.removeEventListener('change', onInput); },
      click(b) {
        if (b.matches('[data-play]')) setPlaying(!playing);
        else if (b.matches('[data-restart]')) { t = 0; setPlaying(true); }
        else if (b.matches('[data-reroll]')) { seed = (Math.random() * 1e9) | 0; t = 0; setPlaying(true); }
        else if (b.matches('[data-reset]')) { Object.assign(s, defaults(id)); syncControls(); t = def.anim ? 0 : null; draw(); if (def.anim) setPlaying(true); }
        else if (b.matches('[data-random]')) { for (const p of basic) if (p.type === 'range' && (!p.show || p.show(s))) s[p.k] = clamp(Math.round((p.min + Math.random() * (p.max - p.min)) / p.step) * p.step, p.min, p.max); syncControls(); t = def.anim ? 0 : null; draw(); if (def.anim) setPlaying(true); }
        else if (b.matches('[data-preset]') && !paid() && Object.keys(def.presets[+b.dataset.preset][1]).some(k => more.some(p => p.k === k))) { upsell('plus', 'That one uses More settings (other planets, air, cliffs…) — they come with ⚡ Knox Plus.'); }
        else if (b.matches('[data-preset]')) { Object.assign(s, defaults(id), cleanValues(id, def.presets[+b.dataset.preset][1])); syncControls(); t = def.anim ? 0 : null; draw(); if (def.anim) setPlaying(true); }
        else if (b.matches('[data-more]')) {
          if (!paid()) { upsell('plus', 'More settings — gravity on other planets, air resistance, trails, speed and more — come with ⚡ Knox Plus.'); }
          moreOpen = !moreOpen; b.classList.toggle('open', moreOpen); b.setAttribute('aria-expanded', String(moreOpen)); const box = $('.sl-more-box', host); if (box) box.hidden = !moreOpen;
        }
        else if (b.matches('[data-compare]')) {
          if (tier() !== 'mega') { upsell('mega', 'Compare keeps a faded copy of one setup while you change the other — a 💎 Mega Knox tool.'); return; }
          ghost = ghost ? null : { ...s }; b.firstChild.textContent = ghost ? 'Stop comparing ' : 'Compare '; draw();
        }
        else if (b.matches('[data-save]')) {
          const list = readSaved(), max = SAVE_MAX[tier()], name = ($('.sl-title', host)?.value || def.title).trim().slice(0, 40) || def.title;
          if (list.length >= max) { upsell(tier() === 'plus' ? 'mega' : 'plus', `You’ve saved ${max} — that’s the limit on your plan. Delete one in My sims, or upgrade to save more.`); return; }
          list.unshift({ type: id, values: { ...s }, title: name, at: Date.now() }); writeSaved(list);
          b.textContent = 'Saved ✓'; setTimeout(() => { if (b.isConnected) b.textContent = 'Save'; }, 1600);
        }
        else if (b.matches('[data-ask]')) {
          const desc = params.filter(p => !['grid', 'labels', 'speedx', 'trail', 'vectors', 'peak', 'graph', 'trace', 'points', 'rider', 'tri', 'vertex', 'roots', 'axis', 'expect', 'pace', 'both'].includes(p.k))
            .map(p => `${p.label}: ${p.type === 'toggle' ? (s[p.k] ? 'on' : 'off') : p.type === 'select' ? (p.options.find(o => o[0] === s[p.k])?.[1] || s[p.k]) : fmt(s[p.k]) + (p.unit ? ' ' + p.unit : '')}`).join(', ');
          const q = `I'm playing with the "${def.title}" simulation (${desc}). It shows: ${readout.textContent}. Can you explain what's happening and why?`;
          // A new Ask Knox chat with the question ready to send.
          document.querySelector('.sidebar-quicknav-link[data-nav="chat"]')?.click(); window.closeSims?.();
          setTimeout(() => { const input = document.getElementById('appChatInput'); if (input) { input.value = q; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } }, 120);
        }
        else if (b.matches('[data-back]')) { ed.stop(); editor = null; renderHome(); }
      },
    };
    return ed;
  }

  // One click handler for the whole page (home and editor).
  document.addEventListener('click', e => {
    if (!host || !host.contains(e.target)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-close-upsell]')) { b.closest('.sl-upsell')?.remove(); return; }
    if (b.matches('[data-upgrade]')) { window.goToPricing?.(); return; }
    if (editor) { editor.click(b); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; buildMsg = ''; renderHome(); return; }
    if (b.dataset.filter) { filter = b.dataset.filter; renderHome(); return; }
    if (b.dataset.example) { const box = $('#slPrompt', host); if (box) { box.value = b.dataset.example; lastPrompt = box.value; box.focus(); } return; }
    if (b.matches('[data-build]')) { build(); return; }
    if (b.dataset.open) { open(b.dataset.open); return; }
    if (b.dataset.saved != null) { const x = readSaved()[+b.dataset.saved]; if (x) x.type === 'custom' ? openBuilder(x.values) : open(x.type, x.values, { title: x.title }); return; }
    if (b.dataset.make) { openBuilder(STARTERS[b.dataset.make]?.()); return; }
    if (b.dataset.unsave != null) { const list = readSaved(); list.splice(+b.dataset.unsave, 1); writeSaved(list); renderHome(); }
  });
  document.addEventListener('keydown', e => { if (host && e.target.id === 'slPrompt' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) build(); });
  window.addEventListener('knox-plan-changed', () => { if (host && !editor && host.isConnected) renderHome(); });

  window.knoxSimLab = { show, open: (type, values, meta) => open(type, values, meta), templates: Object.keys(T), cleanValues };
})();
