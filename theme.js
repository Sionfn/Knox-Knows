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
    { id: 'christmas', icon: '🎄', name: 'Christmas', note: 'Knox red & green, a tree and a little snow' },
    { id: 'christmas-night', icon: '⭐', name: 'Christmas night', note: 'Snow under the stars, glowing lights' },
  ];
  const current = () => root.classList.contains('knox-christmas') ? (root.getAttribute('data-theme') === 'dark' ? 'christmas-night' : 'christmas') : root.classList.contains('knox-seasonal') ? 'seasonal' : root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  window.knoxTheme = current;

  // Fall mode is offered September through November. After that it rests
  // until next year: anyone still on it goes back to Light (once, with a note).
  // December update: Fall is over, so Light and Dark only (anyone on Fall goes back to Light).
  const fallSeason = () => false;
  if (!fallSeason()) MODES.splice(MODES.findIndex(m => m.id === 'seasonal'), 1);
  // Christmas (christmas.css) is offered in December; the private preview and
  // local copies always offer it, and ?christmas=demo shows it any time.
  const christmasSeason = () => new Date().getMonth() === 11 || /preview|localhost|127\.0\.0\.1/.test(location.hostname) || /[?&]christmas=demo/.test(location.search);
  if (!christmasSeason()) MODES.splice(MODES.findIndex(m => m.id === 'christmas'), 2); // Christmas and Christmas night
  window.knoxSetTheme = function (mode) {
    if (!MODES.some(m => m.id === mode)) mode = 'light';
    // Pause color transitions while the look changes (see .knox-theme-switching)
    // so every element switches in the same frame.
    root.classList.add('knox-theme-switching');
    // Christmas is built on Light (christmas.css); Fall on Dark (seasonal.css).
    // Christmas night: Dark plus the Christmas look (christmas.css, .knox-xmas-night).
    if (mode === 'light' || mode === 'christmas') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    root.classList.toggle('knox-seasonal', mode === 'seasonal');
    root.classList.toggle('knox-christmas', mode === 'christmas' || mode === 'christmas-night');
    root.classList.toggle('knox-xmas-night', mode === 'christmas-night');
    if (mode === 'christmas' || mode === 'christmas-night') requestAnimationFrame(() => { christmasDecorate(); document.querySelectorAll('.xmas-lights-host').forEach(drawLights); });
    try { localStorage.setItem('knoxTheme', mode); } catch (e) { /* best effort */ }
    syncIcons();
    syncFavicon();
    syncMenu();
    void root.offsetHeight;
    setTimeout(() => root.classList.remove('knox-theme-switching'), 60);
  };

  // ── Appearance button icon shows the current look ───────────────────────
  const LEAF_ICON = '<svg id="darkModeIconLeaf" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>';
  const TREE_ICON = '<svg id="darkModeIconTree" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M12 2l4 6h-2.5l4 6H15l4 6H5l4-6H6.5l4-6H8z"/><path d="M12 20v2"/></svg>';
  function syncIcons() {
    const mode = current();
    const btn = document.getElementById('darkModeToggle');
    if (btn && !document.getElementById('darkModeIconLeaf')) btn.querySelector('svg:last-of-type')?.insertAdjacentHTML('afterend', LEAF_ICON);
    if (btn && !document.getElementById('darkModeIconTree')) btn.querySelector('svg:last-of-type')?.insertAdjacentHTML('afterend', TREE_ICON);
    const show = { darkModeIconSun: mode === 'light', darkModeIconMoon: mode === 'dark', darkModeIconLeaf: mode === 'seasonal', darkModeIconTree: mode === 'christmas' };
    // The button shows the same Knox icon as the Appearance menu (knox-icons.js):
    // the yellow sun, the purple moon, the Christmas gift, the fall leaf.
    const ki = window.KI && window.KI({ light: 'sun', dark: 'moon', seasonal: 'leaf', christmas: 'gift', 'christmas-night': 'star' }[mode]);
    let slot = document.getElementById('darkModeIconKnox');
    if (btn && ki) {
      if (!slot) { slot = document.createElement('span'); slot.id = 'darkModeIconKnox'; slot.className = 'theme-btn-icon'; slot.setAttribute('aria-hidden', 'true'); btn.prepend(slot); }
      slot.innerHTML = ki;
    }
    for (const [id, on] of Object.entries(show)) { const el = document.getElementById(id); if (el) el.style.display = on && !(btn && ki) ? '' : 'none'; }
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
    window.knoxModeBgMenu?.(menu); // the web app adds a Background section (mode-bg.js)
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
  // Original fall-theme maple leaves; scenery below stays unchanged.
  const LEAF = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="COLOR" d="M20 2l3.2 7.4 6.6-3.1-1.6 7.6 7.9.5-5.4 5.6 5.8 4.1-7.4 1.6 1.9 7.2-6.9-3.6L20 38l-3.1-8.7-6.9 3.6 1.9-7.2-7.4-1.6 5.8-4.1-5.4-5.6 7.9-.5-1.6-7.6 6.6 3.1z"/><path d="M20 12v26" stroke="rgba(0,0,0,.25)" stroke-width="1.4" fill="none"/></svg>';
  const COLORS = ['#B95732', '#DEAB4D', '#CD7440', '#E7B65E', '#C88C39', '#C36B3A', '#D9A34A'];
  const FEW_LEAVES = matchMedia('(max-width: 768px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  function leaves(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const x = ((i * 37 + 11) % 97) + '%';
      const size = 18 + ((i * 7) % 16);
      const dur = 11 + ((i * 5) % 9);
      const delay = -((i * 3.7) % dur).toFixed(1);
      const sway = 3 + ((i * 3) % 4);
      const rest = (8 + (i * 13) % 70) + '%';
      html += `<span class="fall-leaf" style="--x:${x};--s:${size}px;--d:${dur}s;--delay:${delay}s;--sway:${sway}s;--rest:${rest}"><svg viewBox="-36 -70 72 78" aria-hidden="true">${treeLeaf(0,0,0,1,COLORS[i % COLORS.length])}</svg></span>`;
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
      `<div class="fall-sky" aria-hidden="true"><div class="harvest-sun"></div>${leaves(FEW_LEAVES ? 4 : 10)}</div>` +
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
  // Browser tab icon: Knox's fall face while fall mode is on (legal-navigation.js does the same on the legal pages).
  function syncFavicon() {
    const fall = root.classList.contains('knox-seasonal');
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(l => {
      if (!l.dataset.normal) l.dataset.normal = l.getAttribute('href');
      const fallHref = l.rel === 'apple-touch-icon' ? '/apple-touch-icon-fall.png?v=5' : /16/.test(l.sizes?.value || '') ? '/favicon-fall-16.png?v=5' : '/favicon-fall-32.png?v=5';
      l.setAttribute('href', fall ? fallHref : l.dataset.normal);
    });
  }
  // ── Christmas decorations (christmas.css shows them only in Christmas) ──
  // Flat Knox shapes: a tree, presents, hanging ornaments and slow snow.
  const XMAS_TREE = '<svg class="xmas-tree" viewBox="0 0 150 190" aria-hidden="true" focusable="false"><rect x="64" y="160" width="22" height="26" rx="4" fill="#A5673A" stroke="#7A4A27" stroke-width="3"/><path d="M75 20 128 92H22Z" fill="#1FA45A" stroke="#157A41" stroke-width="4" stroke-linejoin="round"/><path d="M75 58 138 140H12Z" fill="#1FA45A" stroke="#157A41" stroke-width="4" stroke-linejoin="round"/><path d="M75 96 146 170H4Z" fill="#1FA45A" stroke="#157A41" stroke-width="4" stroke-linejoin="round"/><path d="M75 4l5 10 11 1-8 7 3 11-11-6-11 6 3-11-8-7 11-1Z" fill="#FFC800" stroke="#D9A300" stroke-width="2.5" stroke-linejoin="round"/><g stroke-width="2.5"><circle cx="58" cy="82" r="6" fill="#E5383B" stroke="#B3202A"/><circle cx="96" cy="122" r="6" fill="#FFC800" stroke="#D9A300"/><circle cx="46" cy="132" r="6" fill="#1CB0F6" stroke="#0A85C2"/><circle cx="106" cy="160" r="6" fill="#E5383B" stroke="#B3202A"/><circle cx="62" cy="160" r="6" fill="#FFC800" stroke="#D9A300"/><circle cx="88" cy="74" r="5" fill="#CE82FF" stroke="#7C3AED"/></g></svg>';
  const GIFT = (x, y, w, h, c, d, rib) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="5" fill="${c}" stroke="${d}" stroke-width="3"/><rect x="${w / 2 - 5}" width="10" height="${h}" fill="${rib}"/><rect y="${h / 2 - 5}" width="${w}" height="10" fill="${rib}" opacity=".9"/><path d="M${w / 2} 0c-6-10-18-10-16-2s16 2 16 2c6-10 18-10 16-2s-16 2-16 2" fill="${rib}" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
  // Big red present with a small gold one resting squarely on top, a green one beside them.
  const XMAS_GIFTS = '<svg class="xmas-gifts" viewBox="0 -14 170 134" aria-hidden="true" focusable="false">' + GIFT(6, 44, 76, 72, '#E5383B', '#B3202A', '#FFC800') + GIFT(20, 8, 48, 36, '#FFC800', '#D9A300', '#E5383B') + GIFT(92, 60, 64, 56, '#1FA45A', '#157A41', '#FFFFFF') + '</svg>';
  const BAUBLE = (x, len, r, c, d) => `<path d="M${x} 0v${len}" stroke="#C9B8B2" stroke-width="2"/><rect x="${x - 5}" y="${len - 2}" width="10" height="7" rx="2" fill="#FFC800" stroke="#D9A300" stroke-width="2"/><circle cx="${x}" cy="${len + 5 + r}" r="${r}" fill="${c}" stroke="${d}" stroke-width="3"/>`;
  const XMAS_BAUBLES = '<svg class="xmas-baubles" viewBox="0 0 150 120" aria-hidden="true" focusable="false">' + BAUBLE(14, 30, 11, '#E5383B', '#B3202A') + BAUBLE(46, 56, 14, '#1FA45A', '#157A41') + BAUBLE(78, 22, 10, '#FFC800', '#D9A300') + BAUBLE(108, 46, 12, '#1CB0F6', '#0A85C2') + BAUBLE(138, 28, 9, '#CE82FF', '#7C3AED') + '</svg>';
  // Falling snow over the whole page: six-armed flakes and soft dots in icy
  // blue and white, so they show on the light background.
  const FLAKE = c => `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="M9.2 3.8 12 6l2.8-2.2M9.2 20.2 12 18l2.8 2.2M3.6 10.4l3.4-.6-1.2-3.3M20.4 13.6l-3.4.6 1.2 3.3M3.6 13.6l3.4.6-1.2 3.3M20.4 10.4l-3.4-.6 1.2-3.3"/></g></svg>`;
  function snow(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const flake = i % 3 !== 2, size = flake ? 12 + (i * 7) % 14 : 6 + (i * 5) % 7;
      html += `<span class="xmas-flake${flake ? ' is-flake' : ''}" style="--x:${(i * 41 + 7) % 99}%;--s:${size}px;--d:${12 + (i * 7) % 14}s;--delay:-${((i * 4.3) % 24).toFixed(1)}s;--drift:${(i % 2 ? 1 : -1) * (14 + (i * 3) % 26)}px;--rest:${(4 + (i * 17) % 88)}%">${flake ? FLAKE(i % 2 ? '#8FC1E3' : '#B7D8EE') : ''}</span>`;
    }
    return html;
  }
  // String lights: a wire that droops between hooks, with each bulb's socket
  // sitting exactly on the wire. Drawn at the real width (no stretching) and
  // redrawn when the space changes size.
  const BULB_COLORS = [['#E5383B', '#B3202A'], ['#1FA45A', '#157A41'], ['#FFC800', '#D9A300'], ['#1CB0F6', '#0A85C2']];
  function lightsSvg(w, mini) {
    const top = mini ? 3 : 5, span = mini ? 110 : 210, sag = mini ? 9 : 20, bulbH = mini ? 15 : 24, per = mini ? 2 : 3;
    const n = Math.max(1, Math.round(w / span)), L = w / n;
    let wire = `M0 ${top}`, bulbs = '', k = 0;
    for (let i = 0; i < n; i++) {
      const x0 = i * L;
      wire += ` Q${(x0 + L / 2).toFixed(1)} ${top + 2 * sag} ${(x0 + L).toFixed(1)} ${top}`;
      for (let j = 1; j <= per; j++) {
        const t = j / (per + 1), x = x0 + L * t, y = top + 4 * sag * t * (1 - t), slope = Math.atan2(4 * sag * (1 - 2 * t), L) * 180 / Math.PI, [c, d] = BULB_COLORS[k++ % 4];
        const sc = bulbH / 30;
        bulbs += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(slope * .6).toFixed(1)}) scale(${sc.toFixed(2)})"><rect x="-4.5" y="-1" width="9" height="8" rx="2" fill="#4E6B57"/><path class="xb xb${k % 3}" d="M0 6c-8 4-9 17 0 24 9-7 8-20 0-24Z" fill="${c}" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
      }
    }
    const h = top + sag * 2 + bulbH + 4;
    return `<svg class="xmas-lights" viewBox="0 0 ${w.toFixed(0)} ${h}" width="${w.toFixed(0)}" height="${h}" aria-hidden="true" focusable="false"><path d="${wire}" fill="none" stroke="#4E6B57" stroke-width="${mini ? 2 : 3}" stroke-linecap="round"/>${bulbs}</svg>`;
  }
  const lightsSeen = new WeakMap();
  const lightsRO = 'ResizeObserver' in window ? new ResizeObserver(entries => entries.forEach(e => drawLights(e.target))) : null;
  function drawLights(el) {
    const w = Math.round(el.clientWidth);
    if (!w || lightsSeen.get(el) === w) return;
    lightsSeen.set(el, w);
    el.innerHTML = lightsSvg(w, el.classList.contains('xmas-lights-mini'));
  }
  function addLights(parent, mini) {
    if (parent.querySelector(':scope > .xmas-lights-host')) return;
    const el = document.createElement('div');
    el.className = 'xmas-lights-host' + (mini ? ' xmas-lights-mini' : '');
    el.setAttribute('aria-hidden', 'true');
    parent.appendChild(el);
    lightsRO?.observe(el);
    drawLights(el);
  }
  // Snowy hills along the bottom (stretch to any width) …
  const XMAS_HILLS = '<svg class="xmas-hills" viewBox="0 0 1200 170" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="xh-back" d="M0 62C160 14 300 24 450 56S760 104 900 64 1120 24 1200 44V170H0Z" fill="#E4EFF7"/><path class="xh-mid" d="M0 92C200 52 360 62 520 88S820 122 980 90 1140 68 1200 76V170H0Z" fill="#FFFFFF" stroke="#D3E4F0" stroke-width="3"/><path class="xh-front" d="M0 132C150 112 320 118 480 130S800 146 960 132 1130 118 1200 124V170H0Z" fill="#FFFFFF" stroke="#DCE9F3" stroke-width="2.5"/></svg>';
  // … with little pines, a snowman and Knox-colored presents standing on them.
  const PINE = (x, s, c = '#1FA45A', d = '#157A41') => `<g transform="translate(${x} 0) scale(${s})"><rect x="-6" y="78" width="12" height="14" rx="3" fill="#A5673A"/><path d="M0 0 26 36H-26Z M0 22 32 62H-32Z M0 44 38 84H-38Z" fill="${c}" stroke="${d}" stroke-width="3.5" stroke-linejoin="round"/><path d="M-12 18 0 12 12 18M-16 42 0 35 16 42M-20 66 0 58 20 66" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/></g>`;
  const XMAS_PINES = `<svg class="xmas-pines" viewBox="-40 -6 230 100" aria-hidden="true" focusable="false">${PINE(0, 1)}${PINE(78, .78, '#28B565', '#157A41')}${PINE(140, .6)}</svg>`;
  const XMAS_SNOWMAN = '<svg class="xmas-snowman" viewBox="0 -18 110 168" aria-hidden="true" focusable="false"><g fill="#FFFFFF" stroke="#D3E4F0" stroke-width="3.5"><circle cx="55" cy="112" r="34"/><circle cx="55" cy="66" r="24"/><circle cx="55" cy="32" r="18"/></g><rect x="38" y="4" width="34" height="8" rx="3" fill="#3C3C3C"/><rect x="43" y="-14" width="24" height="20" rx="3" fill="#3C3C3C"/><rect x="43" y="-2" width="24" height="5" fill="#E5383B"/><circle cx="48" cy="29" r="2.6" fill="#3C3C3C"/><circle cx="62" cy="29" r="2.6" fill="#3C3C3C"/><path d="M55 34l16 4-16 3Z" fill="#FF8A3D" stroke="#CC5500" stroke-width="1.5" stroke-linejoin="round"/><path d="M33 48c14 7 30 7 44 0l3 8c-16 8-34 8-50 0Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/><path d="M66 52l6 20 8-3-5-17" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/><g fill="#3C3C3C"><circle cx="55" cy="60" r="2.6"/><circle cx="55" cy="72" r="2.6"/><circle cx="55" cy="104" r="2.6"/></g><path d="M31 66 8 52M79 66l22-12" stroke="#8A5A2B" stroke-width="4" stroke-linecap="round"/></svg>';
  const SANTA_HAT = '<svg class="xmas-hat" viewBox="0 0 44 36" aria-hidden="true" focusable="false"><path d="M4 26C8 10 22 2 34 6l6 14-6 2C30 14 22 14 18 26Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/><rect x="2" y="24" width="24" height="9" rx="4.5" fill="#FFFFFF" stroke="#E6DCD8" stroke-width="2"/><circle cx="38" cy="22" r="5" fill="#FFFFFF" stroke="#E6DCD8" stroke-width="2"/></svg>';
  // A wreath (top left), candy canes and a stocking.
  const XMAS_WREATH = (() => { let leaves = ''; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = 60 + Math.cos(a) * 38, y = 60 + Math.sin(a) * 38; leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="15" ry="9" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${i % 2 ? '#1FA45A' : '#28B565'}" stroke="#157A41" stroke-width="2.5"/>`; } return `<svg class="xmas-wreath" viewBox="0 -44 120 194" aria-hidden="true" focusable="false"><path d="M60 -44v64" stroke="#C9B8B2" stroke-width="2"/>${leaves}<g stroke-width="2.5"><circle cx="30" cy="44" r="5.5" fill="#E5383B" stroke="#B3202A"/><circle cx="92" cy="52" r="5.5" fill="#FFC800" stroke="#D9A300"/><circle cx="40" cy="94" r="5.5" fill="#FFC800" stroke="#D9A300"/><circle cx="86" cy="92" r="5.5" fill="#E5383B" stroke="#B3202A"/><circle cx="60" cy="24" r="5" fill="#1CB0F6" stroke="#0A85C2"/></g><path d="M60 98c-14-12-30-8-24 4s24-4 24-4c14-12 30-8 24 4s-24-4-24-4Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/><path d="M54 100l-8 30 10-6 4 10 2-34M66 100l8 30-10-6-4 10-2-34" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/></svg>`; })();
  // White canes with red stripes (the stripes are short dashes along the cane).
  const CANE_PATH = 'M14 92V24a12 12 0 0 0-24 0v4';
  const CANE = (x, r) => `<g transform="translate(${x} 8) rotate(${r} 2 50)"><path d="${CANE_PATH}" fill="none" stroke="#CDB9B5" stroke-width="14" stroke-linecap="round"/><path d="${CANE_PATH}" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/><path d="${CANE_PATH}" fill="none" stroke="#E5383B" stroke-width="10" stroke-dasharray="5 6"/></g>`;
  const XMAS_CANES = `<svg class="xmas-canes" viewBox="-22 0 96 110" aria-hidden="true" focusable="false">${CANE(10, -8)}${CANE(42, 10)}</svg>`;
  const XMAS_STOCKING = '<svg class="xmas-stocking" viewBox="0 -40 70 150" aria-hidden="true" focusable="false"><path d="M35 -40v54" stroke="#C9B8B2" stroke-width="2"/><path d="M18 30h34v40c0 18-10 30-28 30H12c-8 0-10-12 0-16l6-4Z" fill="#E5383B" stroke="#B3202A" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="14" width="42" height="18" rx="6" fill="#FFFFFF" stroke="#E6DCD8" stroke-width="2.5"/><path d="M22 52h26M22 64h26" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><circle cx="38" cy="46" r="0"/></svg>';
  // Section snow falls the section's full height at the same speed everywhere,
  // and only moves while the section is on screen.
  function sizeSectionSnow(layer) { const h = layer.clientHeight; if (!h) return; layer.style.setProperty('--fall', h + 'px'); layer.style.setProperty('--dm', Math.max(1, h / 800).toFixed(2)); }
  const sectionSnowRO = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(e => sizeSectionSnow(e.target))) : null;
  const sectionSnowIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('xmas-run', e.isIntersecting))) : null;
  // Christmas night only (christmas.css): a moon and a few stars.
  const XMAS_NIGHT_SKY = '<div class="xmas-night-sky"><svg class="xmas-moon" viewBox="0 0 60 60" focusable="false"><path d="M34 7A23 23 0 1 0 53 38A18 18 0 1 1 34 7Z" fill="#FFF3C4" stroke="#E8D48A" stroke-width="3" stroke-linejoin="round"/></svg>' +
    Array.from({ length: 14 }, (_, i) => `<span class="xmas-star" style="left:${(i * 37 + 9) % 96}%;top:${8 + (i * 23) % 52}%;--s:${3 + i % 3}px"></span>`).join('') + '</div>';
  function christmasDecorate() {
    const host = document.getElementById('welcomeScreen') || document.getElementById('home');
    if (host && !host.querySelector(':scope > .xmas-deco')) {
      // Snow falls inside this space and scrolls with the page: behind the
      // app's welcome screen (never over a chat) and the landing hero.
      host.insertAdjacentHTML('afterbegin', `<div class="xmas-deco" aria-hidden="true">${XMAS_NIGHT_SKY}<div class="xmas-snow-local">${snow(FEW_LEAVES ? 16 : 30)}</div>${XMAS_WREATH}${XMAS_BAUBLES}${XMAS_STOCKING}<div class="xmas-ground">${XMAS_HILLS}${XMAS_PINES}${XMAS_TREE}${XMAS_CANES}${XMAS_SNOWMAN}${XMAS_GIFTS}</div></div>`);
      addLights(host.querySelector(':scope > .xmas-deco'), host.id !== 'welcomeScreen'); // a shorter string under the landing header
    }
    // The landing's last section: Knox in a Santa hat, snow and the snowy ground.
    const fin = document.querySelector('.kl-final');
    if (fin && !fin.querySelector(':scope > .xmas-deco')) {
      fin.insertAdjacentHTML('afterbegin', `<div class="xmas-deco" aria-hidden="true"><div class="xmas-snow-local">${snow(FEW_LEAVES ? 12 : 24)}</div><div class="xmas-ground">${XMAS_HILLS}${XMAS_PINES}${XMAS_TREE}${XMAS_CANES}${XMAS_SNOWMAN}${XMAS_GIFTS}</div></div>`);
      const img = fin.querySelector('.kl-wrap > img');
      if (img && !img.parentElement.classList.contains('xmas-hat-wrap')) { const w = document.createElement('span'); w.className = 'xmas-hat-wrap'; img.before(w); w.append(img); w.insertAdjacentHTML('afterbegin', SANTA_HAT); }
    }
    // Landing sections: snow falls in every one, so there's snow wherever you scroll.
    document.querySelectorAll('section.kl-section:not(#home):not(.kl-final)').forEach(sec => {
      if (sec.querySelector(':scope > .xmas-snow-sec')) return;
      sec.insertAdjacentHTML('afterbegin', `<div class="xmas-snow-sec" aria-hidden="true">${snow(FEW_LEAVES ? 12 : 26)}</div>`);
      const layer = sec.firstElementChild;
      sectionSnowRO?.observe(layer); sectionSnowIO?.observe(layer); sizeSectionSnow(layer);
    });
    // Landing sections: a snowy edge along the top of each one.
    document.querySelectorAll('section.kl-section:not(#home)').forEach(sec => { if (!sec.querySelector(':scope > .xmas-edge')) sec.insertAdjacentHTML('afterbegin', '<div class="xmas-edge" aria-hidden="true"></div>'); });
    // Shorter lights under the sidebar logo and the landing header.
    document.querySelectorAll('.sidebar-top').forEach(el => addLights(el, true));
    document.querySelectorAll('.sidebar-logo-link, .header-logo').forEach(a => { if (!a.querySelector('.xmas-hat')) a.insertAdjacentHTML('afterbegin', SANTA_HAT); });
  }
  // "Christmas mode is here" tip (app welcome screen, December, dismissible).
  function christmasTip() {
    const ws = document.getElementById('welcomeScreen'), badge = ws?.querySelector('.welcome-badge');
    if (!badge || ws.querySelector('.fall-tip') || current().startsWith('christmas')) return;
    try { if (localStorage.getItem('knoxChristmasTip') === 'hidden') return; } catch (e) {}
    const el = document.createElement('div');
    el.className = 'fall-tip';
    el.setAttribute('role', 'note');
    el.innerHTML = '<span aria-hidden="true">🎄</span><span class="ft-text">Christmas mode is here! Red, green and a little snow.</span><button type="button" class="ft-btn">Try it</button><button type="button" class="ft-x" aria-label="Hide this tip" title="Hide">×</button>';
    const hide = () => { el.remove(); try { localStorage.setItem('knoxChristmasTip', 'hidden'); } catch (e) {} };
    el.querySelector('.ft-btn').addEventListener('click', () => { window.knoxSetTheme('christmas'); hide(); });
    el.querySelector('.ft-x').addEventListener('click', hide);
    badge.before(el);
  }
  // After December, anyone still on Christmas goes back to Light.
  function christmasResting() {
    let saved = null; try { saved = localStorage.getItem('knoxTheme'); } catch (e) {}
    if ((saved === 'christmas' || saved === 'christmas-night') && !christmasSeason()) window.knoxSetTheme(saved === 'christmas-night' ? 'dark' : 'light');
  }
  function ready() { fallResting(); christmasResting(); syncIcons(); syncFavicon(); decorate(); arrangeHarvest(); christmasDecorate(); if (fallSeason()) tip(); else if (christmasSeason()) christmasTip(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
