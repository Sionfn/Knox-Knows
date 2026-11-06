/* Interactive simulations (Mega Knox, Beta). Knox can end an Ask Knox answer
   with one line like "Sim: projectile | speed=20, angle=45" (api/ask.js,
   SIM_INSTRUCTION). renderAnswerHtml turns that line into an empty
   <div class="knox-sim" data-sim="…">, and this file builds it: built-in Knox
   templates with sliders (and Play where it moves). The model only picks a
   template and starting numbers; it never writes code. */
(function () {
  'use strict';
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const fmt = (n, dp = 2) => { const r = Math.round(n * 10 ** dp) / 10 ** dp; return Object.is(r, -0) ? '0' : String(r); };
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const colors = () => ({ orange: css('--orange') || '#FF6B00', blue: css('--blue') || '#1CB0F6', purple: css('--purple') || '#8B4FD8', green: css('--green') || '#58CC02', text: css('--text') || '#3C2A1E', light: css('--text-light') || '#7A6A5C', border: css('--border') || '#E8DCCB', surface: css('--surface') || '#fff' });
  const UNITS = { mi: 'mi', km: 'km', m: 'm', ft: 'ft' }, TIMES = { h: 'h', min: 'min', s: 's' };
  // What's racing in a catch-up problem (who=…): drawn with its emoji, named in the labels.
  // flip: most phone emoji face left, so they're mirrored to drive to the right.
  const MOVERS = { car: { name: 'Car', a: '🚗', b: '🚙', flip: true }, runner: { name: 'Runner', a: '🏃', b: '🏃‍♀️', flip: true }, person: { name: 'Person', a: '🚶', b: '🚶‍♀️', flip: true }, train: { name: 'Train', a: '🚆', b: '🚄', flip: true }, bike: { name: 'Bike', a: '🚴', b: '🚴‍♀️', flip: true }, plane: { name: 'Plane', a: '✈️', b: '🛩️', flip: false }, boat: { name: 'Boat', a: '⛵', b: '🚤', flip: true }, dog: { name: 'Dog', a: '🐕', b: '🐕', flip: true }, bus: { name: 'Bus', a: '🚌', b: '🚌', flip: true }, truck: { name: 'Truck', a: '🚚', b: '🚚', flip: true } };

  function parse(spec) {
    const m = /^\s*([a-z]+)\s*(?:\|\s*(.*))?$/i.exec(String(spec || ''));
    if (!m) return null;
    const vals = {};
    for (const part of (m[2] || '').split(/[,;]/)) { const kv = /^\s*([a-z]+)\s*=\s*([^\s]+)\s*$/i.exec(part); if (kv) vals[kv[1].toLowerCase()] = kv[2]; }
    return { type: m[1].toLowerCase(), vals };
  }

  // Each template: title, sliders (key, label, min, max, step, start), and draw().
  const TEMPLATES = {
    line: v => ({
      title: 'Line: y = mx + b',
      sliders: [['m', 'Slope (m)', -5, 5, 0.5, num(v.m, -5, 5, 2)], ['b', 'Y-intercept (b)', -10, 10, 1, num(v.b, -10, 10, 1)]],
      draw(g, s, c) { grid(g, c); fn(g, c, x => s.m * x + s.b, c.blue); dot(g, c, 0, s.b, c.orange); return `y = ${fmt(s.m)}x ${s.b < 0 ? '−' : '+'} ${fmt(Math.abs(s.b))} · crosses the y-axis at ${fmt(s.b)}${s.m ? ` and the x-axis at ${fmt(-s.b / s.m)}` : ''}`; },
    }),
    parabola: v => ({
      title: 'Parabola: y = ax² + bx + c',
      sliders: [['a', 'a', -3, 3, 0.5, num(v.a, -3, 3, 1)], ['b', 'b', -10, 10, 1, num(v.b, -10, 10, 0)], ['c', 'c', -10, 10, 1, num(v.c, -10, 10, -4)]],
      draw(g, s, c) {
        grid(g, c); fn(g, c, x => s.a * x * x + s.b * x + s.c, c.purple);
        if (!s.a) return 'a = 0 makes it a straight line, not a parabola.';
        const vx = -s.b / (2 * s.a), vy = s.a * vx * vx + s.b * vx + s.c, disc = s.b * s.b - 4 * s.a * s.c;
        dot(g, c, vx, vy, c.orange);
        const roots = disc < 0 ? 'no x-intercepts' : disc === 0 ? `one x-intercept at ${fmt(vx)}` : `x-intercepts at ${fmt((-s.b - Math.sqrt(disc)) / (2 * s.a))} and ${fmt((-s.b + Math.sqrt(disc)) / (2 * s.a))}`;
        return `Vertex (${fmt(vx)}, ${fmt(vy)}) · opens ${s.a > 0 ? 'up' : 'down'} · ${roots}`;
      },
    }),
    motion: v => {
      const unit = UNITS[v.unit] || 'mi', time = TIMES[v.time] || 'h', who = MOVERS[String(v.who || '').toLowerCase()] || null;
      const A = who ? `${who.name} A` : 'A', B = who ? `${who.name} B` : 'B';
      return {
        title: who ? `${who.name} catch-up race` : 'Catch-up race', play: true,
        sliders: [['a', `${A}'s speed (${unit}/${time})`, 1, 120, 1, num(v.a, 1, 120, 60)], ['b', `${B}'s speed (${unit}/${time})`, 1, 120, 1, num(v.b, 1, 120, 75)], ['head', `${A}'s head start (${unit})`, 0, 200, 1, num(v.head, 0, 200, 30)]],
        draw(g, s, c, t) {
          const catchT = s.b > s.a ? s.head / (s.b - s.a) : Infinity, end = Number.isFinite(catchT) ? catchT * 1.25 : 4, now = t == null ? end : t * end;
          const pa = s.head + s.a * now, pb = s.b * now, far = Math.max(s.head + s.a * end, s.b * end, 1), pad = who ? 30 : 20, W = c.w - pad * 2;
          track(g, c, pad, c.h * 0.35, W, 'A', c.orange, pad + W * pa / far, who);
          track(g, c, pad, c.h * 0.7, W, 'B', c.blue, pad + W * pb / far, who);
          if (Number.isFinite(catchT) && now >= catchT) { const x = pad + W * (s.head + s.a * catchT) / far; g.setLineDash([5, 5]); g.strokeStyle = c.green; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 10); g.lineTo(x, c.h - 10); g.stroke(); g.setLineDash([]); }
          const clock = `Time ${fmt(now)} ${time}`;
          return Number.isFinite(catchT) ? `${clock} · ${B} catches ${A} after ${fmt(catchT)} ${time}, ${fmt(s.b * catchT)} ${unit} from ${B}'s start` : `${clock} · ${B} is never faster than ${A}, so it never catches up`;
        },
      };
    },
    projectile: v => ({
      title: 'Projectile launch', play: true,
      sliders: [['speed', 'Launch speed (m/s)', 5, 50, 1, num(v.speed, 5, 50, 20)], ['angle', 'Angle (degrees)', 5, 85, 1, num(v.angle, 5, 85, 45)]],
      draw(g, s, c, t) {
        const G = 9.8, r = s.angle * Math.PI / 180, vx = s.speed * Math.cos(r), vy = s.speed * Math.sin(r), T = 2 * vy / G, range = vx * T, top = vy * vy / (2 * G);
        // Sized for this speed's longest (45°) and highest (90°) throws, so turning
        // the angle shows the path changing instead of the picture rescaling.
        const maxRange = s.speed * s.speed / G, maxTop = maxRange / 2;
        const scale = Math.min((c.w - 40) / maxRange, (c.h - 40) / maxTop), x0 = 20, y0 = c.h - 20;
        g.strokeStyle = c.border; g.lineWidth = 2; g.beginPath(); g.moveTo(10, y0); g.lineTo(c.w - 10, y0); g.stroke();
        g.strokeStyle = c.blue; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.beginPath();
        for (let i = 0; i <= 60; i++) { const tt = T * i / 60, X = x0 + vx * tt * scale, Y = y0 - (vy * tt - G * tt * tt / 2) * scale; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
        g.stroke(); g.setLineDash([]);
        const now = t == null ? T : t * T; ball(g, x0 + vx * now * scale, y0 - (vy * now - G * now * now / 2) * scale, c.orange);
        return `Flies ${fmt(range, 1)} m · highest point ${fmt(top, 1)} m · in the air ${fmt(T, 2)} s${t != null ? ` · t = ${fmt(now, 2)} s` : ''}`;
      },
    }),
    probability: v => {
      const die = /^d(ie|ice)?$/i.test(v.kind || '') || v.kind === 'die';
      return {
        title: die ? 'Roll a die' : 'Flip a coin', roll: true,
        sliders: [['trials', die ? 'Number of rolls' : 'Number of flips', 10, 2000, 10, num(v.trials, 10, 2000, 100)]],
        counts: null,
        draw(g, s, c) {
          const faces = die ? ['1', '2', '3', '4', '5', '6'] : ['Heads', 'Tails'];
          if (!this.counts || this.counts.n !== s.trials || this.counts.k !== faces.length) { const k = new Array(faces.length).fill(0); for (let i = 0; i < s.trials; i++) k[Math.floor(Math.random() * faces.length)]++; this.counts = { n: s.trials, k: faces.length, v: k }; }
          const k = this.counts.v, exp = s.trials / faces.length, top = Math.max(...k, exp) * 1.15, bw = (c.w - 40) / faces.length, base = c.h - 26;
          k.forEach((n, i) => { const h = (base - 12) * n / top, x = 20 + i * bw + bw * 0.15; g.fillStyle = i % 2 ? c.blue : c.orange; roundRect(g, x, base - h, bw * 0.7, h, 6); g.fill(); g.fillStyle = c.text; g.font = '800 12px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(faces[i], x + bw * 0.35, base + 16); g.fillText(String(n), x + bw * 0.35, base - h - 5); });
          const ey = base - (base - 12) * exp / top; g.setLineDash([5, 5]); g.strokeStyle = c.green; g.lineWidth = 2; g.beginPath(); g.moveTo(14, ey); g.lineTo(c.w - 14, ey); g.stroke(); g.setLineDash([]);
          return `Green line = what you'd expect (${fmt(exp, 1)} each). More ${die ? 'rolls' : 'flips'} → results get closer to it.`;
        },
      };
    },
    fraction: v => ({
      title: 'Fraction bar',
      sliders: [['d', 'Parts in the whole (denominator)', 1, 12, 1, num(v.d, 1, 12, 4)], ['n', 'Parts shaded (numerator)', 0, 12, 1, num(v.n, 0, 12, 3)]],
      draw(g, s, c) {
        const d = s.d, n = Math.min(s.n, d), W = c.w - 40, h = 56, y = c.h / 2 - h / 2;
        for (let i = 0; i < d; i++) { g.fillStyle = i < n ? c.orange : c.surface; g.strokeStyle = c.text; g.lineWidth = 2; g.fillRect(20 + W * i / d, y, W / d, h); g.strokeRect(20 + W * i / d, y, W / d, h); }
        return `${n}/${d} = ${fmt(n / d, 3)} = ${fmt(100 * n / d, 1)}%${s.n > d ? ' (numerator capped at the denominator)' : ''}`;
      },
    }),
    interest: v => ({
      title: 'Simple vs compound interest',
      sliders: [['p', 'Starting amount ($)', 100, 10000, 100, num(v.p, 100, 10000, 1000)], ['r', 'Rate (% per year)', 1, 15, 0.5, num(v.r, 1, 15, 5)], ['t', 'Years', 1, 40, 1, num(v.t, 1, 40, 10)]],
      draw(g, s, c) {
        const simple = y => s.p * (1 + s.r / 100 * y), comp = y => s.p * (1 + s.r / 100) ** y, top = comp(s.t) * 1.08, base = c.h - 20, W = c.w - 40;
        g.strokeStyle = c.border; g.lineWidth = 2; g.beginPath(); g.moveTo(20, base); g.lineTo(c.w - 10, base); g.stroke();
        for (const [f, col] of [[simple, c.blue], [comp, c.green]]) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 80; i++) { const y = s.t * i / 80, X = 20 + W * i / 80, Y = base - (base - 12) * f(y) / top; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); }
        return `After ${s.t} years: simple ${money(simple(s.t))} (blue) · compound ${money(comp(s.t))} (green) · difference ${money(comp(s.t) - simple(s.t))}`;
      },
    }),
  };

  // ── Drawing helpers (graph area is −10…10 on both axes) ──────────────────
  const toX = (c, x) => c.w / 2 + x * (c.w - 20) / 20, toY = (c, y) => c.h / 2 - y * (c.h - 20) / 20;
  function grid(g, c) {
    g.strokeStyle = c.border; g.lineWidth = 1;
    for (let i = -10; i <= 10; i += 2) { g.beginPath(); g.moveTo(toX(c, i), 10); g.lineTo(toX(c, i), c.h - 10); g.moveTo(10, toY(c, i)); g.lineTo(c.w - 10, toY(c, i)); g.stroke(); }
    g.strokeStyle = c.light; g.lineWidth = 2; g.beginPath(); g.moveTo(toX(c, 0), 6); g.lineTo(toX(c, 0), c.h - 6); g.moveTo(6, toY(c, 0)); g.lineTo(c.w - 6, toY(c, 0)); g.stroke();
  }
  function fn(g, c, f, col) {
    g.save(); g.beginPath(); g.rect(4, 4, c.w - 8, c.h - 8); g.clip();
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); let on = false;
    for (let i = 0; i <= 240; i++) { const x = -10 + 20 * i / 240, y = f(x); if (!Number.isFinite(y) || Math.abs(y) > 40) { on = false; continue; } on ? g.lineTo(toX(c, x), toY(c, y)) : g.moveTo(toX(c, x), toY(c, y)); on = true; }
    g.stroke(); g.restore();
  }
  function dot(g, c, x, y, col) { if (Math.abs(x) > 10 || Math.abs(y) > 10) return; ball(g, toX(c, x), toY(c, y), col, 6); }
  function ball(g, x, y, col, r = 9) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  function track(g, c, x, y, W, label, col, pos, who) {
    if (who) {
      g.strokeStyle = c.border; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + W, y + 14); g.stroke(); g.lineCap = 'butt';
      const px = Math.min(pos, x + W);
      g.save(); g.translate(px, y); if (who.flip) g.scale(-1, 1); g.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label === 'A' ? who.a : who.b, 0, 0); g.restore();
      g.fillStyle = col; g.font = '900 12px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(label, px, y - 20);
      return;
    } g.strokeStyle = c.border; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + W, y); g.stroke(); g.lineCap = 'butt'; ball(g, Math.min(pos, x + W), y, col, 11); g.fillStyle = '#fff'; g.font = '900 11px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, Math.min(pos, x + W), y + 0.5); g.textBaseline = 'alphabetic'; }
  function roundRect(g, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.arcTo(x, y, x + r, y, r); g.closePath(); }

  // ── Build one card ───────────────────────────────────────────────────────
  function build(el) {
    el.dataset.ready = '1';
    const p = parse(el.dataset.sim), make = p && TEMPLATES[p.type];
    if (!make) { el.remove(); return; }
    const tpl = make(p.vals), state = Object.fromEntries(tpl.sliders.map(s => [s[0], s[5]]));
    el.innerHTML = `<div class="ksim-head"><span class="ksim-badge" aria-hidden="true">🎛️</span><span><b>Try it yourself</b><small>${tpl.title}</small></span><span class="ksim-beta">Mega · Beta</span></div>
      <canvas class="ksim-canvas" role="img"></canvas><p class="ksim-readout" aria-live="polite"></p>
      <div class="ksim-controls">${tpl.sliders.map(([k, label, lo, hi, step]) => `<label class="ksim-slider"><span><span>${label}</span><b data-out="${k}"></b></span><input type="range" min="${lo}" max="${hi}" step="${step}" value="${state[k]}" data-k="${k}"></label>`).join('')}</div>
      <div class="ksim-actions">${tpl.play || tpl.roll ? `<button type="button" class="ksim-play">${tpl.roll ? '🎲 Run again' : '▶ Play'}</button>` : ''}<button type="button" class="ksim-reset">↺ Reset</button></div>`;
    const canvas = el.querySelector('canvas'), g = canvas.getContext('2d'), out = el.querySelector('.ksim-readout');
    let anim = 0, pos = null, stop = () => { cancelAnimationFrame(anim); anim = 0; };
    const render = t => {
      const w = canvas.clientWidth || 320, h = Math.round(Math.min(260, Math.max(170, w * 0.55))), dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px'; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const c = { ...colors(), w, h }, text = tpl.draw(g, state, c, t == null && tpl.play ? 0 : t); // races and launches wait at the start until Play
      out.textContent = text; canvas.setAttribute('aria-label', tpl.title + '. ' + text);
      for (const [k, , lo, hi] of tpl.sliders) {
        el.querySelector(`[data-out="${k}"]`).textContent = fmt(state[k]);
        el.querySelector(`[data-k="${k}"]`).style.setProperty('--p', (100 * (state[k] - lo) / (hi - lo)) + '%');
      }
    };
    el.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; stop(); pos = null; state[k] = Number(e.target.value); if (tpl.counts) tpl.counts = null; render(); });
    // Reset: back to the numbers from the question.
    const initial = { ...state };
    el.querySelector('.ksim-reset').addEventListener('click', () => {
      stop(); pos = null; Object.assign(state, initial); tpl.counts = null;
      for (const [k] of tpl.sliders) el.querySelector(`[data-k="${k}"]`).value = state[k];
      render();
    });
    // Play ↔ Pause: Pause freezes it where it is, Play carries on from there,
    // and after the end Play starts over.
    const playBtn = el.querySelector('.ksim-play');
    const label = running => { if (playBtn && !tpl.roll) { playBtn.textContent = running ? '❚❚ Pause' : '▶ Play'; playBtn.setAttribute('aria-pressed', String(running)); } };
    stop = () => { cancelAnimationFrame(anim); anim = 0; label(false); };
    playBtn?.addEventListener('click', () => {
      if (tpl.roll) { tpl.counts = null; render(); return; }
      if (anim) { stop(); return; }
      const from = pos == null || pos >= 1 ? 0 : pos, began = performance.now();
      const step = now => { pos = Math.min(1, from + (now - began) / 2600); render(pos); if (pos < 1) anim = requestAnimationFrame(step); else stop(); };
      label(true); anim = requestAnimationFrame(step);
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (!anim) render(pos == null ? undefined : pos); }).observe(canvas);
    render();
  }
  const scan = root => (root.querySelectorAll ? root : document).querySelectorAll('.knox-sim:not([data-ready])').forEach(build);
  new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('.knox-sim:not([data-ready])')) build(n); else scan(n); } }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document)); else scan(document);
  window.knoxSims = { parse, templates: Object.keys(TEMPLATES) };
})();
