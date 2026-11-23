// bags3d.js — the blind bag opening experience (bags.js calls it).
//
// A real 3D Knox bag (three.js, loaded only when a bag is opened): a puffy
// foil pillow in Knox orange with Knox's face, the "?" coin and crimped
// edges. It drops onto a snowy night stage, floats and tilts toward your
// pointer while the light slides across the foil. Swipe across the top
// (mouse or finger) along the dotted tear line: the strip peels with your
// swipe and, once it rips, light in the figure's rarity color bursts out,
// confetti flies and the figure rises out spinning.
//
//   window.knoxBagStage.supported()               — WebGL and motion allowed
//   window.knoxBagStage.play({ result, onReveal }) — result: a function
//       returning a Promise of { figure, isNew, rarity, name, art } (the
//       server's pick). It's only called once the bag is torn, so closing
//       before that keeps the bag. onReveal(how) runs when the stage closes
//       ('again', 'done' or 'close').
(function () {
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const RARITY_COLOR = { common: '#1CB0F6', rare: '#CE82FF', epic: '#FF4F57', secret: '#FFC800' };
  const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', secret: 'Secret' };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let threeReady = null;
  const loadThree = () => threeReady || (threeReady = window.THREE ? Promise.resolve(window.THREE) : new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = THREE_URL; s.async = true;
    s.onload = () => window.THREE ? ok(window.THREE) : bad(new Error('3D failed to load'));
    s.onerror = () => { threeReady = null; bad(new Error('3D failed to load')); };
    document.head.append(s);
  }));
  function supported() {
    if (reduce()) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
  }

  // ── The bag's printed faces, drawn on a canvas (Nunito, Knox colors) ──────
  const FOX_FACE = `<g><path d="M30 44 24 12 52 32Z M90 44 96 12 68 32Z" fill="#FF8A3D" stroke="#CC5500" stroke-width="3" stroke-linejoin="round"/><path d="M33 36 30 20 45 32Z M87 36 90 20 75 32Z" fill="#7A3B12"/><ellipse cx="60" cy="56" rx="35" ry="29" fill="#FF8A3D" stroke="#CC5500" stroke-width="3"/><path d="M32 62c8 14 18 20 28 20s20-6 28-20c-8 4-18 2-28 2s-20 2-28-2Z" fill="#fff"/><circle cx="47" cy="54" r="4.6" fill="#3C3C3C"/><circle cx="73" cy="54" r="4.6" fill="#3C3C3C"/><circle cx="48.6" cy="52.4" r="1.5" fill="#fff"/><circle cx="74.6" cy="52.4" r="1.5" fill="#fff"/><ellipse cx="60" cy="66" rx="4.8" ry="3.5" fill="#3C3C3C"/><path d="M54 71c3 3 9 3 12 0" fill="none" stroke="#3C3C3C" stroke-width="2.2" stroke-linecap="round"/><path d="M28 34c6-24 52-30 66-8l6 18-8 2c-4-10-10-16-16-16-14 0-34 2-42 4Z" fill="#E5383B" stroke="#B3202A" stroke-width="3" stroke-linejoin="round"/><circle cx="98" cy="48" r="6" fill="#fff"/><rect x="24" y="32" width="70" height="10" rx="5" fill="#fff"/></g>`;
  const svgImage = svg => new Promise(ok => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => ok(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  async function faceTexture(THREE, back) {
    const W = 512, H = 672, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#FF6B00'; g.fillRect(0, 0, W, H);
    // Foil stripes and a few snowflakes printed on the bag.
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let x = -H; x < W; x += 46) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 20, H); g.lineTo(x + 20 + H, 0); g.lineTo(x + H, 0); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.22)';
    for (const [x, y, r] of [[60, 120, 7], [450, 90, 6], [470, 380, 8], [40, 430, 6], [400, 560, 5], [110, 600, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    await document.fonts?.ready;
    if (!back) {
      const fox = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 92" width="600" height="460">${FOX_FACE}</svg>`);
      if (fox) g.drawImage(fox, 96, 150, 320, 245);
      // The "?" coin
      g.fillStyle = '#FFC800'; g.strokeStyle = '#D9A300'; g.lineWidth = 9;
      g.beginPath(); g.arc(420, 140, 48, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#7A5400'; g.font = '900 64px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 420, 144);
      // Label
      g.fillStyle = '#FFF8F0'; g.strokeStyle = '#CC5500'; g.lineWidth = 8;
      roundRect(g, 56, 438, 400, 118, 26); g.fill(); g.stroke();
      g.fillStyle = '#CC5500'; g.font = '900 54px Nunito, sans-serif'; g.fillText('KNOX KNOWS', 256, 486);
      g.fillStyle = '#E5383B'; g.font = '900 22px Nunito, sans-serif'; g.fillText('SERIES 1 · KNOX’S CHRISTMAS', 256, 530);
      g.fillStyle = '#fff'; g.font = '900 26px Nunito, sans-serif'; g.fillText('BLIND BAG', 256, 610);
    } else {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#FFF8F0'; g.font = '900 48px Nunito, sans-serif'; g.fillText('Collect all 12!', 256, 130);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '800 24px Nunito, sans-serif'; g.fillText('Who’s inside? Tear the top to find out.', 256, 178);
      for (let i = 0; i < 12; i++) {
        const x = 106 + (i % 4) * 100, y = 270 + Math.floor(i / 4) * 110;
        g.fillStyle = i === 11 ? '#FFC800' : '#FFE0C2'; g.strokeStyle = i === 11 ? '#D9A300' : '#CC5500'; g.lineWidth = 6;
        g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = i === 11 ? '#7A5400' : '#CC5500'; g.font = '900 40px Nunito, sans-serif'; g.fillText('?', x, y + 2);
      }
      g.fillStyle = '#fff'; g.font = '900 30px Nunito, sans-serif'; g.fillText('KNOX KNOWS', 256, 620);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ── Geometry: a puffy pillow and crimped strips ─────────────────────────
  const BW = 1.6, BH = 2.1, PUFF = 0.24;
  function pillow(THREE, side) {
    const geo = new THREE.PlaneGeometry(BW, BH, 40, 52), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / BW + .5, v = p.getY(i) / BH + .5;
      // max(0, …): sin(π·u) dips a hair below 0 at the edges, and pow() of that is NaN (black edges).
      const bulge = Math.pow(Math.max(0, Math.sin(Math.PI * u)), .55) * Math.pow(Math.max(0, Math.sin(Math.PI * v)), .45);
      p.setZ(i, PUFF * bulge);
      // Slight pinch toward the crimped ends, like a real foil bag.
      p.setX(i, p.getX(i) * (1 - .05 * Math.pow(Math.abs(v - .5) * 2, 3)));
    }
    if (side < 0) geo.rotateY(Math.PI); // the back bulges the other way and faces outward
    geo.computeVertexNormals();
    return geo;
  }
  function crimp(THREE, top) {
    const geo = new THREE.PlaneGeometry(BW * .96, .2, 48, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const outer = top ? p.getY(i) > 0 : p.getY(i) < 0;
      if (outer && i % 2) p.setY(i, p.getY(i) + (top ? .045 : -.045)); // zigzag teeth
    }
    geo.computeVertexNormals();
    return geo;
  }
  function crimpTexture(THREE) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#F26200'; g.fillRect(0, 0, 256, 32);
    g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 32);
    return new THREE.CanvasTexture(c);
  }
  function glowTexture(THREE, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(.25, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  // ── The stage ───────────────────────────────────────────────────────────
  async function play({ result, onReveal }) {
    const THREE = await loadThree();
    const stage = document.createElement('div');
    stage.className = 'kb3-stage';
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true'); stage.setAttribute('aria-label', 'Open your blind bag');
    stage.innerHTML = `<div class="kb3-snow" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 37 + 5) % 100}%;--d:${7 + i % 6}s;--delay:-${(i * 1.3) % 8}s;--s:${4 + i % 4}px"></i>`).join('')}</div>
      <div class="kb3-spot" aria-hidden="true"></div>
      <canvas class="kb3-canvas"></canvas>
      <div class="kb3-tearline" aria-hidden="true"><span class="kb3-scissors">${window.KI ? window.KI('scissors', { tint: false }) : '✂'}</span></div>
      <div class="kb3-hint"><b>Swipe across the dotted line</b><span>with your mouse, trackpad or finger</span></div>
      <button type="button" class="kb3-tear-btn">${window.KI ? window.KI('scissors', { tint: false }) : '✂'}<span>Tear it open</span></button>
      <button type="button" class="kb3-close" aria-label="Close">✕</button>
      <div class="kb3-reveal" hidden></div>`;
    document.body.append(stage);
    const canvas = stage.querySelector('.kb3-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 50);
    camera.position.set(0, .1, 5.4);

    // Lights: a warm key, a cool rim and a light that follows your pointer (the foil's sheen).
    scene.add(new THREE.HemisphereLight(0xFFF4E8, 0x23314D, .85));
    const key = new THREE.DirectionalLight(0xffffff, .9); key.position.set(2.5, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9FD4FF, .55); rim.position.set(-3, 1.5, -2); scene.add(rim);
    const sheen = new THREE.PointLight(0xffffff, .55, 8); sheen.position.set(0, 0, 3); scene.add(sheen);

    // A soft studio for the foil to reflect: warm softboxes over a cool floor,
    // so the edges catch light instead of going black.
    try {
      const env = new THREE.Scene(), eg = new THREE.SphereGeometry(10, 32, 16), ep = eg.attributes.position, ec = [];
      const top = new THREE.Color(0xFFF1E0), mid = new THREE.Color(0x8A6A5A), low = new THREE.Color(0x1A2740);
      for (let i = 0; i < ep.count; i++) { const y = ep.getY(i) / 10, c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(low, -y); ec.push(c.r, c.g, c.b); }
      eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
      env.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      [[4, 4, 6, 5, 2.4], [-5, 2, 4, 3, 2], [0, 6, -3, 6, 2]].forEach(([x, y, z, pw, ph]) => {
        const box = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        box.position.set(x, y, z); box.lookAt(0, 0, 0); env.add(box);
      });
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(env, .04).texture; pmrem.dispose();
    } catch (_) {}

    const [front, back] = await Promise.all([faceTexture(THREE, false), faceTexture(THREE, true)]);
    [front, back].forEach(t => { t.encoding = THREE.sRGBEncoding; });
    const foil = map => new THREE.MeshStandardMaterial({ map, metalness: .38, roughness: .34 });
    const bag = new THREE.Group();
    bag.add(new THREE.Mesh(pillow(THREE, 1), foil(front)));
    bag.add(new THREE.Mesh(pillow(THREE, -1), foil(back)));
    const crimpTex = crimpTexture(THREE); crimpTex.encoding = THREE.sRGBEncoding;
    const crimpMat = new THREE.MeshStandardMaterial({ map: crimpTex, metalness: .3, roughness: .45, side: THREE.DoubleSide, transparent: true });
    const bottom = new THREE.Mesh(crimp(THREE, false), crimpMat); bottom.position.y = -BH / 2 - .08; bag.add(bottom);
    // The top strip tears off: it pivots from its left end.
    const topPivot = new THREE.Group(); topPivot.position.set(-BW * .48, BH / 2 + .08, 0);
    const topStrip = new THREE.Mesh(crimp(THREE, true), crimpMat.clone()); topStrip.position.x = BW * .48; topPivot.add(topStrip);
    bag.add(topPivot);
    scene.add(bag);

    // The opening's light, glow and sparks, in the figure's rarity color (once we know it).
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(THREE, '#ffffff'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMat); glow.position.set(0, BH / 2, .1); glow.scale.set(.1, .1, 1); bag.add(glow);
    const inside = new THREE.PointLight(0xffffff, 0, 4); inside.position.set(0, BH / 2 - .2, .5); bag.add(inside);
    const sparkGeo = new THREE.BufferGeometry(), N = 70, sp = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) { sp.set([0, BH / 2, 0], i * 3); vel.push([(Math.random() - .5) * 2.2, 1.4 + Math.random() * 2.2, (Math.random() - .5) * 1.4]); }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sparkMat = new THREE.PointsMaterial({ size: .07, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const sparks = new THREE.Points(sparkGeo, sparkMat); bag.add(sparks);

    // Size + tear line position (follows the bag's top on screen).
    const tearline = stage.querySelector('.kb3-tearline');
    function size() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Leave room above for the burst and below for the hint and button.
      // Far enough that the bag fits the height (short screens) and stays
      // under ~56% of the width (phones).
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.z = Math.max(7.3 * Math.max(1, 820 / Math.max(500, h)), (BW / .56) / camera.aspect / (2 * tan));
      camera.position.y = -.2; // sits the bag a little high, above the hint
      camera.updateProjectionMatrix();
    }
    size(); addEventListener('resize', size);
    function placeTearline() {
      const a = new THREE.Vector3(-BW / 2, BH / 2 - .02, PUFF * .4), b = new THREE.Vector3(BW / 2, BH / 2 - .02, PUFF * .4);
      bag.localToWorld(a); bag.localToWorld(b); a.project(camera); b.project(camera);
      const W = stage.clientWidth, H = stage.clientHeight;
      const x1 = (a.x + 1) / 2 * W, x2 = (b.x + 1) / 2 * W, y = (1 - (a.y + 1) / 2) * H;
      tearline.style.left = x1 + 'px'; tearline.style.width = Math.max(0, x2 - x1) + 'px'; tearline.style.top = y + 'px';
      return { x1, x2, y };
    }

    // Pointer: tilt toward it, and swipe across the dotted line to tear. A
    // swipe counts pressed (mouse drag, finger) or not (just gliding the cursor
    // across on a trackpad): how far you've covered along the line is the tear.
    let px = .5, py = .5, tear = 0, tearing = false, pressed = false, minX = 0, maxX = 0, torn = false, t0 = performance.now();
    let dropT = 0, openT = 0;
    const band = line => Math.max(64, (line.x2 - line.x1) * .4);
    const resetTear = () => { tearing = false; tear = 0; stage.classList.remove('is-tearing'); stage.style.setProperty('--tear', 0); };
    const track = e => {
      if (torn || dropT < 1) return;
      const line = placeTearline(), r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const near = Math.abs(y - line.y) <= band(line) && x >= line.x1 - 60 && x <= line.x2 + 60;
      if (!tearing) {
        if (!near) return;
        tearing = true; minX = maxX = x; stage.classList.add('is-tearing');
      } else if (!near && !pressed) { resetTear(); return; } // wandered off: start over
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      tear = Math.min(1, (maxX - minX) / (Math.max(80, line.x2 - line.x1) * .7));
      stage.style.setProperty('--tear', tear.toFixed(3));
      if (tear >= 1) rip();
    };
    const onMove = e => {
      const r = stage.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; py = (e.clientY - r.top) / r.height;
      track(e);
    };
    const onDown = e => {
      if (torn || dropT < 1) return;
      pressed = true; tearing = false; track(e);
      if (tearing) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    };
    const onUp = () => { pressed = false; if (!torn && tear < 1 && tearing) resetTear(); };
    canvas.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
    stage.addEventListener('pointerleave', () => { if (!torn && !pressed) resetTear(); });
    stage.querySelector('.kb3-tear-btn').addEventListener('click', () => { if (!torn && dropT >= 1) { tear = 1; rip(); } });
    stage.querySelector('.kb3-close').addEventListener('click', () => end('close'));
    const onKey = e => { if (e.key === 'Escape') end('close'); if ((e.key === 'Enter' || e.key === ' ') && !torn && dropT >= 1 && document.activeElement === stage.querySelector('.kb3-tear-btn')) { e.preventDefault(); tear = 1; rip(); } };
    addEventListener('keydown', onKey);

    let picked = null, pickErr = null, ended = false;
    async function rip() {
      if (torn) return; torn = true; tearing = false;
      stage.classList.remove('is-tearing'); stage.classList.add('is-torn');
      navigator.vibrate?.(18);
      // Only now ask for the figure (the bag shakes while it comes back).
      Promise.resolve().then(() => typeof result === 'function' ? result() : result).then(r => { picked = r; }, e => { pickErr = e; });
      while (!picked && !pickErr) await new Promise(r => setTimeout(r, 60));
      if (ended) return;
      if (pickErr) { end('error', pickErr); return; }
      const col = new THREE.Color(RARITY_COLOR[picked.rarity] || '#ffffff');
      glowMat.map = glowTexture(THREE, RARITY_COLOR[picked.rarity]); glowMat.needsUpdate = true;
      inside.color = col; sparkMat.color = col;
      stage.style.setProperty('--rc', RARITY_COLOR[picked.rarity]);
      openT = performance.now();
    }

    // Confetti + the figure rising out, then the reveal card.
    function showReveal() {
      const r = stage.querySelector('.kb3-reveal'); r.hidden = false;
      r.className = 'kb3-reveal r-' + picked.rarity;
      r.innerHTML = (window.KI?.fill || (x => x))(`<div class="kb3-confetti" aria-hidden="true">${Array.from({ length: 46 }, (_, i) => `<i style="--x:${(i * 53) % 100 - 50}vw;--r:${(i * 97) % 720 - 360}deg;--c:${['#FF6B00', '#1CB0F6', '#58CC02', '#CE82FF', '#FFC800', '#FF4F57'][i % 6]};--d:${1.4 + (i % 5) * .25}s;--delay:${(i % 7) * .04}s"></i>`).join('')}</div>
        <div class="kb3-fig">${picked.art}</div>
        <span class="kb3-tag ${picked.isNew ? 'new' : 'dup'}">${picked.isNew ? 'NEW!' : 'Duplicate'}</span>
        <span class="kb3-rarity">${RARITY_NAME[picked.rarity]}</span>
        <h2>${picked.name}</h2>
        <p>${picked.isNew ? (picked.rarity === 'secret' ? 'The secret figure! You found Golden Knox.' : 'Added to your collection.') : 'You already have this one. 3 duplicates trade in for a new bag.'}</p>
        <div class="kb3-actions">${picked.more ? '<button type="button" class="kb3-again">Open another</button>' : ''}<button type="button" class="kb3-done">${picked.more ? 'My collection' : 'Yay!'}</button></div>`);
      r.querySelector('.kb3-again')?.addEventListener('click', () => end('again'));
      r.querySelector('.kb3-done').addEventListener('click', () => end('done'));
      (r.querySelector('.kb3-again') || r.querySelector('.kb3-done')).focus();
    }

    let raf = 0, revealed = false;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      // Drop in with a bounce, then float.
      dropT = Math.min(1, t / .9);
      const ease = 1 - Math.pow(1 - dropT, 3), bounce = dropT < 1 ? Math.sin(dropT * Math.PI) * .25 : 0;
      bag.position.y = (1 - ease) * 3.2 + bounce * .3 + Math.sin(t * 1.6) * .05;
      // Tilt toward the pointer; a little shake while you tear.
      const shake = tearing ? (Math.random() - .5) * .03 * (1 + tear * 2) : torn && !openT ? (Math.random() - .5) * .07 : 0;
      bag.rotation.y += ((px - .5) * .7 - bag.rotation.y) * .08;
      bag.rotation.x += ((py - .5) * .35 - bag.rotation.x) * .08;
      bag.rotation.z = shake + Math.sin(t * 1.1) * .02;
      sheen.position.set((px - .5) * 5, (.5 - py) * 4, 3);
      // The strip peels with your swipe.
      if (!openT) { topPivot.rotation.z = tear * .42; topPivot.position.y = BH / 2 + .08 + tear * .06; topPivot.rotation.x = -tear * .2; }
      if (openT) {
        const k = Math.min(1, (now - openT) / 1000);
        topPivot.rotation.z = .42 + k * 1.6; topPivot.position.x = -BW * .48 + k * 1.2; topPivot.position.y = BH / 2 + .14 + k * 1.4;
        topStrip.material.opacity = 1 - k;
        glowMat.opacity = Math.min(1, k * 3) * (1 - Math.max(0, k - .7) / .3 * .5);
        glow.scale.setScalar(.3 + k * 3.4);
        inside.intensity = k * 3;
        const pos = sparkGeo.attributes.position;
        for (let i = 0; i < N; i++) pos.setXYZ(i, vel[i][0] * k, BH / 2 + vel[i][1] * k - k * k * 1.2, vel[i][2] * k);
        pos.needsUpdate = true; sparkMat.opacity = 1 - k * .6;
        // The bag drops away off the bottom as the figure comes out.
        const sink = Math.min(1, Math.max(0, (now - openT - 420) / 650));
        bag.position.y -= sink * sink * 6;
        bag.scale.setScalar(1 - sink * .25);
        if (k > .55 && !revealed) { revealed = true; showReveal(); }
      } else placeTearline();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    stage.querySelector('.kb3-tear-btn').focus({ preventScroll: true });

    function end(how, err) {
      if (ended) return; ended = true;
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointerup', onUp); removeEventListener('keydown', onKey);
      stage.classList.add('is-leaving');
      setTimeout(() => { renderer.dispose(); stage.remove(); }, 220);
      onReveal?.(how, err);
    }
  }
  window.knoxBagStage = { supported, play, preload: () => supported() && loadThree().catch(() => {}) };
})();
