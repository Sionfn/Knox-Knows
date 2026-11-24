// mode-bg.js — a background for each part of the web app, picked in the
// Appearance menu (theme.js calls window.knoxModeBgMenu(menu) when it opens).
// Ask Knox and Learn have two: the home screen and the chat with Knox.
// Saved on this device, for Light and Dark separately:
//   localStorage 'knoxModeBg.v1' = { light: { ask: { home, chat }, learn: { home, chat }, cards, calc, sims }, dark: { … } }
//   (an older plain string for ask/learn means the same look on both screens)
//   plus { custom: { 'light|ask|home': { color } } } for Mega Knox's own color;
//   Mega's own photos live in IndexedDB ('knoxModeBg' › 'photos', same key).
// mode-bg.css paints body[data-mb] behind whatever is showing.
// Stickers: Knox stickers and your flames placed on a background (any plan:
// Free 3, Knox Plus 6, Mega Knox 12 per background), saved per background in
// { stickers: { 'light|ask|home': [{ id, x, y, s }] } } (x, y in %, s in px).
(function () {
  const KEY = 'knoxModeBg.v1';
  const PARTS = [['ask', 'Ask Knox'], ['learn', 'Learn'], ['cards', 'Flashcards'], ['calc', 'Calculator'], ['sims', 'Simulations']];
  const TWO_SCREENS = { ask: true, learn: true };
  const LOOKS = {
    light: [['classic', 'Classic'], ['white', 'White'], ['orange', 'Orange'], ['purple', 'Purple'], ['green', 'Green'], ['blue', 'Blue'], ['yellow', 'Yellow'], ['red', 'Red']],
    dark:  [['classic', 'Classic'], ['dark', 'Dark'], ['orange', 'Ember'], ['purple', 'Galaxy'], ['green', 'Forest'], ['blue', 'Ocean'], ['yellow', 'Gold'], ['red', 'Berry']],
  };
  const $ = id => document.getElementById(id);
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
  const theme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  // What is on screen now.
  const part = () => {
    const c = document.body.classList;
    if ($('calcModal')?.classList.contains('open')) return 'calc';
    if (c.contains('knox-flashcards')) return 'cards';
    if (c.contains('knox-sims')) return 'sims';
    if (c.contains('knox-notes')) return 'cards';
    return c.contains('knox-learn-mode') ? 'learn' : 'ask';
  };
  const screen = () => { const ws = $('welcomeScreen'); return ws && ws.style.display === 'none' ? 'chat' : 'home'; };
  const valid = (t, k) => k === 'custom' || LOOKS[t].some(l => l[0] === k);
  const mega = () => document.body.classList.contains('knox-mega');
  const slot = (t, p, s) => t + '|' + p + '|' + (TWO_SCREENS[p] ? s : 'home');
  const customOf = key => Object.assign({ color: '#A560F2', photo: false }, (read().custom || {})[key]);
  function saveCustom(key, patch) {
    const all = read();
    all.custom = Object.assign({}, all.custom, { [key]: Object.assign(customOf(key), patch) });
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) {}
  }
  // Mega photos: kept in IndexedDB on this device (too big for localStorage).
  const photos = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('knoxModeBg', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => db().then(d => new Promise((res, rej) => { const tx = d.transaction('photos', mode); const req = fn(tx.objectStore('photos')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }));
    const urls = {};
    return {
      // Stored as bytes, not a Blob: Safari (private windows too) can't keep Blobs here.
      url: key => urls[key] ? Promise.resolve(urls[key]) : run('readonly', st => st.get(key)).then(v => v && v.data ? (urls[key] = URL.createObjectURL(new Blob([v.data], { type: v.type || 'image/jpeg' }))) : null).catch(() => null),
      put: (key, blob) => blob.arrayBuffer().then(data => run('readwrite', st => st.put({ type: blob.type, data }, key))).then(() => { if (urls[key]) URL.revokeObjectURL(urls[key]); delete urls[key]; }),
      del: key => run('readwrite', st => st.delete(key)).then(() => { if (urls[key]) URL.revokeObjectURL(urls[key]); delete urls[key]; }),
    };
  })();
  // A photo is shrunk to at most 1600px so it stays light.
  function shrink(file) {
    return createImageBitmap(file).then(img => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(res => c.toBlob(res, 'image/jpeg', 0.84));
    });
  }
  function lookFor(t, p, s) {
    const v = (read()[t] || {})[p];
    const k = v && typeof v === 'object' ? v[TWO_SCREENS[p] ? s : 'home'] : v;
    return valid(t, k) ? k : 'classic';
  }
  function save(t, p, s, k) {
    const all = read();
    const mine = Object.assign({}, all[t]);
    if (TWO_SCREENS[p]) {
      const old = mine[p];
      const both = old && typeof old === 'object' ? Object.assign({}, old) : { home: old || 'classic', chat: old || 'classic' };
      both[s] = k; mine[p] = both;
    } else mine[p] = k;
    all[t] = mine;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* still applies for this visit */ }
  }

  // ── Paint what's showing ──
  let applyTicket = 0;
  function apply() {
    const t = theme(), p = part(), sc = screen(), b = document.body;
    let k = lookFor(t, p, sc);
    if (k === 'custom' && !mega()) k = 'classic'; // Custom is a Mega Knox look
    const ticket = ++applyTicket;
    if (k === 'custom') {
      const key = slot(t, p, sc), c = customOf(key);
      b.style.setProperty('--mb-hex', c.color);
      // Each part's own color (Background, Big circle, Small circle), if picked.
      for (const [k2, v] of [['bg', '--mb-bg-x'], ['c1', '--mb-c1-x'], ['c2', '--mb-c2-x']]) { if (c[k2]) b.style.setProperty(v, c[k2]); else b.style.removeProperty(v); }
      if (c.photo) {
        photos.url(key).then(u => {
          if (ticket !== applyTicket) return;
          if (u) { b.style.setProperty('--mb-photo', 'url("' + u + '")'); b.dataset.mb = 'photo'; } else b.dataset.mb = 'custom';
        });
        if (b.dataset.mb !== 'photo') b.dataset.mb = 'custom';
      } else b.dataset.mb = 'custom';
    } else if (b.dataset.mb !== k) b.dataset.mb = k;
    paintStickers();
    render();
  }

  // ── The Background section of the Appearance menu ──
  let section = null, pick = null; // pick = { part, screen } being edited in the menu
  function render() {
    if (!section) return;
    const t = theme(), p = pick.part, s = pick.screen, cur = lookFor(t, p, s);
    const name = PARTS.find(x => x[0] === p)[1];
    section.innerHTML = '<div class="ktm-title">Background</div>' +
      '<div class="ktm-parts" role="group" aria-label="Part of Knox">' +
      PARTS.map(([id, n]) => '<button type="button" class="ktm-part" data-part="' + id + '" aria-pressed="' + (id === p) + '">' + n + '</button>').join('') + '</div>' +
      (TWO_SCREENS[p] ? '<div class="ktm-screens" role="group" aria-label="Screen">' +
        '<button type="button" data-screen="home" aria-pressed="' + (s === 'home') + '">Home screen</button>' +
        '<button type="button" data-screen="chat" aria-pressed="' + (s === 'chat') + '">Knox chat</button></div>' : '') +
      '<div class="ktm-swatches" role="group" aria-label="Background for ' + name + (TWO_SCREENS[p] ? (s === 'chat' ? ' chat' : ' home screen') : '') + '">' +
      LOOKS[t].map(([k, n]) => '<button type="button" class="ktm-sw" data-mb="' + k + '" aria-pressed="' + (k === cur) + '" title="' + n + '"><span class="ktm-sw-art" aria-hidden="true"></span>' + n + '</button>').join('') +
      '</div>' + customRow(t, p, s, cur === 'custom') + stickersRow(t, p, s, cur) +
      '<p class="ktm-note">Saved for ' + (t === 'dark' ? 'Dark' : 'Light') + ' mode. Each part keeps its own.</p>';
    window.knoxPlaceThemeMenu?.();
  }
  function renderLocked() {
    render();
    const row = section.querySelector('.ktm-custom');
    if (row && !section.querySelector('.ktm-lock')) row.insertAdjacentHTML('afterend', '<div class="ktm-lock">Custom backgrounds come with Mega Knox.<button type="button" class="ktm-see-mega">See Mega Knox</button></div>');
  }
  function customRow(t, p, s, on) {
    const c = customOf(slot(t, p, s));
    let html = '<button type="button" class="ktm-custom" aria-pressed="' + on + '"><span class="ktm-custom-art" aria-hidden="true" style="--mb-hex:' + c.color + '"></span><span><b>Custom</b><small>Your own colors or a photo</small></span><span class="ktm-mega" aria-hidden="true">💎 Mega</span></button>';
    if (!on) return html;
    if (!mega()) return html + '<div class="ktm-lock">Custom backgrounds come with Mega Knox.<button type="button" class="ktm-see-mega">See Mega Knox</button></div>';
    const cur = partColors(t, c), cp = pick.cpart || 'bg', val = cur[cp], hs = toHsl(val);
    const rows = t === 'dark' ? (cp === 'bg' ? [DEEP, BOLD] : [BOLD, SOFT]) : (cp === 'bg' ? [SOFT, BOLD] : [BOLD, SOFT]);
    const shadeOf = l => hex(hs.h, 85, l);
    return html + '<div class="ktm-custom-edit">' +
      '<div class="ktm-cprev" aria-hidden="true" style="--pv-bg:' + cur.bg + ';--pv-c1:' + cur.c1 + ';--pv-c2:' + cur.c2 + '"></div>' +
      '<div class="ktm-cparts" role="group" aria-label="What to color">' + CPARTS.map(([k, n]) => '<button type="button" data-cpart="' + k + '" aria-pressed="' + (k === cp) + '"><span class="ktm-cdot" style="--d:' + cur[k] + '"></span>' + n + '</button>').join('') + '</div>' +
      '<div class="ktm-cgrid" role="group" aria-label="Knox colors">' + rows.flat().map(h => '<button type="button" data-cpick="' + h + '" style="--s:' + h + '" aria-label="' + h + '" aria-pressed="' + (h.toLowerCase() === val.toLowerCase()) + '"></button>').join('') + '</div>' +
      '<div class="ktm-crange"><span>Any color</span>' +
        '<input type="range" class="ktm-hue" min="0" max="359" value="' + Math.round(hs.h) + '" aria-label="Color">' +
        '<input type="range" class="ktm-shade" min="0" max="100" value="' + Math.round(lToShade(hs.l)) + '" aria-label="Light to deep" style="--sh-light:' + shadeOf(96) + ';--sh-mid:' + shadeOf(58) + ';--sh-deep:' + shadeOf(16) + '"></div>' +
      '<div class="ktm-cphoto"><label class="ktm-cbtn"><input type="file" class="ktm-photo" accept="image/*" hidden>' + (c.photo ? 'Change photo' : 'Use a photo') + '</label>' +
      (c.photo ? '<button type="button" class="ktm-cbtn ktm-nophoto">Remove photo</button>' : '') + '</div></div>';
  }
  // ── Custom colors ──
  const CPARTS = [['bg', 'Background'], ['c1', 'Big circle'], ['c2', 'Small circle']];
  const SOFT = ['#FFFFFF', '#FFF8F0', '#FFF2E5', '#FFF0F0', '#FFEFF7', '#F8F2FF', '#EDF8FE', '#E9FBF7', '#F1FAEA', '#FFFAE8', '#F4EEE8', '#F2F2F2'];
  const BOLD = ['#FF6B00', '#FF4B4B', '#FF86C8', '#CE82FF', '#7C3AED', '#1CB0F6', '#2B6CE0', '#14B8A6', '#58CC02', '#FFC800', '#A0622D', '#3C3C3C'];
  const DEEP = ['#0D0D10', '#17100A', '#180C0F', '#1A0F17', '#120D1E', '#0A131C', '#0D1626', '#08161A', '#0C150D', '#16130A', '#15100C', '#000000'];
  const mixHex = (a, b, w) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v * w + y[i] * (1 - w)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  // The colors showing now: picked ones, or the ones made from an older single color.
  function partColors(t, c) {
    const base = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#A560F2';
    return t === 'dark'
      ? { bg: c.bg || mixHex(base, '#0D0D10', .09), c1: c.c1 || base, c2: c.c2 || base }
      : { bg: c.bg || mixHex(base, '#FFFFFF', .07), c1: c.c1 || mixHex(base, '#FFFFFF', .28), c2: c.c2 || mixHex(base, '#FFFFFF', .16) };
  }
  function toHsl(h) {
    let [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hu = 0;
    if (d) hu = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (hu * 60 + 360) % 360, l: l * 100 };
  }
  function hex(h, s, l) {
    s /= 100; l /= 100;
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    return ('#' + f(0) + f(8) + f(4)).toUpperCase();
  }
  // The shade slider: 0 = lightest (96%), 100 = deepest (6%).
  const shadeToL = v => 96 - v * .9, lToShade = l => Math.max(0, Math.min(100, (96 - l) / .9));
  function setPart(part, color, live) {
    const key = slot(theme(), pick.part, pick.screen);
    saveCustom(key, { [part]: color });
    if (live) {
      // While dragging: update the page and the editor's preview without a redraw.
      document.body.style.setProperty({ bg: '--mb-bg-x', c1: '--mb-c1-x', c2: '--mb-c2-x' }[part], color);
      const prev = section.querySelector('.ktm-cprev'); if (prev) prev.style.setProperty('--pv-' + part, color);
      const dot = section.querySelector('[data-cpart="' + part + '"] .ktm-cdot'); if (dot) dot.style.setProperty('--d', color);
      return;
    }
    apply();
  }
  // ── Stickers ──
  const FLAME_PATH = (o, i, e) => '<path d="M12 2c1 3.2 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.4 2.6-5.6.2 1.7 1 2.8 2.1 3.2C10.6 7.8 11 4.6 12 2Z" fill="' + o + '" stroke="' + e + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12.5c1.2 1.3 2.6 2.4 2.6 4.3a2.6 2.6 0 0 1-5.2 0c0-1.4.8-2.4 1.6-3 .1.6.4 1 .9 1.2.1-1 .1-1.7.1-2.5Z" fill="' + i + '"/>';
  const FLAME_COLORS = { classic: ['#FF7A1A', '#FFD23F', '#D9530B'], purple: ['#A855F7', '#E9C3FF', '#7C3AED'], blue: ['#2BA8F2', '#BDE8FF', '#0A78C2'], gold: ['#F2B705', '#FFF1A8', '#B98500'], slime: ['#58CC02', '#D7FFB0', '#3E8F00'], diamond: ['#7FE3FF', '#FFFFFF', '#1CB0F6'], galaxy: ['#8B4FFF', '#FF7AD9', '#3A1C8F'], frost: ['#BDE8FF', '#FFFFFF', '#5BA8D6'], ruby: ['#E5383B', '#FFB3B5', '#8A1F22'] };
  const ICON_STICKERS = ['star', 'heartRed', 'snowflake', 'tree', 'gift', 'crown', 'trophy', 'gem', 'coin', 'bolt', 'party', 'bag'];
  const STICKER_MAX = { free: 3, plus: 6, mega: 12 };
  const stkTier = () => mega() ? 'mega' : window.userTier === 'plus' ? 'plus' : 'free';
  const svgOf = id => {
    let svg = id.startsWith('flame:') ? (FLAME_COLORS[id.slice(6)] ? '<svg viewBox="0 0 24 24">' + FLAME_PATH(...FLAME_COLORS[id.slice(6)]) + '</svg>' : '') : (window.KI ? window.KI(id, { tint: false }) : '');
    return svg.replace(/<svg\b[^>]*viewBox="([^"]+)"[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="$1" width="96" height="96">');
  };
  const uriCache = {};
  const uriOf = id => uriCache[id] || (uriCache[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(id)));
  const stickersOf = key => { const v = (read().stickers || {})[key]; return Array.isArray(v) ? v.filter(x => x && typeof x.id === 'string').slice(0, 12) : []; };
  function saveStickers(key, list) { const all = read(); all.stickers = Object.assign({}, all.stickers, { [key]: list }); try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) {} }
  const ownedFlames = () => { const own = window.knoxFlameFest?.styles?.() || ['classic']; return Object.keys(FLAME_COLORS).filter(f => own.includes(f)); };
  // Paint the stickers for what's on screen (extra background layers; mode-bg.css).
  function paintStickers() {
    const list = stickersOf(slot(theme(), part(), screen())), b = document.body;
    if (!list.length) { b.style.removeProperty('--mb-stk'); return; }
    b.style.setProperty('--mb-stk', list.map(st => 'url("' + uriOf(st.id) + '") ' + st.x + '% ' + st.y + '% / ' + st.s + 'px ' + st.s + 'px no-repeat').join(', '));
  }
  function stickersRow(t, p, s, look) {
    const key = slot(t, p, s), list = stickersOf(key), max = STICKER_MAX[stkTier()], open = !!pick.stkOpen;
    let html = '<div class="ktm-stk"><button type="button" class="ktm-stk-toggle" aria-expanded="' + open + '">Stickers <small>' + list.length + ' of ' + max + '</small><span class="ktm-stk-arrow" aria-hidden="true">▾</span></button>';
    if (!open) return html + '</div>';
    const sel = pick.stkSel != null && list[pick.stkSel] ? pick.stkSel : null;
    html += '<div class="ktm-stk-prev" data-mb="' + (look === 'custom' || look === 'photo' ? 'classic' : look) + '" aria-label="Sticker preview: drag to move">' +
      list.map((st, i) => '<img src="' + uriOf(st.id) + '" alt="" data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '" style="left:' + st.x + '%;top:' + st.y + '%;width:' + Math.round(st.s / 3.2) + 'px">').join('') + '</div>' +
      '<div class="ktm-stk-tools"' + (sel == null ? ' hidden' : '') + '><button type="button" data-stk-tool="smaller">Smaller</button><button type="button" data-stk-tool="bigger">Bigger</button><button type="button" data-stk-tool="front">To front</button><button type="button" class="danger" data-stk-tool="remove">Remove</button></div>' +
      '<div class="ktm-stk-pick" role="group" aria-label="Add a sticker">' + [...ICON_STICKERS, ...ownedFlames().map(f => 'flame:' + f)].map(id => '<button type="button" data-stk-add="' + id + '" title="Add"' + (list.length >= max ? ' disabled' : '') + '><img src="' + uriOf(id) + '" alt=""></button>').join('') + '</div>' +
      '<small class="ktm-stk-hint">Tap one to add it, then drag it in the box. ' + (list.length >= max ? (stkTier() === 'mega' ? 'That’s the most for one background.' : 'That’s the most on your plan — ' + (stkTier() === 'free' ? '⚡ Knox Plus gets 6, 💎 Mega 12.' : '💎 Mega Knox gets 12.')) : 'Free 3 · ⚡ Plus 6 · 💎 Mega 12 per background. Earn more flames to get them as stickers.') + '</small>';
    return html + '</div>';
  }
  function addSticker(id) {
    const key = slot(theme(), pick.part, pick.screen), list = stickersOf(key);
    if (list.length >= STICKER_MAX[stkTier()]) return;
    list.push({ id, x: 20 + Math.round(Math.random() * 60), y: 20 + Math.round(Math.random() * 60), s: 96 });
    saveStickers(key, list); pick.stkSel = list.length - 1; paintStickers(); render();
  }
  function stickerTool(tool) {
    const key = slot(theme(), pick.part, pick.screen), list = stickersOf(key), i = pick.stkSel; if (i == null || !list[i]) return;
    if (tool === 'remove') { list.splice(i, 1); pick.stkSel = null; }
    else if (tool === 'front') { list.unshift(list.splice(i, 1)[0]); pick.stkSel = 0; } // the first layer is drawn on top
    else list[i].s = Math.min(220, Math.max(40, list[i].s + (tool === 'bigger' ? 24 : -24)));
    saveStickers(key, list); paintStickers(); render();
  }
  window.knoxModeBgMenu = function (menu) {
    if (!section) {
      section = document.createElement('div');
      section.className = 'ktm-bg';
      section.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('ktm-stk-toggle')) { pick.stkOpen = !pick.stkOpen; render(); return; }
        if (b.dataset.stkAdd) { addSticker(b.dataset.stkAdd); return; }
        if (b.dataset.stkTool) { stickerTool(b.dataset.stkTool); return; }
        if (b.dataset.part) { pick.part = b.dataset.part; pick.screen = b.dataset.part === part() ? screen() : 'home'; render(); return; }
        if (b.dataset.screen) { pick.screen = b.dataset.screen; render(); return; }
        if (b.classList.contains('ktm-sw')) { save(theme(), pick.part, pick.screen, b.dataset.mb); apply(); return; }
        if (b.classList.contains('ktm-custom')) {
          if (mega()) { save(theme(), pick.part, pick.screen, 'custom'); apply(); }
          else { pick.customOpen = true; renderLocked(); }
          return;
        }
        if (b.classList.contains('ktm-see-mega')) { window.goToPricing?.(); return; }
        if (b.dataset.cpart) { pick.cpart = b.dataset.cpart; render(); return; }
        if (b.dataset.cpick) { setPart(pick.cpart || 'bg', b.dataset.cpick); return; }
        if (b.classList.contains('ktm-nophoto')) { const key = slot(theme(), pick.part, pick.screen); photos.del(key).finally(() => { saveCustom(key, { photo: false }); apply(); }); }
      });
      // "Any color": the hue and the shade sliders make a color for the chosen part.
      const fromSliders = () => hex(+section.querySelector('.ktm-hue').value, 85, shadeToL(+section.querySelector('.ktm-shade').value));
      section.addEventListener('input', e => {
        if (!e.target.matches('.ktm-hue, .ktm-shade')) return;
        const color = fromSliders();
        setPart(pick.cpart || 'bg', color, true);
        if (e.target.classList.contains('ktm-hue')) { const sh = section.querySelector('.ktm-shade'), h = +e.target.value; sh.style.setProperty('--sh-light', hex(h, 85, 96)); sh.style.setProperty('--sh-mid', hex(h, 85, 58)); sh.style.setProperty('--sh-deep', hex(h, 85, 16)); }
      });
      section.addEventListener('change', e => {
        if (e.target.matches('.ktm-hue, .ktm-shade')) { apply(); return; }
        if (!e.target.classList.contains('ktm-photo') || !e.target.files[0]) return;
        const key = slot(theme(), pick.part, pick.screen);
        shrink(e.target.files[0]).then(blob => photos.put(key, blob)).then(() => { saveCustom(key, { photo: true }); apply(); })
          .catch(() => { const n = section.querySelector('.ktm-note'); if (n) n.textContent = 'That photo couldn’t be used. Try a JPG or PNG.'; });
      });
      // Drag a sticker around the little preview; the page follows live.
      section.addEventListener('pointerdown', e => {
        const img = e.target.closest('.ktm-stk-prev img'); if (!img) return;
        e.preventDefault();
        const box = img.parentElement, i = +img.dataset.i, key = slot(theme(), pick.part, pick.screen);
        pick.stkSel = i; section.querySelectorAll('.ktm-stk-prev img').forEach(x => x.classList.toggle('sel', +x.dataset.i === i));
        const tools = section.querySelector('.ktm-stk-tools'); if (tools) tools.hidden = false;
        const move = ev => {
          const r = box.getBoundingClientRect(), list = stickersOf(key), st = list[i]; if (!st) return;
          st.x = Math.round(Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)));
          st.y = Math.round(Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)));
          img.style.left = st.x + '%'; img.style.top = st.y + '%';
          saveStickers(key, list); paintStickers();
        };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
        addEventListener('pointermove', move); addEventListener('pointerup', up);
      });
      menu.append(section);
    }
    pick = { part: part(), screen: screen(), cpart: 'bg' };
    render();
  };

  // Repaint when the part, the screen or the look changes.
  const watch = (el, attrs) => el && new MutationObserver(apply).observe(el, { attributes: true, attributeFilter: attrs });
  watch(document.body, ['class']);
  watch(document.documentElement, ['data-theme', 'class']);
  watch($('welcomeScreen'), ['style']);
  watch($('calcModal'), ['class']);
  apply();
})();
