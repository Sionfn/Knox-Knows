// bags3d.js — the blind bag opening experience (bags.js calls it).
//
// A real 3D Knox bag (three.js, loaded only when a bag is opened): a puffy
// foil pillow in Knox orange with Knox's face, the "?" coin and crimped
// edges. It drops onto a snowy night stage, floats and tilts toward your
// pointer while the light slides across the foil.
//
// Hold on the dotted line and drag across (mouse, trackpad or finger): the
// tear starts on the side you start from and the strip peels after you, light
// leaking out of the gap. Rip it all the way and the strip flies off; the bag
// rattles while light pours out and climbs through the colors (white → blue →
// purple → red → gold), stopping at the figure's rarity. Then it bursts (a
// flash, a shockwave, sparks), the bag drops away, and the figure pops out
// with spinning rays, twinkles, confetti and a NEW! stamp. Sounds play only
// with Sound effects on (knox-sound.js; the speaker button switches it).
//
//   window.knoxBagStage.supported()               — WebGL and motion allowed
//   window.knoxBagStage.play({ result, onReveal }) — result: a function
//       returning a Promise of { figure, isNew, rarity, name, art, more }
//       (the server's pick), called only once the bag is torn, so closing
//       before that keeps the bag. onReveal(how) runs when the stage closes
//       ('again', 'done', 'close' or 'error').
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

  const loadImg = src => new Promise(ok => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => ok(null); img.src = src; });
  const FIG_IDS = ['elf', 'snowman', 'reindeer', 'gingerbread', 'cocoa', 'sweater', 'skater', 'caroler', 'snowball', 'santa', 'nutcracker', 'golden'];
  // A snowflake: six arms with little branches.
  function flake(g, x, y, r, alpha) {
    g.save(); g.translate(x, y); g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = Math.max(2, r / 6); g.lineCap = 'round';
    for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.moveTo(0, -r * .55); g.lineTo(r * .25, -r * .78); g.moveTo(0, -r * .55); g.lineTo(-r * .25, -r * .78); g.stroke(); }
    g.restore();
  }
  // ── The bag's printed faces: Knox's Christmas pack (red foil, snowflakes,
  // a gold ribbon, the real Santa Knox figure, the "?" coin and the label).
  async function faceCanvas(back) {
    const W = 512, H = 672, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#E8333A'); bg.addColorStop(.55, '#C81E2A'); bg.addColorStop(1, '#A3151F');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // Candy-stripe sheen and snowflakes printed on the foil.
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = -H; x < W; x += 56) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 22, H); g.lineTo(x + 22 + H, 0); g.lineTo(x + H, 0); g.fill(); }
    for (const [x, y, r, a] of [[58, 96, 22, .35], [458, 250, 16, .3], [44, 330, 14, .28], [470, 470, 22, .3], [70, 560, 18, .3], [250, 40, 12, .25], [440, 620, 12, .25], [150, 640, 10, .22]]) flake(g, x, y, r, a);
    await document.fonts?.ready;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Green band across the bottom with a gold edge.
    g.fillStyle = '#17803F'; g.fillRect(0, H - 92, W, 92);
    g.fillStyle = '#F2B705'; g.fillRect(0, H - 98, W, 8);
    if (!back) {
      // Gold ribbon running down, with a bow at the top.
      g.fillStyle = 'rgba(242,183,5,.92)'; g.fillRect(W / 2 - 20, 0, 40, H - 98);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(W / 2 + 12, 0, 8, H - 98);
      g.fillStyle = '#F2B705'; g.strokeStyle = '#B98500'; g.lineWidth = 6;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2, 46); g.bezierCurveTo(W / 2 + s * 30, 0, W / 2 + s * 92, 8, W / 2 + s * 76, 52); g.bezierCurveTo(W / 2 + s * 66, 80, W / 2 + s * 26, 66, W / 2, 46); g.fill(); g.stroke(); }
      g.beginPath(); g.arc(W / 2, 48, 15, 0, Math.PI * 2); g.fill(); g.stroke();
      // Glow behind Knox, then the real Santa Knox figure.
      const glow = g.createRadialGradient(W / 2, 270, 10, W / 2, 270, 190); glow.addColorStop(0, 'rgba(255,236,170,.75)'); glow.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = glow; g.fillRect(0, 60, W, 420);
      const santa = await loadImg('/bags/knox-santa.webp');
      if (santa) { g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowOffsetY = 8; g.shadowBlur = 10; g.drawImage(santa, W / 2 - 165, 92, 330, 330); g.restore(); }
      // The "?" coin
      g.fillStyle = '#FFC800'; g.strokeStyle = '#B98500'; g.lineWidth = 9;
      g.beginPath(); g.arc(426, 128, 46, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#7A5400'; g.font = '900 62px Nunito, sans-serif'; g.fillText('?', 426, 132);
      // Label: white tag, green edge, holly in the corner.
      g.fillStyle = '#FFFFFF'; g.strokeStyle = '#17803F'; g.lineWidth = 9;
      roundRect(g, 48, 428, 416, 122, 28); g.fill(); g.stroke();
      g.fillStyle = '#C81E2A'; g.font = '900 50px Nunito, sans-serif'; g.fillText('KNOX KNOWS', W / 2, 478, 330); // squeezed to fit inside the label
      g.fillStyle = '#17803F'; g.font = '900 21px Nunito, sans-serif'; g.fillText('SERIES 1 · KNOX’S CHRISTMAS', W / 2, 524, 350);
      g.fillStyle = '#1FA45A'; g.strokeStyle = '#0F5E2E'; g.lineWidth = 3;
      for (const [x, y, rot] of [[50, 420, -.6], [74, 410, .3]]) { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
      g.fillStyle = '#E5383B'; for (const [x, y] of [[58, 424], [68, 428], [62, 433]]) { g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff'; g.font = '900 30px Nunito, sans-serif'; g.fillText('BLIND BAG', W / 2, H - 46);
    } else {
      g.fillStyle = '#FFFFFF'; g.font = '900 50px Nunito, sans-serif'; g.fillText('Collect all 12!', W / 2, 100);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '800 23px Nunito, sans-serif'; g.fillText('Who’s inside? Tear the top to find out.', W / 2, 146);
      // The 12 figures as silhouettes (Golden Knox is a gold "?").
      const imgs = await Promise.all(FIG_IDS.map(id => id === 'golden' ? null : loadImg(`/bags/knox-${id}.webp`)));
      const sil = document.createElement('canvas'); sil.width = sil.height = 92; const sg = sil.getContext('2d');
      FIG_IDS.forEach((id, i) => {
        const x = 106 + (i % 4) * 100, y = 236 + Math.floor(i / 4) * 112;
        g.fillStyle = id === 'golden' ? '#FFC800' : 'rgba(255,255,255,.16)'; g.strokeStyle = id === 'golden' ? '#B98500' : 'rgba(255,255,255,.45)'; g.lineWidth = 5;
        g.beginPath(); g.arc(x, y, 44, 0, Math.PI * 2); g.fill(); g.stroke();
        if (imgs[i]) { sg.clearRect(0, 0, 92, 92); sg.globalCompositeOperation = 'source-over'; sg.drawImage(imgs[i], 6, 4, 80, 80); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#7E0F18'; sg.fillRect(0, 0, 92, 92); g.drawImage(sil, x - 46, y - 46); }
        else { g.fillStyle = '#7A5400'; g.font = '900 44px Nunito, sans-serif'; g.fillText('?', x, y + 2); }
      });
      g.fillStyle = '#fff'; g.font = '900 32px Nunito, sans-serif'; g.fillText('KNOX KNOWS', W / 2, H - 46);
    }
    return c;
  }
  async function faceTexture(THREE, back) {
    const tex = new THREE.CanvasTexture(await faceCanvas(back));
    tex.anisotropy = 4;
    return tex;
  }
  // A flat picture of the pack for the bags screen and the Advent Calendar
  // (the same printed face, with gold crimped ends and a foil shine).
  let bagPic = null;
  function bagImage() {
    return bagPic || (bagPic = (async () => {
      const face = await faceCanvas(false), W = 300, H = 420, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
      const g = c.getContext('2d'); g.scale(2, 2);
      const band = top => {
        const y = top ? 12 : H - 40; g.fillStyle = '#E8A800'; g.fillRect(16, y, W - 32, 28);
        g.beginPath(); for (let x = 16; x < W - 16; x += 12) { const ty = top ? y : y + 28, d = top ? -8 : 8; g.moveTo(x, ty); g.lineTo(x + 6, ty + d); g.lineTo(x + 12, ty); } g.fill();
        g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 22; x < W - 18; x += 9) g.fillRect(x, y, 3, 28);
      };
      band(true); band(false);
      g.save(); roundRect(g, 18, 32, W - 36, H - 64, 18); g.clip(); g.drawImage(face, 18, 32, W - 36, H - 64);
      const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,.28)'); sh.addColorStop(.18, 'rgba(255,255,255,.12)'); sh.addColorStop(.32, 'rgba(255,255,255,0)'); sh.addColorStop(.8, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.3)');
      g.fillStyle = sh; g.fillRect(0, 0, W, H); g.restore();
      return c.toDataURL('image/webp', .9);
    })().catch(() => { bagPic = null; return ''; }));
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
  function crimp(THREE, top, segs = 48) {
    const geo = new THREE.PlaneGeometry(BW * .96, .2, segs, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const outer = top ? p.getY(i) > 0 : p.getY(i) < 0;
      if (outer && i % 2) p.setY(i, p.getY(i) + (top ? .045 : -.045)); // zigzag teeth
    }
    geo.computeVertexNormals();
    return geo;
  }
  function crimpTexture(THREE) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#E8A800'; g.fillRect(0, 0, 256, 32);
    g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 32);
    return new THREE.CanvasTexture(c);
  }
  // Soft round dot (particles), a light shaft (the rays) and a glow band (the opening).
  function canvasTex(THREE, w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
  const dotTex = THREE => canvasTex(THREE, 64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(.35, 'rgba(255,255,255,.85)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const glowTex = THREE => canvasTex(THREE, 128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, '#fff'); r.addColorStop(.3, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const rayTex = THREE => canvasTex(THREE, 32, 256, (g, w, h) => {
    const v = g.createLinearGradient(0, h, 0, 0); v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(.6, 'rgba(255,255,255,.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in'; const s = g.createLinearGradient(0, 0, w, 0); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(.5, '#000'); s.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = s; g.fillRect(0, 0, w, h);
  });
  const leakTex = THREE => canvasTex(THREE, 128, 64, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(.5, '#fff'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h); });

  // The light steps through these as it builds (white → blue → purple → red → gold)
  // and stops at the figure's rarity: the rarer, the longer it climbs.
  const STEP_COLORS = ['#FFFFFF', '#1CB0F6', '#CE82FF', '#FF4F57', '#FFC800'];
  const RARITY_STEP = { common: 1, rare: 2, epic: 3, secret: 4 };
  const SPEAKER = on => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/>${on ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/>' : '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'}</svg>`;
  const sfx = name => (...a) => { try { window.knoxSound?.fx?.[name]?.(...a); } catch (_) {} };
  const SFX = { crinkle: sfx('crinkle'), rip: sfx('rip'), step: sfx('step'), boom: sfx('boom'), fanfare: sfx('fanfare'), stamp: sfx('stamp'), whoosh: sfx('whoosh') };
  const buzz = p => { try { navigator.vibrate?.(p); } catch (_) {} };

  // ── The stage ───────────────────────────────────────────────────────────
  async function play({ result, onReveal, bagsLeft }) {
    window.knoxSound?.unlock?.(); // we're inside the "Open a bag" click: let sound start (if it's on)
    const THREE = await loadThree();
    const stage = document.createElement('div');
    stage.className = 'kb3-stage';
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true'); stage.setAttribute('aria-label', 'Open your blind bag');
    const scissors = window.KI ? window.KI('scissors', { tint: false }) : '✂';
    stage.innerHTML = `<div class="kb3-snow" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 37 + 5) % 100}%;--d:${7 + i % 6}s;--delay:-${(i * 1.3) % 8}s;--s:${4 + i % 4}px"></i>`).join('')}</div>
      <div class="kb3-spot" aria-hidden="true"></div>
      <canvas class="kb3-canvas"></canvas>
      <div class="kb3-tearline" aria-hidden="true"><span class="kb3-scissors">${scissors}</span></div>
      <div class="kb3-hint"><b>Hold and drag across the dotted line</b><span>Start from either side · mouse, trackpad or finger</span></div>
      <button type="button" class="kb3-tear-btn">${scissors}<span>Tear it open</span></button>
      <button type="button" class="kb3-sound" aria-pressed="false"></button>
      <button type="button" class="kb3-close" aria-label="Close">✕</button>
      <div class="kb3-flash" aria-hidden="true"></div><div class="kb3-ring" aria-hidden="true"></div>
      <div class="kb3-reveal" hidden></div>`;
    // The background is the app's own: in Christmas mode the same scene as the
    // home screen (lights, wreath, baubles, stocking, snowy hills, tree,
    // snowman, presents, snow; the moon and stars at night), on the app's colors.
    const root = document.documentElement, xmas = root.classList.contains('knox-christmas');
    stage.classList.toggle('is-light', root.getAttribute('data-theme') !== 'dark');
    if (xmas && window.knoxXmasScene) { stage.classList.add('is-xmas'); const sc = document.createElement('div'); sc.className = 'kb3-scene'; sc.setAttribute('aria-hidden', 'true'); stage.prepend(sc); }
    document.body.append(stage);
    if (stage.classList.contains('is-xmas')) window.knoxXmasScene(stage.querySelector('.kb3-scene'));
    // Sound: the same switch as Account & Plan → Sound effects (off until you turn it on).
    const soundBtn = stage.querySelector('.kb3-sound');
    const showSound = () => { const on = !!window.knoxSound?.on(); soundBtn.innerHTML = SPEAKER(on); soundBtn.setAttribute('aria-pressed', String(on)); soundBtn.setAttribute('aria-label', on ? 'Sound effects on' : 'Sound effects off'); soundBtn.title = on ? 'Sound on' : 'Sound off'; };
    soundBtn.hidden = !window.knoxSound; showSound();
    soundBtn.addEventListener('click', () => { window.knoxSound?.set(!window.knoxSound.on()); showSound(); });

    const canvas = stage.querySelector('.kb3-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 50), CAM_Y = -.2;
    camera.position.set(0, CAM_Y, 7.3);

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
    // The top strip peels from the side you start on and follows your drag.
    const stripGeo = crimp(THREE, true, 96), stripBase = stripGeo.attributes.position.array.slice();
    const topStrip = new THREE.Mesh(stripGeo, crimpMat.clone());
    const stripGroup = new THREE.Group(); stripGroup.position.y = BH / 2 + .08; stripGroup.add(topStrip); bag.add(stripGroup);
    // Light leaking out of the opening as it tears.
    const leakMat = new THREE.MeshBasicMaterial({ map: leakTex(THREE), color: 0xFFE2A8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const leak = new THREE.Mesh(new THREE.PlaneGeometry(1, .42), leakMat); leak.position.set(0, BH / 2 + .02, .08); bag.add(leak);
    const inside = new THREE.PointLight(0xffffff, 0, 4); inside.position.set(0, BH / 2 - .2, .5); bag.add(inside);
    scene.add(bag);

    // The burst: light shafts, a halo and a white-hot core above the opening.
    const fx = new THREE.Group(); scene.add(fx);
    const rayMat = new THREE.MeshBasicMaterial({ map: rayTex(THREE), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const rays = new THREE.Group(); fx.add(rays);
    for (let i = 0; i < 11; i++) {
      const g = new THREE.PlaneGeometry(.2, 2.8); g.translate(0, 1.4, 0);
      const m = new THREE.Mesh(g, rayMat); m.rotation.z = (i / 10 - .5) * 2; m.scale.y = .65 + ((i * 7) % 5) * .12; rays.add(m);
    }
    const haloMat = new THREE.SpriteMaterial({ map: glowTex(THREE), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Sprite(haloMat); fx.add(halo);
    const coreMat = new THREE.SpriteMaterial({ map: glowTex(THREE), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Sprite(coreMat); fx.add(core);

    // Particles: foil flecks while you tear, sparks while it charges, the burst.
    const PN = 260, pPos = new Float32Array(PN * 3).fill(-99), pCol = new Float32Array(PN * 3), pBase = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pDecay = new Float32Array(PN);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .09, map: dotTex(THREE), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    parts.frustumCulled = false; scene.add(parts);
    let pNext = 0; const pc = new THREE.Color(), lightBg = stage.classList.contains('is-light');
    function emit(n, at, speed, colors, decay = 1, spread = 1) {
      for (let k = 0; k < n; k++) {
        const i = pNext = (pNext + 1) % PN, j = i * 3, a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .65);
        pPos[j] = at.x + (Math.random() - .5) * .1 * spread; pPos[j + 1] = at.y; pPos[j + 2] = at.z;
        pVel[j] = Math.cos(a) * s * spread; pVel[j + 1] = (.5 + Math.random() * .9) * s * 1.25; pVel[j + 2] = Math.sin(a) * s * .5;
        pc.set(colors[(Math.random() * colors.length) | 0]); pBase[j] = pc.r; pBase[j + 1] = pc.g; pBase[j + 2] = pc.b;
        pLife[i] = 1; pDecay[i] = decay * (.7 + Math.random() * .6);
      }
    }
    function stepParticles(dt) {
      for (let i = 0; i < PN; i++) {
        const j = i * 3;
        if (pLife[i] <= 0) { pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; pPos[j + 1] = -99; continue; } // gone: off screen (no dark specks)
        pLife[i] -= dt * pDecay[i]; pVel[j + 1] -= 2.4 * dt;
        pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
        // Fade out toward the background: black on dark looks, white on light ones.
        const l = Math.max(0, pLife[i]), f = lightBg ? 1 - l : 0; pCol[j] = pBase[j] * l + f; pCol[j + 1] = pBase[j + 1] * l + f; pCol[j + 2] = pBase[j + 2] * l + f;
      }
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    }

    // The strip's peel: each bit lifts and curls toward you once the tear passes
    // it, starting from the side you started on (dir 1 = from the left).
    let peeled = -1;
    function peelStrip(front, d) {
      if (Math.abs(front - peeled) < .001) return; peeled = front;
      const p = stripGeo.attributes.position, half = BW * .48;
      for (let i = 0; i < p.count; i++) {
        const j = i * 3, x0 = stripBase[j], y0 = stripBase[j + 1], z0 = stripBase[j + 2];
        const s = d > 0 ? (x0 + half) / (2 * half) : (half - x0) / (2 * half);
        let a = (front * 1.15 - s) / .3; a = a < 0 ? 0 : a > 1 ? 1 : a;
        const e = a * a * (3 - 2 * a), th = e * 1.1, ry = y0 + .1; // hinge on the tear line
        p.setXYZ(i, x0 + d * e * .05, -.1 + ry * Math.cos(th) + e * .2, z0 + ry * Math.sin(th) + e * .14);
      }
      p.needsUpdate = true; stripGeo.computeVertexNormals();
    }

    // Size + tear line position (follows the bag's top on screen).
    const tearline = stage.querySelector('.kb3-tearline');
    function size() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Far enough that the bag fits the height (short screens) and stays under
      // ~56% of the width (phones), leaving room for the burst and the hint.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.z = Math.max(7.3 * Math.max(1, 820 / Math.max(500, h)), (BW / .56) / camera.aspect / (2 * tan));
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

    // Pointer: the bag tilts toward it. Hold (click, press the trackpad or touch)
    // on the dotted line and drag across: the tear starts on the side you start
    // from and follows you. Let go early and it settles back.
    let px = .5, py = .5, tear = 0, tearing = false, pressed = false, dir = 0, startX = 0, minX = 0, maxX = 0, lastCrinkle = 0;
    let torn = false, autoTear = 0, dropT = 0, t0 = performance.now();
    const band = line => Math.max(70, (line.x2 - line.x1) * .45);
    const setTear = v => { tear = v; stage.style.setProperty('--tear', v.toFixed(3)); if (v - lastCrinkle >= .09) { lastCrinkle = v; SFX.crinkle(); buzz(4); } };
    const onDown = e => {
      if (torn || dropT < 1 || autoTear) return;
      const line = placeTearline(), r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (Math.abs(y - line.y) > band(line) || x < line.x1 - 60 || x > line.x2 + 60) return;
      window.knoxSound?.unlock?.();
      pressed = tearing = true; dir = 0; startX = minX = maxX = x; lastCrinkle = 0; setTear(0);
      stage.classList.add('is-tearing'); stage.classList.remove('dir-left');
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const onMove = e => {
      const r = stage.getBoundingClientRect(), x = e.clientX - r.left;
      px = x / r.width; py = (e.clientY - r.top) / r.height;
      if (!pressed || !tearing || torn) return;
      const line = placeTearline();
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      if (!dir && Math.abs(x - startX) > 8) { dir = x > startX ? 1 : -1; stage.classList.toggle('dir-left', dir < 0); }
      if (!dir) return;
      const covered = dir > 0 ? maxX - startX : startX - minX;
      setTear(Math.max(tear, Math.min(1, covered / (Math.max(80, line.x2 - line.x1) * .7))));
      if (tear >= 1) rip();
    };
    const onUp = () => {
      if (!pressed) return; pressed = false;
      if (!torn && tear < 1) { tearing = false; dir = dir || 1; setTear(0); lastCrinkle = 0; stage.classList.remove('is-tearing'); }
    };
    canvas.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
    const tearBtn = stage.querySelector('.kb3-tear-btn');
    const startAutoTear = () => { if (torn || dropT < 1 || autoTear) return; window.knoxSound?.unlock?.(); autoTear = performance.now(); dir = 1; lastCrinkle = 0; tearing = true; stage.classList.add('is-tearing'); stage.classList.remove('dir-left'); };
    tearBtn.addEventListener('click', startAutoTear);
    // How many bags are left (when you have more than one).
    const leftEl = document.createElement('span'); leftEl.className = 'kb3-left'; leftEl.setAttribute('aria-live', 'polite'); stage.append(leftEl);
    const updateLeft = () => { const n = typeof bagsLeft === 'function' ? bagsLeft() : null; leftEl.hidden = !n || n === 1; leftEl.innerHTML = n ? `${window.KI ? window.KI('bag', { tint: false }) : ''}<b>${n === Infinity ? '∞' : n}</b> bag${n === 1 ? '' : 's'} to open` : ''; };
    updateLeft();
    stage.querySelector('.kb3-close').addEventListener('click', () => end('close'));
    const onKey = e => { if (e.key === 'Escape') end('close'); };
    addEventListener('keydown', onKey);

    // Tearing → the rip → the light climbs through the colors → the burst → the reveal.
    let picked = null, pickErr = null, ended = false;
    let rippedAt = 0, nextStepAt = 0, chargeStep = 0, pulseAt = 0, burstAt = 0, shakeAmp = 0, revealed = false;
    const chargeColor = new THREE.Color(0xffffff);
    const tmp = new THREE.Vector3();
    function setChargeColor(hex) {
      chargeColor.set(hex); haloMat.color.copy(chargeColor); rayMat.color.copy(chargeColor); inside.color.copy(chargeColor); leakMat.color.copy(chargeColor);
      stage.style.setProperty('--rc', hex);
    }
    function rip() {
      if (torn) return; torn = true; tearing = false; pressed = false;
      stage.classList.remove('is-tearing'); stage.classList.add('is-torn');
      rippedAt = performance.now(); nextStepAt = rippedAt + 480; setChargeColor('#FFFFFF');
      SFX.rip(); buzz(30);
      tmp.set(dir < 0 ? -BW / 2 : BW / 2, BH / 2 + .1, .1); bag.localToWorld(tmp);
      emit(40, tmp, 1.6, ['#FF8A3D', '#FFFFFF', '#FFC800', '#FF6B00'], 1.1);
      // Only now ask for the figure (the light holds white and the bag rattles until it's back).
      Promise.resolve().then(() => typeof result === 'function' ? result() : result).then(r => { picked = r; }, e => { pickErr = e; });
    }
    function burst(now) {
      burstAt = now; setChargeColor(RARITY_COLOR[picked.rarity] || '#FFFFFF');
      SFX.boom(); buzz([40, 30, 90]); shakeAmp = .2;
      stage.classList.add('is-burst');
      emit(190, fx.position, 3.4, [RARITY_COLOR[picked.rarity], '#FFFFFF', '#FFC800', RARITY_COLOR[picked.rarity]], .75, 1.6);
    }

    // The reveal: rays spin behind the figure as it pops out, confetti bursts,
    // NEW! stamps down, and the fanfare plays.
    function showReveal() {
      const r = stage.querySelector('.kb3-reveal'); r.hidden = false;
      r.className = 'kb3-reveal r-' + picked.rarity;
      const colors = picked.rarity === 'secret' ? ['#FFC800', '#FFE38A', '#FFFFFF', '#F2B705'] : ['#FF6B00', '#1CB0F6', '#58CC02', '#CE82FF', '#FFC800', '#FF4F57'];
      const confetti = Array.from({ length: 80 }, (_, i) => `<i style="--x:${(i * 53) % 100 - 50}vw;--y:${-(12 + (i * 29) % 34)}vh;--r:${(i * 97) % 900 - 450}deg;--c:${colors[i % colors.length]};--d:${1.7 + (i % 5) * .3}s;--delay:${(i % 6) * .03}s"></i>`).join('');
      const twinkles = Array.from({ length: 7 }, (_, i) => `<i style="--a:${i * 51}deg;--rad:${120 + (i % 3) * 26}px;--delay:${.5 + i * .17}s"></i>`).join('');
      const bulbs = ['#FF4F57', '#FFC800', '#1FA45A', '#1CB0F6', '#CE82FF'];
      const lights = `<svg class="kb3-lights" viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8 Q 62 52 125 8 T 250 8 T 375 8 T 500 8 T 625 8 T 750 8 T 875 8 T 1000 8"/>${Array.from({ length: 16 }, (_, i) => { const x = 31 + i * 62.5, y = 8 + 22 * Math.sin(((x % 125) / 125) * Math.PI); return `<circle cx="${x}" cy="${y + 10}" r="7" fill="${bulbs[i % 5]}" color="${bulbs[i % 5]}"/>`; }).join('')}</svg>`;
      const bokeh = `<div class="kb3-bokeh">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 61) % 100}%;--s:${18 + (i * 7) % 34}px;--c:${i % 3 ? 'var(--rc)' : '#FFC800'};--d:${7 + i % 5}s;--delay:-${(i * 1.7) % 7}s"></i>`).join('')}</div>`;
      const hills = `<svg class="kb3-hills" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 200 60 420 110 T 820 100 T 1200 90 V200 H0Z" fill="#C9D7E6"/><path d="M0 160 Q 300 110 600 150 T 1200 140 V200 H0Z" fill="#EEF4FA"/>${[[90, 118], [160, 128], [1040, 104], [1110, 112]].map(([x, y]) => `<path d="M${x} ${y - 46} l22 34 h-10 l16 24 h-56 l16 -24 h-10Z" fill="#1F7A45"/><rect x="${x - 4}" y="${y + 12}" width="8" height="10" fill="#6B3E1E"/>`).join('')}${[[230, 150, '#E5383B'], [262, 156, '#1CB0F6'], [930, 146, '#FFC800'], [962, 152, '#1FA45A']].map(([x, y, col]) => `<rect x="${x}" y="${y}" width="26" height="22" rx="3" fill="${col}"/><rect x="${x + 11}" y="${y}" width="4" height="22" fill="#fff"/><rect x="${x}" y="${y + 8}" width="26" height="4" fill="#fff"/>`).join('')}</svg>`;
      r.innerHTML = (window.KI?.fill || (x => x))(`<div class="kb3-celebrate" aria-hidden="true">${bokeh}${hills}${lights}</div><div class="kb3-confetti" aria-hidden="true">${confetti}</div>
        <div class="kb3-figwrap"><div class="kb3-rays" aria-hidden="true"></div><div class="kb3-twinkle" aria-hidden="true">${twinkles}</div><div class="kb3-fig">${picked.art}</div></div>
        <span class="kb3-tag ${picked.isNew ? 'new' : 'dup'}">${picked.isNew ? 'NEW!' : 'Duplicate'}</span>
        <span class="kb3-rarity">${RARITY_NAME[picked.rarity]}${picked.rarity === 'secret' ? ' · 1%' : ''}</span>
        <h2>${picked.name}</h2>
        <p>${picked.isNew ? (picked.rarity === 'secret' ? 'The secret figure! You found Golden Knox.' : 'Added to your collection.') : 'You already have this one. 3 duplicates trade in for a new bag.'}</p>
        <div class="kb3-actions">${picked.more ? '<button type="button" class="kb3-again">Open another</button>' : ''}<button type="button" class="kb3-done">${picked.more ? 'My collection' : 'Yay!'}</button></div>`);
      r.querySelector('.kb3-again')?.addEventListener('click', nextBag);
      r.querySelector('.kb3-done').addEventListener('click', () => end('done'));
      (r.querySelector('.kb3-again') || r.querySelector('.kb3-done')).focus({ preventScroll: true });
      SFX.fanfare(picked.rarity === 'secret');
      setTimeout(() => { if (!ended) { SFX.stamp(); buzz(20); } }, 760);
    }

    let raf = 0, last = performance.now(), vf = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
      if (pickErr) { end('error', pickErr); return; }
      // Drop in with a bounce, then float.
      dropT = Math.min(1, t / .9);
      const ease = 1 - Math.pow(1 - dropT, 3), bounce = dropT < 1 ? Math.sin(dropT * Math.PI) * .25 : 0;
      let by = (1 - ease) * 3.2 + bounce * .3 + Math.sin(t * 1.6) * .05, bx = 0, rz = Math.sin(t * 1.1) * .02, sc = 1;
      if (tearing) rz += (Math.random() - .5) * .025 * (1 + tear * 2);
      // "Tear it open": the same tear, from the left, on its own.
      if (autoTear && !torn) { setTear(Math.min(1, (now - autoTear) / 560)); if (tear >= 1) rip(); }
      vf += ((torn ? 1 : tear) - vf) * (torn ? .5 : .3);
      if (!rippedAt) peelStrip(vf, dir || 1);
      const lw = Math.max(.001, vf) * BW;
      leak.scale.x = lw; leak.position.x = (dir < 0 ? 1 : -1) * (BW / 2 - lw / 2);
      leakMat.opacity = Math.min(1, vf * 2.4) * (burstAt ? Math.max(0, 1 - (now - burstAt) / 250) : 1);
      inside.intensity = tearing ? vf * 1.6 : inside.intensity;

      if (rippedAt) {
        // The strip flies off the way you tore it.
        const r = (now - rippedAt) / 1000, f = Math.min(1, r / .75), d = dir || 1;
        stripGroup.position.set(d * f * 2.6, BH / 2 + .08 + f * 1.4 - f * f * .5, f * .7);
        stripGroup.rotation.set(-f * .9, 0, -d * f * 3.2);
        topStrip.material.opacity = 1 - f * f;
        if (!burstAt) {
          // Charge: hold white until the pick is back, then climb a color per beat.
          if (now >= nextStepAt) {
            const goal = picked ? (RARITY_STEP[picked.rarity] ?? 1) : -1;
            if (goal < 0) nextStepAt = now + 90;
            else if (chargeStep < goal) { chargeStep++; pulseAt = now; setChargeColor(STEP_COLORS[chargeStep]); SFX.step(chargeStep); buzz(14); shakeAmp = Math.max(shakeAmp, .03 + chargeStep * .012); nextStepAt = now + 560; }
            else burst(now);
          }
          const lvl = 1 + chargeStep, pulse = Math.max(0, 1 - (now - pulseAt) / 260);
          by += Math.min(.25, r * .22);
          bx += (Math.random() - .5) * .028 * lvl; rz += (Math.random() - .5) * .04 * lvl;
          sc = 1 + pulse * .04;
          inside.intensity = 1.4 + lvl * .8 + pulse * 2.5;
        } else {
          // Burst: everything flares out and the bag drops away.
          const b = (now - burstAt) / 1000, sink = Math.min(1, b / .65);
          by -= sink * sink * 7; sc = 1 - sink * .3; rz += sink * .7 * (dir || 1);
          inside.intensity = Math.max(0, 6 - b * 10);
          if (b > .16 && !revealed) { revealed = true; showReveal(); }
        }
      }
      bag.position.set(bx, by, 0); bag.scale.setScalar(sc);
      bag.rotation.y += ((px - .5) * .7 - bag.rotation.y) * .08;
      bag.rotation.x += ((py - .5) * .35 - bag.rotation.x) * .08;
      bag.rotation.z = rz;
      bag.updateMatrixWorld();
      sheen.position.set((px - .5) * 5, (.5 - py) * 4, 3);

      // Light above the opening (it stays put once it bursts).
      if (!burstAt) { tmp.set(0, BH / 2 + .05, .1); bag.localToWorld(tmp); fx.position.copy(tmp); }
      if (rippedAt && !burstAt) {
        const r = (now - rippedAt) / 1000, lvl = 1 + chargeStep, pulse = Math.max(0, 1 - (now - pulseAt) / 260);
        halo.scale.setScalar(1.1 + lvl * .38 + pulse * 1); haloMat.opacity = Math.min(.95, r * 2.2);
        core.scale.setScalar(.55 + lvl * .12 + pulse * .45); coreMat.opacity = Math.min(1, r * 2.6);
        rayMat.opacity = Math.min(.8, r * 1.3); rays.rotation.z = Math.sin(now / 420) * .12;
        rays.scale.set(1 + pulse * .3, .75 + lvl * .13 + pulse * .35, 1);
        if (Math.random() < .3 + lvl * .12) { tmp.set((Math.random() - .5) * BW * .8, BH / 2, .05); bag.localToWorld(tmp); emit(1, tmp, 1.3, ['#' + chargeColor.getHexString(), '#FFFFFF'], 1.3); }
      } else if (burstAt) {
        const b = (now - burstAt) / 1000;
        halo.scale.setScalar(3 + b * 10); haloMat.opacity = Math.max(0, 1 - b * 1.2);
        core.scale.setScalar(2 + b * 6); coreMat.opacity = Math.max(0, 1 - b * 1.8);
        rays.scale.setScalar(1.7 + b * 3.5); rayMat.opacity = Math.max(0, .9 - b * 1.3); rays.rotation.z += dt * 1.6;
      }
      // Foil flecks fly off the tear as it moves.
      if (tearing && vf > .02 && Math.random() < .55) { tmp.set((dir < 0 ? 1 : -1) * (BW / 2 - vf * BW), BH / 2 + .06, .12); bag.localToWorld(tmp); emit(1, tmp, .7, ['#FFC800', '#FFFFFF', '#FF8A3D'], 1.2, .6); }
      // Camera shake (the color beats and the burst).
      shakeAmp *= Math.pow(.015, dt);
      camera.position.x = (Math.random() - .5) * shakeAmp; camera.position.y = CAM_Y + (Math.random() - .5) * shakeAmp;
      stepParticles(dt);
      if (!torn) placeTearline();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    tearBtn.focus({ preventScroll: true });

    // "Open another": the figure flies up and away, and a fresh bag drops onto
    // the same stage (no fade to black between bags).
    let switching = false;
    function nextBag() {
      if (switching || ended) return; switching = true;
      const r = stage.querySelector('.kb3-reveal'); r.classList.add('is-out'); SFX.whoosh();
      setTimeout(() => {
        if (ended) return;
        r.hidden = true; r.className = 'kb3-reveal'; r.innerHTML = '';
        tear = 0; tearing = pressed = false; dir = 0; lastCrinkle = 0; torn = false; autoTear = 0; dropT = 0; t0 = performance.now();
        picked = pickErr = null; rippedAt = nextStepAt = chargeStep = pulseAt = burstAt = 0; shakeAmp = 0; revealed = false; vf = 0; peeled = -1;
        stripGroup.position.set(0, BH / 2 + .08, 0); stripGroup.rotation.set(0, 0, 0); topStrip.material.opacity = 1; peelStrip(0, 1);
        haloMat.opacity = coreMat.opacity = rayMat.opacity = leakMat.opacity = 0; inside.intensity = 0; bag.scale.setScalar(1);
        setChargeColor('#FFFFFF'); stage.style.setProperty('--tear', 0);
        stage.classList.remove('is-torn', 'is-burst', 'is-tearing', 'dir-left');
        updateLeft(); switching = false; tearBtn.focus({ preventScroll: true });
      }, 380);
    }
    function end(how, err) {
      if (ended) return; ended = true;
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('keydown', onKey);
      stage.classList.add('is-leaving');
      setTimeout(() => { renderer.dispose(); stage.remove(); }, 220);
      onReveal?.(how, err);
    }
  }
  window.knoxBagStage = { supported, play, bagImage, preload: () => supported() && loadThree().catch(() => {}) };
})();
