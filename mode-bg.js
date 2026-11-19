// mode-bg.js — a background for each part of the web app, picked in the
// Appearance menu (theme.js calls window.knoxModeBgMenu(menu) when it opens).
// Ask Knox and Learn have two: the home screen and the chat with Knox.
// Saved on this device, for Light and Dark separately:
//   localStorage 'knoxModeBg.v1' = { light: { ask: { home, chat }, learn: { home, chat }, cards, calc, sims }, dark: { … } }
//   (an older plain string for ask/learn means the same look on both screens)
//   plus { custom: { 'light|ask|home': { color } } } for Mega Knox's own color;
//   Mega's own photos live in IndexedDB ('knoxModeBg' › 'photos', same key).
// mode-bg.css paints body[data-mb] behind whatever is showing.
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
      if (c.photo) {
        photos.url(key).then(u => {
          if (ticket !== applyTicket) return;
          if (u) { b.style.setProperty('--mb-photo', 'url("' + u + '")'); b.dataset.mb = 'photo'; } else b.dataset.mb = 'custom';
        });
        if (b.dataset.mb !== 'photo') b.dataset.mb = 'custom';
      } else b.dataset.mb = 'custom';
    } else if (b.dataset.mb !== k) b.dataset.mb = k;
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
      '</div>' + customRow(t, p, s, cur === 'custom') +
      '<p class="ktm-note">Saved for ' + (t === 'dark' ? 'Dark' : 'Light') + ' mode. Each part keeps its own.</p>';
  }
  function renderLocked() {
    render();
    const row = section.querySelector('.ktm-custom');
    if (row && !section.querySelector('.ktm-lock')) row.insertAdjacentHTML('afterend', '<div class="ktm-lock">Custom backgrounds come with Mega Knox.<button type="button" class="ktm-see-mega">See Mega Knox</button></div>');
  }
  function customRow(t, p, s, on) {
    const c = customOf(slot(t, p, s));
    let html = '<button type="button" class="ktm-custom" aria-pressed="' + on + '"><span class="ktm-custom-art" aria-hidden="true" style="--mb-hex:' + c.color + '"></span><span><b>Custom</b><small>Your own color or photo</small></span><span class="ktm-mega" aria-hidden="true">💎 Mega</span></button>';
    if (!on) return html;
    if (!mega()) return html + '<div class="ktm-lock">Custom backgrounds come with Mega Knox.<button type="button" class="ktm-see-mega">See Mega Knox</button></div>';
    return html + '<div class="ktm-custom-edit">' +
      '<label class="ktm-cbtn"><input type="color" class="ktm-color" value="' + c.color + '"> Pick a color</label>' +
      '<label class="ktm-cbtn"><input type="file" class="ktm-photo" accept="image/*" hidden>' + (c.photo ? 'Change photo' : 'Use a photo') + '</label>' +
      (c.photo ? '<button type="button" class="ktm-cbtn ktm-nophoto">Remove photo</button>' : '') + '</div>';
  }
  window.knoxModeBgMenu = function (menu) {
    if (!section) {
      section = document.createElement('div');
      section.className = 'ktm-bg';
      section.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.part) { pick.part = b.dataset.part; pick.screen = b.dataset.part === part() ? screen() : 'home'; render(); return; }
        if (b.dataset.screen) { pick.screen = b.dataset.screen; render(); return; }
        if (b.classList.contains('ktm-sw')) { save(theme(), pick.part, pick.screen, b.dataset.mb); apply(); return; }
        if (b.classList.contains('ktm-custom')) {
          if (mega()) { save(theme(), pick.part, pick.screen, 'custom'); apply(); }
          else { pick.customOpen = true; renderLocked(); }
          return;
        }
        if (b.classList.contains('ktm-see-mega')) { window.goToPricing?.(); return; }
        if (b.classList.contains('ktm-nophoto')) { const key = slot(theme(), pick.part, pick.screen); photos.del(key).finally(() => { saveCustom(key, { photo: false }); apply(); }); }
      });
      section.addEventListener('input', e => {
        if (!e.target.classList.contains('ktm-color')) return;
        const key = slot(theme(), pick.part, pick.screen);
        saveCustom(key, { color: e.target.value, photo: customOf(key).photo });
        document.body.style.setProperty('--mb-hex', e.target.value);
        const art = section.querySelector('.ktm-custom-art'); if (art) art.style.setProperty('--mb-hex', e.target.value);
      });
      section.addEventListener('change', e => {
        if (e.target.classList.contains('ktm-color')) { apply(); return; }
        if (!e.target.classList.contains('ktm-photo') || !e.target.files[0]) return;
        const key = slot(theme(), pick.part, pick.screen);
        shrink(e.target.files[0]).then(blob => photos.put(key, blob)).then(() => { saveCustom(key, { photo: true }); apply(); })
          .catch(() => { const n = section.querySelector('.ktm-note'); if (n) n.textContent = 'That photo couldn’t be used. Try a JPG or PNG.'; });
      });
      menu.append(section);
    }
    pick = { part: part(), screen: screen() };
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
