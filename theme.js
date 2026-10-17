// theme.js — Knox's three looks: Light, Dark and Fall (seasonal).
//
// The look for each page load is set before first paint by the small inline
// script in each page's <head> (localStorage 'knoxTheme': 'light' | 'dark' |
// 'seasonal'). This file adds:
//   • window.knoxSetTheme(mode) / window.knoxTheme()
//   • the Appearance picker (window.toggleDarkMode opens it — the existing
//     Appearance buttons call that name)
//   • the fall decorations (falling leaves, pumpkins) in the app's welcome
//     screen and the landing page hero; seasonal.css shows them only in Fall
//   • a small "Fall mode is here" tip on the app's welcome screen
(function () {
  const root = document.documentElement;
  const MODES = [
    { id: 'light',    icon: '☀️', name: 'Light', note: 'Knox’s classic look' },
    { id: 'dark',     icon: '🌙', name: 'Dark',  note: 'Easy on the eyes at night' },
    { id: 'seasonal', icon: '🍁', name: 'Fall harvest', note: 'Warm colors, autumn leaves & Thanksgiving' },
  ];
  const current = () => root.classList.contains('knox-seasonal') ? 'seasonal' : root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  window.knoxTheme = current;

  // Fall mode is offered September through November. After that it rests
  // until next year: anyone still on it goes back to Light (once, with a note).
  const fallSeason = () => { const m = new Date().getMonth(); return m >= 8 && m <= 10; };
  if (!fallSeason()) MODES.splice(MODES.findIndex(m => m.id === 'seasonal'), 1);
  window.knoxSetTheme = function (mode) {
    if (!MODES.some(m => m.id === mode)) mode = 'light';
    // Pause color transitions while the look changes (see .knox-theme-switching)
    // so every element switches in the same frame.
    root.classList.add('knox-theme-switching');
    if (mode === 'light') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    root.classList.toggle('knox-seasonal', mode === 'seasonal');
    try { localStorage.setItem('knoxTheme', mode); } catch (e) { /* best effort */ }
    syncIcons();
    syncMenu();
    void root.offsetHeight;
    setTimeout(() => root.classList.remove('knox-theme-switching'), 60);
  };

  // ── Appearance button icon shows the current look ───────────────────────
  const LEAF_ICON = '<svg id="darkModeIconLeaf" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>';
  function syncIcons() {
    const mode = current();
    const btn = document.getElementById('darkModeToggle');
    if (btn && !document.getElementById('darkModeIconLeaf')) btn.querySelector('svg:last-of-type')?.insertAdjacentHTML('afterend', LEAF_ICON);
    const show = { darkModeIconSun: mode === 'light', darkModeIconMoon: mode === 'dark', darkModeIconLeaf: mode === 'seasonal' };
    for (const [id, on] of Object.entries(show)) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }
    if (btn) {
      const name = MODES.find(m => m.id === mode).name;
      btn.title = `Appearance: ${name}`;
      btn.setAttribute('aria-label', `Appearance: ${name}. Change the look`);
      btn.setAttribute('aria-haspopup', 'menu');
    }
  }

  // ── The picker ──────────────────────────────────────────────────────────
  let menu = null, anchor = null;
  function buildMenu() {
    menu = document.createElement('div');
    menu.className = 'knox-theme-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Appearance');
    menu.hidden = true;
    menu.innerHTML = '<div class="ktm-title">Appearance</div>' + MODES.map(m =>
      `<button type="button" role="menuitemradio" data-mode="${m.id}"><span class="ktm-icon" aria-hidden="true">${m.icon}</span><span class="ktm-text">${m.name}<small>${m.note}</small></span><span class="ktm-check" aria-hidden="true">✓</span></button>`).join('');
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      window.knoxSetTheme(b.dataset.mode);
      closeMenu(true);
    });
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('[data-mode]')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      if (e.key === 'Tab') closeMenu(false);
    });
    document.body.append(menu);
  }
  function syncMenu() {
    menu?.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === current())));
  }
  function place() {
    if (!menu || menu.hidden || !anchor) return;
    const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight, gap = 8;
    let top = r.bottom + gap;
    if (top + h > innerHeight - 8 && r.top - gap - h > 8) top = r.top - gap - h; // no room below: open upward
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = left + 'px';
  }
  function openMenu(btn) {
    if (!menu) buildMenu();
    anchor = btn || document.getElementById('darkModeToggle');
    syncMenu();
    menu.hidden = false;
    anchor?.setAttribute('aria-expanded', 'true');
    place();
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-mode]')).focus({ preventScroll: true });
  }
  function closeMenu(refocus) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    if (refocus) anchor?.focus({ preventScroll: true });
  }
  // The Appearance buttons already call toggleDarkMode(): it now opens the picker.
  window.toggleDarkMode = function () {
    const btn = document.activeElement?.closest?.('#darkModeToggle, [onclick*="toggleDarkMode"]') || document.getElementById('darkModeToggle');
    if (menu && !menu.hidden) closeMenu(true); else openMenu(btn);
  };
  document.addEventListener('click', e => {
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target) || e.target.closest('#darkModeToggle, [onclick*="toggleDarkMode"]')) return;
    closeMenu(false);
  }, true);
  addEventListener('resize', place);
  addEventListener('scroll', place, true);

  // ── Fall decorations ────────────────────────────────────────────────────
  // Falling leaves are the same illustrated leaf as the tree (see treeLeaf).
  const LEAF = '<svg viewBox="-36 -70 72 78" aria-hidden="true"><path d="M0 0C-34-16-32-49 0-65C32-49 34-16 0 0Z" fill="COLOR"/><path d="M0 0C-34-16-32-49 0-65C-9-40-6-18 0 0Z" fill="#713B21" opacity=".12"/><path d="M0 5Q-5-28 0-59M-2-15-18-26M-3-28-19-40M-2-19 16-32M-3-33 16-45" fill="none" stroke="#764622" stroke-width="1.8" stroke-linecap="round" opacity=".6"/></svg>';
  const COLORS = ['#B95732', '#DEAB4D', '#CD7440', '#E7B65E', '#C88C39', '#C36B3A', '#D9A34A'];
  const FEW_LEAVES = matchMedia('(max-width: 768px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  function leaves(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      // Keep leaves to the left/right edges, clear of the headings and cards.
      const band = (i % 2) ? [76, 97] : [2, 23];
      const x = (band[0] + ((i * 29) % (band[1] - band[0]))) + '%';
      const size = 18 + ((i * 7) % 16);
      const dur = 11 + ((i * 5) % 9);
      const delay = -((i * 3.7) % dur).toFixed(1);
      const sway = 3 + ((i * 3) % 4);
      const rest = (8 + (i * 13) % 70) + '%';
      const drift = ((i * 17) % 70 - 30) + 'px'; // where the wind carries it on the way down
      html += `<span class="fall-leaf" style="--x:${x};--s:${size}px;--d:${dur}s;--delay:${delay}s;--sway:${sway}s;--rest:${rest};--drift:${drift}">${LEAF.replace('COLOR', COLORS[i % COLORS.length])}</span>`;
    }
    return html;
  }
  const PUMPKIN = (x, y, s, body, dark) => `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="22" cy="40" rx="20" ry="26" fill="${dark}"/><ellipse cx="58" cy="40" rx="20" ry="26" fill="${dark}"/>
      <ellipse cx="40" cy="40" rx="20" ry="28" fill="${body}"/>
      <path d="M40 13c-5 8-6 17-6 27s1 19 6 27M40 13c5 8 6 17 6 27s-1 19-6 27" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none"/>
      <path d="M38 14c0-6 1-10 5-13" stroke="#5B3A1A" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M43 9c8-6 16-4 19 1-7 3-13 3-19-1z" fill="#6B8E23"/></g>`;
  const HARVEST = `<svg class="fall-harvest SIDE" viewBox="0 0 200 110" aria-hidden="true" focusable="false">
      ${PUMPKIN(4, 30, 1.05, '#F07A1A', '#D9620B')}
      ${PUMPKIN(92, 52, .7, '#F2A93B', '#D98E1F')}
      <g transform="translate(152 76)"><ellipse cx="10" cy="16" rx="9" ry="11" fill="#A0622D"/><path d="M0 9c2-8 18-8 20 0z" fill="#6B4423"/><path d="M10 1v4" stroke="#4A2E14" stroke-width="2.5" stroke-linecap="round"/></g>
      <g transform="translate(176 86) rotate(20)"><ellipse cx="7" cy="12" rx="7" ry="9" fill="#8B5A2B"/><path d="M0 6c1-6 13-6 14 0z" fill="#5C3A1C"/></g>
    </svg>`;
  // One illustrated leaf recipe keeps every branch consistent: a shaded
  // half, central rib, fine side veins and a small attached stem.
  const treeLeaf = (x,y,angle,scale,color) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">
    <path d="M0 0C-34-16-32-49 0-65C32-49 34-16 0 0Z" fill="${color}"/>
    <path d="M0 0C-34-16-32-49 0-65C-9-40-6-18 0 0Z" fill="#713B21" opacity=".12"/>
    <path d="M0 5Q-5-28 0-59M-2-15-18-26M-3-28-19-40M-2-42-12-51M-2-19 16-32M-3-33 16-45M-1-46 9-54" fill="none" stroke="#764622" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>
    <path d="M7-52Q18-43 19-32" fill="none" stroke="#FFE1A1" stroke-width="2" stroke-linecap="round" opacity=".3"/>
  </g>`;
  function decorate() {
    const chat = document.getElementById('welcomeScreen') || document.getElementById('home');
    if (chat && !chat.querySelector('.harvest-turkey-track')) {
      chat.insertAdjacentHTML('beforeend', `<div class="harvest-turkey-track" aria-hidden="true"><svg class="harvest-turkey" viewBox="0 0 130 110" focusable="false"><ellipse cx="60" cy="101" rx="32" ry="4" fill="#795336" opacity=".12"/><g class="turkey-leg turkey-leg-back"><path d="M58 76v18l-12 5m12-5 10 5" fill="none" stroke="#C97837" stroke-width="5" stroke-linecap="round"/></g><g class="turkey-leg turkey-leg-front"><path d="M72 76v18l-12 5m12-5 10 5" fill="none" stroke="#D99732" stroke-width="5" stroke-linecap="round"/></g><g class="turkey-body"><g stroke="#FBF3E5" stroke-width="2"><ellipse cx="31" cy="48" rx="12" ry="28" fill="#B84F28" transform="rotate(-58 31 48)"/><ellipse cx="40" cy="36" rx="12" ry="29" fill="#D99732" transform="rotate(-30 40 36)"/><ellipse cx="56" cy="33" rx="12" ry="28" fill="#C97837"/><ellipse cx="71" cy="39" rx="11" ry="26" fill="#A5502A" transform="rotate(25 71 39)"/></g><ellipse cx="62" cy="65" rx="31" ry="23" fill="#89532E"/><path d="M45 59q29-14 32 11-20 15-32-11" fill="#C48745"/><path d="M80 62q-2-22 9-31" stroke="#89532E" stroke-width="17" fill="none" stroke-linecap="round"/><circle cx="95" cy="28" r="15" fill="#BA7141"/><path d="m108 27 15 6-15 5" fill="#E6AE43"/><path d="M108 38q5 15-3 15-6-3-2-14" fill="#B84F28"/><circle cx="100" cy="24" r="5" fill="#FFF9EF"/><circle cx="102" cy="24" r="2.5" fill="#382A20"/></g></svg></div>`);
    }
    const host = document.getElementById('welcomeScreen') || document.getElementById('home');
    if (!host || host.querySelector(':scope > .fall-sky')) return;
    host.insertAdjacentHTML('afterbegin',
      `<svg class="harvest-trunk" viewBox="0 0 70 700" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 0H29Q20 210 29 380T35 660L66 697H0Z" fill="#795336"/><path d="M7 0H15Q7 210 18 390T21 666L41 697H20Q5 610 8 470Z" fill="#A97C51"/><g fill="none" stroke="#62432D" stroke-width="2.5" stroke-linecap="round"><path d="M21 76l-5 85m3 89 5 70m-7 170 6 77m-7 46 9 70"/><ellipse cx="19" cy="422" rx="5" ry="16"/></g></svg>` +
      `<svg class="harvest-corn harvest-truck" viewBox="0 0 260 150" aria-hidden="true" focusable="false"><ellipse cx="130" cy="140" rx="112" ry="6" fill="#795336" opacity=".18"/><g stroke="#92612D" stroke-width="2" stroke-linejoin="round"><g transform="translate(34 15) rotate(-12 12 35)"><ellipse cx="12" cy="35" rx="10" ry="29" fill="#EDB843"/><path d="M8 12v44m8-44v44M3 23h18M2 34h20M3 45h18" fill="none" stroke="#CE922B"/><path d="M12 65Q-8 47-2 27Q8 39 12 65M12 65Q33 44 27 25Q17 39 12 65" fill="#829449" stroke="#64753A"/></g><g transform="translate(65 8) rotate(8 12 35)"><ellipse cx="12" cy="35" rx="10" ry="29" fill="#F4C653"/><path d="M8 12v44m8-44v44M3 23h18M2 34h20M3 45h18" fill="none" stroke="#CE922B"/><path d="M12 65Q-8 47-2 27Q8 39 12 65M12 65Q33 44 27 25Q17 39 12 65" fill="#8B9C50" stroke="#64753A"/></g><g transform="translate(96 20) rotate(24 12 35)"><ellipse cx="12" cy="35" rx="10" ry="29" fill="#EDB843"/><path d="M8 12v44m8-44v44M3 23h18M2 34h20M3 45h18" fill="none" stroke="#CE922B"/><path d="M12 65Q-8 47-2 27Q8 39 12 65M12 65Q33 44 27 25Q17 39 12 65" fill="#829449" stroke="#64753A"/></g></g><path d="M18 69h121v48H24a6 6 0 0 1-6-6Z" fill="#AD4D32" stroke="#793B2A" stroke-width="3"/><path d="M18 71h121M26 87h105M26 103h105" stroke="#D7854E" stroke-width="5"/><path d="M39 69v45m77-45v45" stroke="#793B2A" stroke-width="4"/><path d="M138 117V52q0-8 8-8h38q9 0 14 10l17 35 25 8q6 2 6 8v12Z" fill="#D87536" stroke="#9F4C29" stroke-width="3" stroke-linejoin="round"/><path d="M148 55h31q6 0 9 7l10 23h-50Z" fill="#C4E0DB" stroke="#9F4C29" stroke-width="3" stroke-linejoin="round"/><path d="m156 59 21 22" stroke="#ECF4E4" stroke-width="4" opacity=".8"/><path d="M145 92v20m7-18h10M21 118h224" stroke="#793B2A" stroke-width="3" stroke-linecap="round"/><rect x="234" y="98" width="12" height="10" rx="3" fill="#F8D674"/><rect x="236" y="115" width="17" height="7" rx="3" fill="#B8AA8A"/><g fill="#49392C" stroke="#332A23" stroke-width="3"><circle cx="57" cy="120" r="19"/><circle cx="204" cy="120" r="19"/></g><g fill="#D6C4A1" stroke="#9B825E" stroke-width="3"><circle cx="57" cy="120" r="9"/><circle cx="204" cy="120" r="9"/></g><path d="M167 105q8-11 16 0-8 11-16 0Z" fill="#F3C25D"/></svg>` +
      `<div class="fall-sky" aria-hidden="true"><div class="harvest-sun"></div>${leaves(FEW_LEAVES ? 7 : 14)}</div>` +
      `<svg class="harvest-bough" viewBox="0 0 340 250" aria-hidden="true" focusable="false"><g fill="none" stroke="#795336" stroke-linecap="round"><path d="M-20 12Q130 5 270 190M123 58Q210 40 306 100" stroke-width="6"/><path d="M42 19Q55 25 60 36M106 44L96 39M135 63L122 60M229 142Q213 132 204 122M208 61L211 66M275 84L261 91" stroke-width="3"/></g>${treeLeaf(60,36,205,.95,'#B95732')}${treeLeaf(122,60,185,1.05,'#CD7440')}${treeLeaf(204,122,215,.95,'#B95732')}${treeLeaf(96,39,65,1.05,'#DEAB4D')}${treeLeaf(211,66,65,.9,'#E7B65E')}${treeLeaf(261,91,115,.9,'#C88C39')}</svg>` +
      HARVEST.replace('SIDE', 'left') + HARVEST.replace('SIDE', 'right') +
      `<svg class="harvest-wheat" viewBox="0 0 120 190" aria-hidden="true" focusable="false"><g fill="none" stroke="#C99543" stroke-width="3" stroke-linecap="round"><path d="M60 190L56 24M60 190L20 61M60 190L100 51"/></g><g fill="#D8AD60"><ellipse cx="47" cy="43" rx="7" ry="16" transform="rotate(-30 47 43)"/><ellipse cx="65" cy="57" rx="7" ry="16" transform="rotate(30 65 57)"/><ellipse cx="47" cy="77" rx="7" ry="16" transform="rotate(-30 47 77)"/><ellipse cx="65" cy="92" rx="7" ry="16" transform="rotate(30 65 92)"/><ellipse cx="17" cy="79" rx="7" ry="16" transform="rotate(-35 17 79)"/><ellipse cx="32" cy="104" rx="7" ry="16" transform="rotate(10 32 104)"/><ellipse cx="99" cy="74" rx="7" ry="16" transform="rotate(30 99 74)"/><ellipse cx="84" cy="101" rx="7" ry="16" transform="rotate(-10 84 101)"/></g></svg>`);
  }

  // Keep harvest scenery after the content, including on short scrolling screens.
  function arrangeHarvest() {
    const host = document.getElementById('welcomeScreen') || document.getElementById('home');
    if (!host || host.querySelector('.harvest-footer')) return;
    const footer = document.createElement('div');
    footer.className = 'harvest-footer';
    footer.setAttribute('aria-hidden', 'true');
    host.querySelectorAll(':scope > .harvest-turkey-track, :scope > .harvest-corn, :scope > .fall-harvest').forEach(el => footer.appendChild(el));
    host.appendChild(footer);
    host.insertAdjacentHTML('afterbegin', `<svg class="harvest-tree-branches" viewBox="0 0 220 310" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#795336" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 281Q24 182 145 141M14 164Q39 105 116 76M15 92Q58 48 173 26" stroke-width="9"/>
        <path d="M49 211 65 174M89 163 105 188M101 83 127 52M57 114 61 85M119 39 141 63M146 141 175 116" stroke-width="3"/>
      </g>
      ${treeLeaf(65,174,12,.85,'#D9A34A')}
      ${treeLeaf(127,52,68,.8,'#E4B052')}
      ${treeLeaf(175,116,60,.74,'#D18D39')}
      ${treeLeaf(105,188,145,.78,'#B95732')}
      ${treeLeaf(61,85,-24,.85,'#C36B3A')}
      ${treeLeaf(141,63,118,.75,'#B95732')}
      ${treeLeaf(173,26,70,.7,'#D59944')}
    </svg>`);
  }

  // ── "Fall mode is here" tip (app welcome screen; dismissible) ──────────
  function tip() {
    const ws = document.getElementById('welcomeScreen'), badge = ws?.querySelector('.welcome-badge');
    if (!badge || ws.querySelector('.fall-tip')) return;
    try { if (localStorage.getItem('knoxFallTip') === 'hidden') return; } catch (e) {}
    const el = document.createElement('div');
    el.className = 'fall-tip';
    el.setAttribute('role', 'note');
    el.innerHTML = '<span aria-hidden="true">🍁</span><span class="ft-text">A fresh fall look. Make yourself at home.</span><button type="button" class="ft-btn">Try it</button><button type="button" class="ft-x" aria-label="Hide this tip" title="Hide">×</button>';
    el.querySelector('.ft-btn').addEventListener('click', () => window.knoxSetTheme('seasonal'));
    el.querySelector('.ft-x').addEventListener('click', () => { el.remove(); try { localStorage.setItem('knoxFallTip', 'hidden'); } catch (e) {} });
    badge.before(el);
  }

  function fallResting() {
    let saved = null; try { saved = localStorage.getItem('knoxTheme'); } catch (e) {}
    if (fallSeason() || saved !== 'seasonal') return;
    window.knoxSetTheme('light');
    const n = document.createElement('div');
    n.className = 'fall-tip fall-rest-note'; n.setAttribute('role', 'status');
    n.innerHTML = '<span class="ft-text">Fall mode is resting until next year. Back to Light for now.</span><button type="button" class="ft-x" aria-label="Close">×</button>';
    n.querySelector('.ft-x').addEventListener('click', () => n.remove());
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 7000);
  }
  function ready() { fallResting(); syncIcons(); decorate(); arrangeHarvest(); if (fallSeason()) tip(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
