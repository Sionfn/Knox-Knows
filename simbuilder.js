/* simbuilder.js — "Make your own" in the Simulation Lab (simlab.js opens it).

   A sandbox students build from pieces: balls, blocks, ramps, walls, springs,
   targets and labels in a world with gravity (any planet), air resistance,
   bounciness and friction. Drag things to move them, drag a ball's arrow to
   aim it, then press Play. Add sliders for any setting (so classmates can
   play with it) and graphs + data tables that track anything over time.

   A scene is plain data (saved in My sims, shared by link, and what
   "Knox builds it" makes — api/_sim-build.js); clean() checks every field.
     { title, world: { planet, air, bounce, friction, width },
       objects: [{ id, kind, x, y, r | w, h | len, angle, mass, speed, dir, color, name, fixed, to, k, rest }],
       sliders: [{ obj, prop, min, max }], graphs: [{ obj, prop }], goal: { obj, target } }
   Units: meters, seconds, kilograms, degrees.

   window.knoxSimBuilder = { mount(host, scene, opts), clean(scene), blank(), LIMITS } */
(function () {
  'use strict';
  // Play-bar icons (drawn here, so no system emoji ever shows).
  const PI = {
    play: '<svg class="sl-pi" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l11.8-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6Z" fill="currentColor"/></svg>',
    pause: '<svg class="sl-pi" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="4" width="4.6" height="16" rx="1.6" fill="currentColor"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.6" fill="currentColor"/></svg>',
    restart: '<svg class="sl-pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/></svg>',
    full: '<svg class="sl-pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    dice: '<svg class="sl-pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M8.2 8.2h.01M15.8 8.2h.01M12 12h.01M8.2 15.8h.01M15.8 15.8h.01" stroke-width="3.4"/></svg>',
  };
  const sp = u => /^[°%]/.test(u) ? '' : ' '; // 45°, 30%, but 20 m/s
  // Flashcards' pieces (flashcards.css), so the builder looks like the rest of Knox.
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = (label, attrs = '', cls = '') => `<button type="button" class="fc-btn ${cls}" ${attrs}>${label}</button>`;
  const accentLast = t => { const w = escH(t).trim().split(/\s+/); return w.length > 1 ? `${w.slice(0, -1).join(' ')} <span class="accent">${w[w.length - 1]}</span>` : `<span class="accent">${w[0]}</span>`; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
  const fmt = (n, dp = 2) => { if (!Number.isFinite(n)) return '—'; const r = Math.round(n * 10 ** dp) / 10 ** dp; return (Object.is(r, -0) ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: dp }); };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ki = n => window.KI ? window.KI(n, { tint: false }) : '';

  const PLANETS = { earth: [9.81, 'Earth'], moon: [1.62, 'Moon'], mars: [3.71, 'Mars'], jupiter: [24.79, 'Jupiter'], sun: [274, 'The Sun'], pluto: [0.62, 'Pluto'], space: [0, 'Space (no gravity)'] };
  const COLORS = ['#FF6B00', '#1CB0F6', '#1FA45A', '#A560F2', '#E5383B', '#FFC800', '#14B8A6', '#3C3C3C'];
  const KINDS = {
    ball: { name: 'Ball', icon: 'target', dyn: true }, box: { name: 'Block', icon: 'cards', dyn: true },
    ramp: { name: 'Ramp', icon: 'chart' }, wall: { name: 'Wall', icon: 'columns' },
    spring: { name: 'Spring', icon: 'bolt' }, target: { name: 'Target', icon: 'target' }, label: { name: 'Label', icon: 'note' },
  };
  // What you can attach a slider or a graph to, per kind.
  const PROPS = {
    ball: [['speed', 'Start speed', 0, 60, 'm/s'], ['dir', 'Start direction', -180, 180, '°'], ['mass', 'Mass', .1, 100, 'kg'], ['r', 'Size (radius)', .1, 5, 'm'], ['x', 'Start x', 0, 200, 'm'], ['y', 'Start height', 0, 200, 'm']],
    box: [['speed', 'Start speed', 0, 60, 'm/s'], ['dir', 'Start direction', -180, 180, '°'], ['mass', 'Mass', .1, 100, 'kg'], ['w', 'Size', .2, 10, 'm'], ['x', 'Start x', 0, 200, 'm'], ['y', 'Start height', 0, 200, 'm']],
    ramp: [['angle', 'Angle', -80, 80, '°'], ['len', 'Length', 1, 100, 'm'], ['x', 'Position x', 0, 200, 'm'], ['y', 'Height', 0, 200, 'm']],
    wall: [['len', 'Height', .5, 100, 'm'], ['x', 'Position x', 0, 200, 'm']],
    spring: [['k', 'Stiffness', 1, 500, 'N/m'], ['rest', 'Rest length', .2, 50, 'm']],
    target: [['x', 'Position x', 0, 200, 'm'], ['y', 'Height', 0, 200, 'm'], ['r', 'Size', .3, 10, 'm']],
    label: [],
  };
  const TRACK = [['y', 'Height', 'm'], ['x', 'Distance (x)', 'm'], ['speed', 'Speed', 'm/s'], ['vy', 'Up/down speed', 'm/s'], ['vx', 'Sideways speed', 'm/s'], ['ke', 'Kinetic energy', 'J'], ['pe', 'Potential energy', 'J']];
  const WORLD_PROPS = [['gravity', 'Gravity (custom)', 0, 30, 'm/s²'], ['air', 'Air resistance', 0, 1, ''], ['bounce', 'Bounciness', 0, 1, ''], ['friction', 'Friction', 0, 1, '']];
  const LIMITS = { free: { objects: 4, sliders: 1, graphs: 1 }, plus: { objects: 20, sliders: 6, graphs: 3 }, mega: { objects: 50, sliders: 12, graphs: 6 } };

  // ── Scenes: plain data, always checked ───────────────────────────────────
  let idSeq = 1;
  const newId = () => 'o' + (Date.now() % 1e6).toString(36) + (idSeq++);
  function blank() {
    return clean({ title: 'My simulation', world: { planet: 'earth', air: 0, bounce: .5, friction: .3, width: 40 },
      objects: [{ id: 'b1', kind: 'ball', x: 4, y: 2, r: .6, mass: 1, speed: 14, dir: 50, color: '#FF6B00', name: 'Ball' }, { id: 't1', kind: 'target', x: 28, y: 1, r: 1.5, color: '#1FA45A', name: 'Target' }],
      sliders: [{ obj: 'b1', prop: 'speed', min: 0, max: 40 }], graphs: [{ obj: 'b1', prop: 'y' }], goal: { obj: 'b1', target: 't1' } });
  }
  function clean(sc) {
    sc = sc && typeof sc === 'object' ? sc : {};
    const w = sc.world || {};
    const world = { planet: PLANETS[w.planet] ? w.planet : 'earth', gravity: num(w.gravity, 0, 30, null), air: num(w.air, 0, 1, 0), bounce: num(w.bounce, 0, 1, .5), friction: num(w.friction, 0, 1, .3), width: num(w.width, 5, 200, 40) };
    if (world.gravity == null) delete world.gravity;
    const objects = (Array.isArray(sc.objects) ? sc.objects : []).slice(0, 60).map(o => {
      if (!o || !KINDS[o.kind]) return null;
      const c = { id: /^[a-z0-9]{1,16}$/i.test(o.id) ? o.id : newId(), kind: o.kind, x: num(o.x, -10, 220, 5), y: num(o.y, -5, 220, 2), color: COLORS.includes(o.color) ? o.color : COLORS[0], name: String(o.name || KINDS[o.kind].name).replace(/[<>]/g, '').slice(0, 24) };
      if (o.kind === 'ball' || o.kind === 'target') c.r = num(o.r, .1, 10, o.kind === 'target' ? 1.5 : .6);
      if (o.kind === 'box') c.w = num(o.w, .2, 10, 1.2);
      if (o.kind === 'ball' || o.kind === 'box') { c.mass = num(o.mass, .1, 100, 1); c.speed = num(o.speed, 0, 60, 0); c.dir = num(o.dir, -180, 180, 0); c.fixed = !!o.fixed; }
      if (o.kind === 'ramp') { c.len = num(o.len, 1, 100, 10); c.angle = num(o.angle, -80, 80, 20); }
      if (o.kind === 'wall') c.len = num(o.len, .5, 100, 6);
      if (o.kind === 'spring') { c.k = num(o.k, 1, 500, 40); c.rest = num(o.rest, .2, 50, 3); c.to = String(o.to || ''); }
      if (o.kind === 'label') c.text = String(o.text || 'Label').replace(/[<>]/g, '').slice(0, 60);
      return c;
    }).filter(Boolean);
    const ids = new Set(objects.map(o => o.id));
    objects.forEach(o => { if (o.kind === 'spring' && !ids.has(o.to)) o.to = ''; });
    const okProp = (id, prop, list) => { const o = objects.find(x => x.id === id); return o && list(o).some(p => p[0] === prop); };
    const sliders = (Array.isArray(sc.sliders) ? sc.sliders : []).slice(0, 12).filter(s => s && (s.obj === 'world' ? WORLD_PROPS.some(p => p[0] === s.prop) : okProp(s.obj, s.prop, o => PROPS[o.kind])))
      .map(s => { const def = (s.obj === 'world' ? WORLD_PROPS : PROPS[objects.find(o => o.id === s.obj).kind]).find(p => p[0] === s.prop); return { obj: s.obj, prop: s.prop, min: num(s.min, def[2], def[3], def[2]), max: num(s.max, def[2], def[3], def[3]) }; });
    const graphs = (Array.isArray(sc.graphs) ? sc.graphs : []).slice(0, 6).filter(g => g && objects.some(o => o.id === g.obj && KINDS[o.kind].dyn) && TRACK.some(t => t[0] === g.prop)).map(g => ({ obj: g.obj, prop: g.prop }));
    const goal = sc.goal && ids.has(sc.goal.obj) && objects.find(o => o.id === sc.goal.target)?.kind === 'target' ? { obj: sc.goal.obj, target: sc.goal.target } : null;
    return { title: String(sc.title || 'My simulation').replace(/[<>]/g, '').slice(0, 40), world, objects, sliders, graphs, goal };
  }

  // ── Physics ──────────────────────────────────────────────────────────────
  // Dynamic things (balls, blocks) are circles to the physics; ramps and walls
  // are fixed line segments; the ground is y = 0. Springs pull two things (or a
  // thing and its anchor point) toward their rest length.
  const gravityOf = w => w.gravity != null ? w.gravity : PLANETS[w.planet][0];
  function segOf(o) {
    if (o.kind === 'ramp') { const a = o.angle * Math.PI / 180; return [o.x, o.y, o.x + o.len * Math.cos(a), o.y + o.len * Math.sin(a)]; }
    if (o.kind === 'wall') return [o.x, 0, o.x, o.len];
    return null;
  }
  const radiusOf = o => o.kind === 'box' ? o.w / 2 : o.r;
  function simulate(sc, tEnd = 20) {
    const w = sc.world, g = gravityOf(w), dt = 1 / 240, drag = w.air * .05;
    const bodies = sc.objects.filter(o => KINDS[o.kind].dyn).map(o => ({ id: o.id, x: o.x, y: o.y, vx: o.fixed ? 0 : o.speed * Math.cos(o.dir * Math.PI / 180), vy: o.fixed ? 0 : o.speed * Math.sin(o.dir * Math.PI / 180), r: radiusOf(o), m: o.mass, fixed: o.fixed }));
    const byId = Object.fromEntries(bodies.map(b => [b.id, b]));
    const segs = sc.objects.map(segOf).filter(Boolean);
    const springs = sc.objects.filter(o => o.kind === 'spring').map(o => ({ a: byId[o.to] || null, ax: o.x, ay: o.y, k: o.k, rest: o.rest, self: o }));
    const frames = [], hits = {}; let t = 0, step = 0;
    const snap = () => frames.push({ t, b: bodies.map(b => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy })) });
    snap();
    while (t < tEnd) {
      for (const b of bodies) { if (b.fixed) continue; const v = Math.hypot(b.vx, b.vy); b.vx += (-drag * v * b.vx / b.m) * dt; b.vy += (-g - drag * v * b.vy / b.m) * dt; }
      for (const s of springs) {
        if (!s.a) continue; const b = s.a, dx = b.x - s.ax, dy = b.y - s.ay, d = Math.hypot(dx, dy) || 1e-6, f = -s.k * (d - s.rest);
        if (!b.fixed) { b.vx += f * dx / d / b.m * dt; b.vy += f * dy / d / b.m * dt; b.vx *= .9995; b.vy *= .9995; }
      }
      for (const b of bodies) { if (b.fixed) continue; b.x += b.vx * dt; b.y += b.vy * dt; }
      // Collisions: ground, ramps and walls, then body vs body.
      for (const b of bodies) {
        if (b.fixed) continue;
        if (b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * w.bounce; b.vx *= 1 - w.friction * .02; if (Math.abs(b.vy) < .05) b.vy = 0; }
        for (const [x1, y1, x2, y2] of segs) {
          const ex = x2 - x1, ey = y2 - y1, L2 = ex * ex + ey * ey || 1e-9, u = clamp(((b.x - x1) * ex + (b.y - y1) * ey) / L2, 0, 1);
          const px = x1 + u * ex, py = y1 + u * ey, dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
          if (d < b.r && d > 1e-9) {
            const nx = dx / d, ny = dy / d; b.x = px + nx * b.r; b.y = py + ny * b.r;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= (1 + w.bounce) * vn * nx; b.vy -= (1 + w.bounce) * vn * ny; const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty; b.vx -= vt * tx * w.friction * .02; b.vy -= vt * ty * w.friction * .02; }
          }
        }
      }
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d < 1e-9) continue;
        const nx = dx / d, ny = dy / d, ma = a.fixed ? Infinity : a.m, mb = b.fixed ? Infinity : b.m, over = min - d;
        const ta = a.fixed ? 0 : mb === Infinity ? 1 : mb / (ma + mb), tb = b.fixed ? 0 : ma === Infinity ? 1 : ma / (ma + mb);
        a.x -= nx * over * ta; a.y -= ny * over * ta; b.x += nx * over * tb; b.y += ny * over * tb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv > 0) continue;
        const jimp = -(1 + w.bounce) * rv / ((a.fixed ? 0 : 1 / ma) + (b.fixed ? 0 : 1 / mb) || 1);
        if (!a.fixed) { a.vx -= jimp * nx / ma; a.vy -= jimp * ny / ma; } if (!b.fixed) { b.vx += jimp * nx / mb; b.vy += jimp * ny / mb; }
      }
      // Targets: who touched which, and when.
      for (const o of sc.objects) if (o.kind === 'target') for (const b of bodies) if (!hits[o.id + b.id] && Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.r * .5) hits[o.id + b.id] = t;
      t += dt; if (++step % 4 === 0) snap();
      if (bodies.every(b => b.fixed || (b.y <= b.r + .001 && Math.hypot(b.vx, b.vy) < .02)) && t > .5) break; // everything has stopped
      if (bodies.some(b => Math.abs(b.x) > 5000 || Math.abs(b.y) > 5000)) break;
    }
    snap();
    return { frames, end: t, hits, at(tt) { const i = clamp(Math.round(tt / (4 * dt)), 0, frames.length - 1); return frames[i]; } };
  }
  const trackOf = (prop, b, o, g) => prop === 'speed' ? Math.hypot(b.vx, b.vy) : prop === 'ke' ? .5 * o.mass * (b.vx * b.vx + b.vy * b.vy) : prop === 'pe' ? o.mass * g * b.y : b[prop];

  // ── The editor ───────────────────────────────────────────────────────────
  function mount(host, scene, opts = {}) {
    const tier = opts.tier || 'free', lim = LIMITS[tier];
    const ac = new AbortController(), on = { signal: ac.signal }; // everything below is removed when you leave
    let sc = clean(scene || blank()), sim = null, t = 0, playing = false, raf = 0, last = 0, sel = null, drag = null, cheered = false;
    const dirty = () => { sim = null; };
    const getSim = () => sim || (sim = simulate(sc));
    const objOf = id => sc.objects.find(o => o.id === id);
    const propDef = (obj, prop) => obj === 'world' ? WORLD_PROPS.find(p => p[0] === prop) : PROPS[objOf(obj)?.kind]?.find(p => p[0] === prop);
    const valOf = (obj, prop) => obj === 'world' ? (prop === 'gravity' ? gravityOf(sc.world) : sc.world[prop]) : objOf(obj)?.[prop];
    function setVal(obj, prop, v) { if (obj === 'world') { if (prop === 'gravity') sc.world.gravity = v; else sc.world[prop] = v; } else { const o = objOf(obj); if (o) o[prop] = v; } dirty(); }
    const upsell = text => { host.querySelector('.sb-upsell')?.remove(); host.querySelector('.sl-topbar')?.insertAdjacentHTML('afterend', (window.KI?.fill || (x => x))(`<div class="sl-note sl-upsell sb-upsell" role="status">⚡<p>${text}</p>${window.knoxNativeApp ? '' : B('See plans', 'data-sb="upgrade"', 'primary small')}<button type="button" class="sl-x" data-sb="close-upsell" aria-label="Close">✕</button></div>`)); };

    host.innerHTML = `<div class="fc-wrap sl-ed sb">
      <header class="fc-head"><div class="fc-badges"><span class="fc-badge">${ki('pencil', false)} Make your own</span></div><h1 class="fc-title" tabindex="-1">${accentLast(sc.title)}</h1><p class="fc-sub">Drag things to move them and drag a ball’s arrow to aim it. Tap anything to change it, then press Play.</p></header>
      <div class="fc-topbar sl-topbar">${B('← Simulation Lab', 'data-sb="back"', 'ghost')}<div class="fc-topbar-right">${B('Share', 'data-sb="share"', 'small')}${opts.onPublish ? B('Publish', 'data-sb="publish"', 'small') : ''}${B('Save', 'data-sb="save"', 'primary small')}</div></div>
      ${opts.explain ? `<div class="sl-note">${ki('spark', false)}<p>${esc(opts.explain)}</p></div>` : ''}
      <div class="sb-add" role="toolbar" aria-label="Add"><span class="fc-field-label">Add</span>${Object.entries(KINDS).map(([k, d]) => `<button type="button" class="fc-chip" data-add="${k}">+ ${d.name}</button>`).join('')}</div>
      <div class="sl-main">
        <div class="sl-stage sl-box">
          <div class="sb-sliders"></div>
          <canvas class="sl-canvas sb-canvas" aria-label="Your simulation. Drag things to move them; drag a ball's arrow to aim it."></canvas>
          <div class="sl-play">${B(`${PI.play} Play`, 'data-sb="play"', 'primary small sl-playbtn')}${B(`${PI.restart} Back to start`, 'data-sb="reset"', 'small')}<span class="sb-goal" aria-live="polite"></span></div>
          <p class="sl-readout sb-read" aria-live="polite"></p>
          <div class="sb-graphs"></div>
          ${opts.extraFoot || ''}
        </div>
        <div class="sl-controls sl-box sb-side"></div>
      </div></div>`;
    host.scrollTop = 0;
    const canvas = host.querySelector('.sb-canvas'), g = canvas.getContext('2d'), side = host.querySelector('.sb-side');
    const view = () => { const W = canvas.clientWidth, H = canvas.clientHeight, sc_ = W / sc.world.width, ground = H - 26; return { W, H, k: sc_, X: x => 10 + x * sc_, Y: y => ground - y * sc_, wx: px => (px - 10) / sc_, wy: py => (ground - py) / sc_ }; };
    function size() { const d = Math.min(2, devicePixelRatio || 1); canvas.width = canvas.clientWidth * d; canvas.height = canvas.clientHeight * d; g.setTransform(d, 0, 0, d, 0, 0); }

    function draw() {
      const v = view(), dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const text = css('--text') || '#3C3C3C', light = css('--text-light') || '#8A8A8A';
      g.clearRect(0, 0, v.W, v.H);
      // Grid every meter-ish, and the ground.
      const step = Math.pow(10, Math.floor(Math.log10(sc.world.width / 4))) * (sc.world.width / Math.pow(10, Math.floor(Math.log10(sc.world.width / 4))) > 20 ? 5 : 1);
      g.save(); g.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; g.lineWidth = 1; g.font = '700 10px Nunito, system-ui, sans-serif'; g.fillStyle = light; g.textAlign = 'center';
      for (let x = 0; x <= sc.world.width + 1e-9; x += step) { g.beginPath(); g.moveTo(v.X(x), 0); g.lineTo(v.X(x), v.Y(0)); g.stroke(); g.fillText(fmt(x, 1) + ' m', v.X(x), v.Y(0) + 14); }
      for (let y = step; v.Y(y) > 0; y += step) { g.beginPath(); g.moveTo(0, v.Y(y)); g.lineTo(v.W, v.Y(y)); g.stroke(); }
      g.fillStyle = dark ? '#2A3A2E' : '#DDF4E6'; g.fillRect(0, v.Y(0), v.W, v.H - v.Y(0)); g.restore();
      const s = playing || t > 0 ? getSim() : null, fr = s ? s.at(t) : null, pos = fr ? Object.fromEntries(fr.b.map(b => [b.id, b])) : {};
      // Paths so far.
      if (s && t > 0) for (const o of sc.objects) if (KINDS[o.kind].dyn) { g.save(); g.strokeStyle = o.color; g.globalAlpha = .35; g.lineWidth = 2; g.setLineDash([3, 5]); g.beginPath(); let first = true; for (const f of s.frames) { if (f.t > t) break; const b = f.b.find(q => q.id === o.id); if (!b) continue; first ? g.moveTo(v.X(b.x), v.Y(b.y)) : g.lineTo(v.X(b.x), v.Y(b.y)); first = false; } g.stroke(); g.restore(); }
      for (const o of sc.objects) {
        const isSel = sel === o.id && !playing && t === 0;
        g.save();
        if (o.kind === 'ramp' || o.kind === 'wall') { const [x1, y1, x2, y2] = segOf(o); g.strokeStyle = o.color; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(v.X(x1), v.Y(y1)); g.lineTo(v.X(x2), v.Y(y2)); g.stroke(); if (isSel) { g.strokeStyle = '#FFC800'; g.lineWidth = 2; g.setLineDash([4, 4]); g.stroke(); } }
        else if (o.kind === 'target') { g.strokeStyle = o.color; g.lineWidth = 3; g.setLineDash([6, 4]); g.beginPath(); g.arc(v.X(o.x), v.Y(o.y), o.r * v.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.fillStyle = o.color; g.globalAlpha = .15; g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(v.X(o.x), v.Y(o.y), 4, 0, Math.PI * 2); g.fill(); }
        else if (o.kind === 'label') { g.font = '800 14px Nunito, system-ui, sans-serif'; g.fillStyle = text; g.textAlign = 'center'; g.fillText(o.text, v.X(o.x), v.Y(o.y)); }
        else if (o.kind === 'spring') {
          const a = o.to ? (pos[o.to] || objOf(o.to)) : null, ax = v.X(o.x), ay = v.Y(o.y);
          g.fillStyle = text; g.fillRect(ax - 6, ay - 6, 12, 12);
          if (a) { const bx = v.X(a.x), by = v.Y(a.y), n = 14; g.strokeStyle = o.color; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ax, ay); for (let i = 1; i < n; i++) { const f = i / n, px = ax + (bx - ax) * f, py = ay + (by - ay) * f, nx = -(by - ay), ny = bx - ax, L = Math.hypot(nx, ny) || 1; g.lineTo(px + (i % 2 ? 7 : -7) * nx / L, py + (i % 2 ? 7 : -7) * ny / L); } g.lineTo(bx, by); g.stroke(); }
        }
        else {
          const b = pos[o.id] || o, r = radiusOf(o) * v.k, x = v.X(b.x), y = v.Y(b.y);
          g.fillStyle = o.color; g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2.5;
          if (o.kind === 'ball') { g.beginPath(); g.arc(x, y, Math.max(4, r), 0, Math.PI * 2); g.fill(); g.stroke(); }
          else { const R = Math.max(4, r); g.beginPath(); g.roundRect ? g.roundRect(x - R, y - R, 2 * R, 2 * R, 4) : g.rect(x - R, y - R, 2 * R, 2 * R); g.fill(); g.stroke(); }
          if (o.fixed) { g.fillStyle = '#fff'; g.font = '900 10px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('fixed', x, y); }
          // Aim arrow (edit mode): drag its tip to set speed and direction.
          if (!playing && t === 0 && !o.fixed && o.speed > 0) { const a = o.dir * Math.PI / 180, L = 14 + o.speed * 3; arrow(g, x, y, x + L * Math.cos(a), y - L * Math.sin(a), isSel ? '#FFC800' : o.color); }
          if (isSel) { g.strokeStyle = '#FFC800'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(x, y, Math.max(4, r) + 6, 0, Math.PI * 2); g.stroke(); }
          g.font = '800 11px Nunito, system-ui, sans-serif'; g.fillStyle = text; g.textAlign = 'center'; g.setLineDash([]); g.fillText(o.name, x, y - Math.max(4, r) - 8);
        }
        g.restore();
      }
      // Readout + goal.
      const read = host.querySelector('.sb-read'), goal = host.querySelector('.sb-goal');
      if (s) {
        const parts = sc.objects.filter(o => KINDS[o.kind].dyn).slice(0, 3).map(o => { const b = pos[o.id]; return b ? `${o.name}: x ${fmt(b.x, 1)} m, height ${fmt(b.y, 1)} m, speed ${fmt(Math.hypot(b.vx, b.vy), 1)} m/s` : ''; }).filter(Boolean);
        read.textContent = `Time ${fmt(t, 2)} s · ` + parts.join(' · ');
      } else read.textContent = 'Drag things to move them. Drag a ball’s arrow to aim it. Then press Play.';
      if (sc.goal) {
        const hitAt = s ? s.hits[sc.goal.target + sc.goal.obj] : undefined, tgt = objOf(sc.goal.target), who = objOf(sc.goal.obj);
        if (hitAt != null && t >= hitAt) { goal.textContent = `🎯 ${who?.name || 'It'} hit the ${tgt?.name || 'target'}!`; goal.className = 'sb-goal won'; if (!cheered) { cheered = true; cheer(); } }
        else { goal.textContent = `Goal: get ${who?.name || 'the ball'} into the ${tgt?.name || 'target'}`; goal.className = 'sb-goal'; }
      } else goal.textContent = '';
      drawGraphs(s);
    }
    function arrow(g, x1, y1, x2, y2, col) { const a = Math.atan2(y2 - y1, x2 - x1); g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 10 * Math.cos(a - .45), y2 - 10 * Math.sin(a - .45)); g.lineTo(x2 - 10 * Math.cos(a + .45), y2 - 10 * Math.sin(a + .45)); g.closePath(); g.fill(); g.restore(); }
    function cheer() { window.knoxSound?.fx?.fanfare?.(false); const box = host.querySelector('.sl-stage'); if (!box) return; const c = document.createElement('div'); c.className = 'sb-confetti'; c.innerHTML = Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--c:${COLORS[i % 6]};--d:${.9 + (i % 5) * .2}s"></i>`).join(''); box.append(c); setTimeout(() => c.remove(), 2200); }

    // Graphs + data tables.
    function drawGraphs(s) {
      const box = host.querySelector('.sb-graphs');
      if (!sc.graphs.length) { box.innerHTML = ''; return; }
      if (box.children.length !== sc.graphs.length) box.innerHTML = sc.graphs.map((gr, i) => `<div class="sb-graph"><div class="sb-graph-top"><b></b><button type="button" class="fc-chip" data-sb="table" data-i="${i}">Data table</button><button type="button" class="sl-x" data-sb="ungraph" data-i="${i}" aria-label="Remove graph">✕</button></div><canvas></canvas><div class="sb-table" hidden></div></div>`).join('');
      sc.graphs.forEach((gr, i) => {
        const el = box.children[i], o = objOf(gr.obj), tr = TRACK.find(x => x[0] === gr.prop), cv = el.querySelector('canvas'), gg = cv.getContext('2d');
        el.querySelector('b').textContent = `${o?.name || '?'} — ${tr[1]} (${tr[2]}) over time`;
        const W = cv.clientWidth, H = cv.clientHeight, d = Math.min(2, devicePixelRatio || 1);
        if (cv.width !== W * d) { cv.width = W * d; cv.height = H * d; }
        gg.setTransform(d, 0, 0, d, 0, 0); gg.clearRect(0, 0, W, H);
        const sim_ = s || getSim(), gv = gravityOf(sc.world), pts = sim_.frames.map(f => { const b = f.b.find(q => q.id === gr.obj); return b ? [f.t, trackOf(gr.prop, b, o, gv)] : null; }).filter(Boolean);
        if (!pts.length) return;
        const tMax = Math.max(sim_.end, .1), ys = pts.map(p => p[1]), lo = Math.min(0, ...ys), hi = Math.max(...ys, lo + 1e-6), X = tt => 34 + tt / tMax * (W - 44), Y = y => H - 18 - (y - lo) / (hi - lo) * (H - 30);
        gg.strokeStyle = 'rgba(128,128,128,.5)'; gg.lineWidth = 1; gg.beginPath(); gg.moveTo(34, 8); gg.lineTo(34, H - 18); gg.lineTo(W - 8, H - 18); gg.stroke();
        gg.fillStyle = css('--text-light') || '#888'; gg.font = '700 10px Nunito, sans-serif'; gg.fillText(fmt(hi, 1), 2, 14); gg.fillText(fmt(lo, 1), 2, H - 20); gg.fillText(fmt(tMax, 1) + ' s', W - 34, H - 4);
        gg.strokeStyle = o?.color || '#FF6B00'; gg.lineWidth = 2.5; gg.beginPath(); pts.forEach(([tt, y], k) => { if (tt > (t || tMax)) return; k ? gg.lineTo(X(tt), Y(y)) : gg.moveTo(X(tt), Y(y)); }); gg.stroke();
        if (t > 0) { gg.fillStyle = '#FFC800'; const near = pts.reduce((a, p) => Math.abs(p[0] - t) < Math.abs(a[0] - t) ? p : a, pts[0]); gg.beginPath(); gg.arc(X(near[0]), Y(near[1]), 4, 0, Math.PI * 2); gg.fill(); }
      });
    }
    function tableFor(i) {
      const gr = sc.graphs[i], o = objOf(gr.obj), tr = TRACK.find(x => x[0] === gr.prop), s = getSim(), gv = gravityOf(sc.world), rows = [];
      for (let tt = 0; tt <= s.end + 1e-9; tt += Math.max(.1, s.end / 40)) { const f = s.at(tt), b = f.b.find(q => q.id === gr.obj); if (b) rows.push([fmt(f.t, 2), fmt(trackOf(gr.prop, b, o, gv), 3)]); }
      return { head: ['Time (s)', `${tr[1]} (${tr[2]})`], rows };
    }

    // The side panel: world settings, the selected thing, sliders and graphs.
    function renderSide() {
      const o = sel ? objOf(sel) : null;
      const field = (label, attrs, val, unit = '') => `<label class="sl-field"><span>${esc(label)} <output>${fmt(val)}${unit ? sp(unit) + esc(unit) : ''}</output></span><input type="range" ${attrs} value="${val}"></label>`;
      let h = '';
      if (o) {
        const props = PROPS[o.kind];
        h += `<div class="sb-sec"><div class="sb-sec-top"><b>${esc(KINDS[o.kind].name)}</b><button type="button" class="sl-x" data-sb="deselect" aria-label="Done">✕</button></div>
          <label class="sl-field"><span>Name</span><input type="text" class="sb-in" data-p="name" value="${esc(o.name)}" maxlength="24"></label>
          ${o.kind === 'label' ? `<label class="sl-field"><span>Text</span><input type="text" class="sb-in" data-p="text" value="${esc(o.text)}" maxlength="60"></label>` : ''}
          <div class="sb-colors">${COLORS.map(c => `<button type="button" class="sb-color${c === o.color ? ' on' : ''}" style="--c:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
          ${props.map(([p, label, min, max, unit]) => field(label, `class="sb-range" data-p="${p}" min="${min}" max="${max}" step="${(max - min) > 50 ? 1 : .1}"`, o[p], unit)).join('')}
          ${KINDS[o.kind].dyn ? `<label class="sl-toggle"><input type="checkbox" class="sb-in" data-p="fixed"${o.fixed ? ' checked' : ''}><span class="sl-sw" aria-hidden="true"></span><span>Pinned in place</span></label>` : ''}
          ${o.kind === 'spring' ? `<label class="sl-field"><span>Attached to</span><select class="sb-in kx-select" data-p="to"><option value="">Nothing yet</option>${sc.objects.filter(x => KINDS[x.kind].dyn).map(x => `<option value="${x.id}"${x.id === o.to ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
          ${o.kind === 'target' ? `<label class="sl-field"><span>Goal: get this into the target</span><select class="sb-in kx-select" data-p="goal"><option value="">No goal</option>${sc.objects.filter(x => KINDS[x.kind].dyn).map(x => `<option value="${x.id}"${sc.goal?.target === o.id && sc.goal.obj === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
          <div class="sb-row">${props.length ? `<button type="button" class="fc-btn small" data-sb="add-slider">+ Slider for…</button>` : ''}${KINDS[o.kind].dyn ? '<button type="button" class="fc-btn small" data-sb="add-graph">+ Graph</button>' : ''}<button type="button" class="fc-btn small" data-sb="dup">Copy</button><button type="button" class="sl-btn ghost sm sb-del" data-sb="delete">Delete</button></div>
          <div class="sb-pick" hidden></div></div>`;
      } else h += `<div class="sb-sec sb-hint"><b>Tap something to change it</b><span>Or add a ball, ramp, spring or target from the row above the picture.</span></div>`;
      const w = sc.world;
      h += `<div class="sb-sec"><div class="sb-sec-top"><b>World</b></div>
        <label class="sl-field"><span>Gravity</span><select class="sb-world kx-select" data-w="planet">${Object.entries(PLANETS).map(([k, [gv, n]]) => `<option value="${k}"${k === w.planet && w.gravity == null ? ' selected' : ''}>${n}${gv ? ` (${gv} m/s²)` : ''}</option>`).join('')}${w.gravity != null ? `<option value="custom" selected>Custom (${fmt(w.gravity)} m/s²)</option>` : ''}</select></label>
        ${field('Air resistance', 'class="sb-world" data-w="air" min="0" max="1" step=".05"', w.air)}
        ${field('Bounciness', 'class="sb-world" data-w="bounce" min="0" max="1" step=".05"', w.bounce)}
        ${field('Friction', 'class="sb-world" data-w="friction" min="0" max="1" step=".05"', w.friction)}
        ${field('How wide the view is', 'class="sb-world" data-w="width" min="5" max="200" step="1"', w.width, 'm')}
        <button type="button" class="fc-btn small" data-sb="world-slider">+ Slider for gravity, air or bounce</button></div>
        <p class="fc-note sl-plan">Your plan: up to ${lim.objects} things, ${lim.sliders} slider${lim.sliders === 1 ? '' : 's'} and ${lim.graphs} graph${lim.graphs === 1 ? '' : 's'}.${tier === 'mega' ? '' : tier === 'plus' ? ' 💎 Mega Knox: 50 things, 12 sliders, 6 graphs.' : ' ⚡ Knox Plus: 20 things, 6 sliders, 3 graphs.'}</p>`;
      side.innerHTML = window.KI?.fill ? window.KI.fill(h) : h;
    }
    function renderSliders() {
      const box = host.querySelector('.sb-sliders');
      box.innerHTML = sc.sliders.map((s, i) => { const d = propDef(s.obj, s.prop), v = valOf(s.obj, s.prop), name = s.obj === 'world' ? 'World' : objOf(s.obj)?.name; return `<label class="sl-field sb-slider"><span>${esc(name)} · ${esc(d[1])} <output>${fmt(v)}${d[4] ? sp(d[4]) + esc(d[4]) : ''}</output><button type="button" class="sb-unslide" data-sb="unslide" data-i="${i}" aria-label="Remove slider">✕</button></span><input type="range" class="sb-live" data-i="${i}" min="${s.min}" max="${s.max}" step="${(s.max - s.min) > 50 ? 1 : .1}" value="${v}"></label>`; }).join('');
      box.hidden = !sc.sliders.length;
    }
    const redraw = () => { draw(); };
    const restart = () => { t = 0; cheered = false; setPlaying(false); renderSliders(); draw(); };

    // Play.
    function frame(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; const s = getSim(); t = Math.min(s.end, t + dt); draw(); if (t >= s.end) { setPlaying(false); return; } raf = requestAnimationFrame(frame); }
    function setPlaying(on) { playing = on; cancelAnimationFrame(raf); const b = host.querySelector('[data-sb="play"]'); if (b) b.innerHTML = on ? `${PI.pause} Pause` : t > 0 && t < (sim?.end || 0) ? `${PI.play} Keep going` : `${PI.play} Play`; if (on) { if (t >= getSim().end) { t = 0; cheered = false; } last = performance.now(); raf = requestAnimationFrame(frame); } }

    // Pointer: pick, drag, aim.
    function hit(px, py) {
      const v = view();
      for (const o of [...sc.objects].reverse()) {
        if (KINDS[o.kind].dyn && !o.fixed && o.speed > 0) { const a = o.dir * Math.PI / 180, L = 14 + o.speed * 3, tx = v.X(o.x) + L * Math.cos(a), ty = v.Y(o.y) - L * Math.sin(a); if (Math.hypot(px - tx, py - ty) < 12) return { o, mode: 'aim' }; }
        if (o.kind === 'ramp' || o.kind === 'wall') { const [x1, y1, x2, y2] = segOf(o).map((q, i) => i % 2 ? v.Y(q) : v.X(q)); const ex = x2 - x1, ey = y2 - y1, u = clamp(((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey || 1), 0, 1); if (Math.hypot(px - (x1 + u * ex), py - (y1 + u * ey)) < 10) return { o, mode: 'move' }; continue; }
        const r = o.kind === 'label' ? 30 : o.kind === 'spring' ? 10 : Math.max(10, (o.kind === 'box' ? o.w / 2 : o.r) * v.k);
        if (Math.hypot(px - v.X(o.x), py - v.Y(o.y) + (o.kind === 'label' ? 5 : 0)) < r) return { o, mode: 'move' };
      }
      return null;
    }
    canvas.addEventListener('pointerdown', e => {
      if (playing || t > 0) { restart(); }
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = hit(px, py);
      if (!h) { sel = null; renderSide(); draw(); return; }
      sel = h.o.id; drag = { ...h, ox: h.o.x, oy: h.o.y, sx: px, sy: py }; canvas.setPointerCapture(e.pointerId); renderSide(); draw();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, v = view(), o = drag.o;
      if (drag.mode === 'aim') { const dx = px - v.X(o.x), dy = -(py - v.Y(o.y)); o.dir = Math.round(Math.atan2(dy, dx) * 180 / Math.PI); o.speed = clamp(Math.round((Math.hypot(dx, dy) - 14) / 3 * 2) / 2, 0, 60); }
      else { o.x = Math.round(clamp(drag.ox + (px - drag.sx) / v.k, 0, sc.world.width) * 10) / 10; o.y = Math.round(clamp(drag.oy - (py - drag.sy) / v.k, 0, 200) * 10) / 10; }
      dirty(); draw();
    });
    canvas.addEventListener('pointerup', () => { if (drag) { drag = null; renderSide(); renderSliders(); } });

    // Inputs.
    host.addEventListener('input', e => {
      const el = e.target;
      if (el.classList.contains('sb-live')) { const s = sc.sliders[+el.dataset.i]; setVal(s.obj, s.prop, Number(el.value)); const out = el.parentElement.querySelector('output'); const d = propDef(s.obj, s.prop); if (out) out.textContent = fmt(Number(el.value)) + (d[4] ? sp(d[4]) + d[4] : ''); t = 0; cheered = false; setPlaying(false); draw(); return; }
      if (el.classList.contains('sb-range')) { const o = objOf(sel); if (!o) return; o[el.dataset.p] = Number(el.value); const out = el.parentElement.querySelector('output'); if (out) out.textContent = fmt(Number(el.value)); dirty(); renderSliders(); draw(); return; }
      if (el.classList.contains('sb-world') && el.type === 'range') { sc.world[el.dataset.w] = Number(el.value); const out = el.parentElement.querySelector('output'); if (out) out.textContent = fmt(Number(el.value)) + (el.dataset.w === 'width' ? ' m' : ''); dirty(); draw(); return; }
      if (el.classList.contains('sb-in') && el.type === 'text') { const o = objOf(sel); if (o) { o[el.dataset.p] = el.value.replace(/[<>]/g, '').slice(0, el.dataset.p === 'text' ? 60 : 24); draw(); renderSliders(); } return; }
      if (el.classList.contains('sl-title')) sc.title = el.value.replace(/[<>]/g, '').slice(0, 40);
    }, on);
    host.addEventListener('change', e => {
      const el = e.target;
      if (el.matches('select.sb-world')) { if (el.value !== 'custom') { sc.world.planet = el.value; delete sc.world.gravity; } dirty(); renderSliders(); draw(); return; }
      if (el.matches('.sb-in[data-p="fixed"]')) { const o = objOf(sel); if (o) { o.fixed = el.checked; dirty(); draw(); } return; }
      if (el.matches('.sb-in[data-p="to"]')) { const o = objOf(sel); if (o) { o.to = el.value; dirty(); draw(); } return; }
      if (el.matches('.sb-in[data-p="goal"]')) { sc.goal = el.value ? { obj: el.value, target: sel } : (sc.goal?.target === sel ? null : sc.goal); cheered = false; draw(); }
    }, on);
    host.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
      if (b.dataset.add) {
        if (sc.objects.length >= lim.objects) { upsell(`You can use up to ${lim.objects} things on your plan. ${tier === 'free' ? '⚡ Knox Plus gets 20.' : '💎 Mega Knox gets 50.'}`); return; }
        const k = b.dataset.add, n = sc.objects.filter(o => o.kind === k).length + 1, cx = Math.round(sc.world.width * (.3 + Math.random() * .4));
        const o = clean({ objects: [{ kind: k, id: newId(), x: k === 'wall' ? cx : k === 'spring' ? cx : cx, y: k === 'ball' || k === 'box' ? 4 : k === 'target' ? 2 : k === 'spring' ? 8 : k === 'label' ? 6 : 0, color: COLORS[sc.objects.length % COLORS.length], name: `${KINDS[k].name} ${n}`, speed: 0, dir: 0, to: k === 'spring' ? (sc.objects.find(x => KINDS[x.kind].dyn)?.id || '') : '' }] }).objects[0];
        sc.objects.push(o); sel = o.id; restart(); renderSide(); return;
      }
      if (b.dataset.color) { const o = objOf(sel); if (o) { o.color = b.dataset.color; renderSide(); draw(); } return; }
      const act = b.dataset.sb; if (!act) return;
      if (act === 'play') setPlaying(!playing);
      else if (act === 'reset') restart();
      else if (act === 'deselect') { sel = null; renderSide(); draw(); }
      else if (act === 'delete') { sc.objects = sc.objects.filter(o => o.id !== sel); sc = clean(sc); sel = null; restart(); renderSide(); }
      else if (act === 'dup') { if (sc.objects.length >= lim.objects) { upsell(`Up to ${lim.objects} things on your plan.`); return; } const o = { ...objOf(sel), id: newId() }; o.x = Math.min(sc.world.width, o.x + 2); o.name = o.name + ' copy'; sc.objects.push(clean({ objects: [o] }).objects[0]); sel = sc.objects[sc.objects.length - 1].id; restart(); renderSide(); }
      else if (act === 'add-slider' || act === 'world-slider') {
        const pick = side.querySelector('.sb-pick'), list = act === 'world-slider' ? WORLD_PROPS : PROPS[objOf(sel).kind], obj = act === 'world-slider' ? 'world' : sel;
        if (sc.sliders.length >= lim.sliders) { upsell(`Up to ${lim.sliders} slider${lim.sliders === 1 ? '' : 's'} on your plan. ${tier === 'free' ? '⚡ Knox Plus gets 6.' : '💎 Mega Knox gets 12.'}`); return; }
        const html = `<span class="fc-field-label">Make a slider for:</span>${list.map(([p, l]) => `<button type="button" class="fc-chip" data-sb="slide-pick" data-obj="${obj}" data-prop="${p}">${esc(l)}</button>`).join('')}`;
        if (pick && act === 'add-slider') { pick.innerHTML = html; pick.hidden = false; } else { b.insertAdjacentHTML('afterend', `<div class="sb-pick">${html}</div>`); }
      }
      else if (act === 'slide-pick') { const d = propDef(b.dataset.obj, b.dataset.prop); if (!sc.sliders.some(s => s.obj === b.dataset.obj && s.prop === b.dataset.prop)) sc.sliders.push({ obj: b.dataset.obj, prop: b.dataset.prop, min: d[2], max: d[3] }); renderSliders(); renderSide(); }
      else if (act === 'unslide') { sc.sliders.splice(+b.dataset.i, 1); renderSliders(); }
      else if (act === 'add-graph') {
        if (sc.graphs.length >= lim.graphs) { upsell(`Up to ${lim.graphs} graph${lim.graphs === 1 ? '' : 's'} on your plan. ${tier === 'free' ? '⚡ Knox Plus gets 3.' : '💎 Mega Knox gets 6.'}`); return; }
        const pick = side.querySelector('.sb-pick'); pick.innerHTML = `<span class="fc-field-label">Graph this over time:</span>${TRACK.map(([p, l]) => `<button type="button" class="fc-chip" data-sb="graph-pick" data-prop="${p}">${esc(l)}</button>`).join('')}`; pick.hidden = false;
      }
      else if (act === 'graph-pick') { sc.graphs.push({ obj: sel, prop: b.dataset.prop }); host.querySelector('.sb-graphs').innerHTML = ''; renderSide(); draw(); }
      else if (act === 'ungraph') { sc.graphs.splice(+b.dataset.i, 1); host.querySelector('.sb-graphs').innerHTML = ''; draw(); }
      else if (act === 'table') {
        const box = b.closest('.sb-graph').querySelector('.sb-table'), { head, rows } = tableFor(+b.dataset.i);
        if (!box.hidden) { box.hidden = true; return; }
        box.innerHTML = `<div class="sb-table-top"><button type="button" class="fc-btn small" data-sb="copy" data-i="${b.dataset.i}">Copy for a spreadsheet</button></div><table><thead><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`; box.hidden = false;
      }
      else if (act === 'copy') { const { head, rows } = tableFor(+b.dataset.i), tsv = [head, ...rows].map(r => r.join('\t')).join('\n'); navigator.clipboard?.writeText(tsv).then(() => { b.textContent = 'Copied ✓'; }, () => { b.textContent = 'Couldn’t copy'; }); }
      else if (act === 'save') Promise.resolve(opts.onSave?.(clean(sc))).then(name => { if (!name) return; sc.title = String(name).slice(0, 40); const h = host.querySelector('.fc-title'); if (h) h.innerHTML = accentLast(sc.title); if (b.isConnected) { b.textContent = 'Saved ✓'; setTimeout(() => { if (b.isConnected) b.textContent = 'Save'; }, 1600); } });
      else if (act === 'share') opts.onShare?.(clean(sc), b);
      else if (act === 'publish') opts.onPublish?.(clean(sc), b);
      else if (act === 'back') { stop(); opts.onBack?.(); }
      else if (act === 'upgrade') window.goToPricing?.();
      else if (act === 'close-upsell') b.closest('.sb-upsell')?.remove();
    }, on);
    // Arrow keys nudge the selected thing (Shift = bigger steps).
    const onKey = e => {
      if (!sel || playing || !host.isConnected || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      const o = objOf(sel), d = e.shiftKey ? 1 : .1; if (!o) return;
      if (e.key === 'ArrowLeft') o.x -= d; else if (e.key === 'ArrowRight') o.x += d; else if (e.key === 'ArrowUp') o.y += d; else if (e.key === 'ArrowDown') o.y = Math.max(0, o.y - d); else if (e.key === 'Delete' || e.key === 'Backspace') { sc.objects = sc.objects.filter(x => x.id !== sel); sc = clean(sc); sel = null; renderSide(); } else return;
      e.preventDefault(); o.x = Math.round(o.x * 10) / 10; o.y = Math.round(o.y * 10) / 10; dirty(); draw();
    };
    addEventListener('keydown', onKey, on);
    const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(canvas);
    function stop() { cancelAnimationFrame(raf); ro.disconnect(); ac.abort(); }
    size(); renderSliders(); renderSide(); draw();
    return { stop, scene: () => clean(sc) };
  }

  window.knoxSimBuilder = { mount, clean, blank, LIMITS, simulate };
})();
