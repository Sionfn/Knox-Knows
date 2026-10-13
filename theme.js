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
  const LEAF = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="COLOR" d="M20 2l3.2 7.4 6.6-3.1-1.6 7.6 7.9.5-5.4 5.6 5.8 4.1-7.4 1.6 1.9 7.2-6.9-3.6L20 38l-3.1-8.7-6.9 3.6 1.9-7.2-7.4-1.6 5.8-4.1-5.4-5.6 7.9-.5-1.6-7.6 6.6 3.1z"/><path d="M20 12v26" stroke="rgba(0,0,0,.25)" stroke-width="1.4" fill="none"/></svg>';
  const COLORS = ['#E8620C', '#C0392B', '#F2A900', '#D35400', '#A0522D', '#E67E22', '#B03A2E', '#F5B041'];
  function leaves(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const x = ((i * 37 + 11) % 97) + '%';
      const size = 18 + ((i * 7) % 16);
      const dur = 11 + ((i * 5) % 9);
      const delay = -((i * 3.7) % dur).toFixed(1);
      const sway = 3 + ((i * 3) % 4);
      const rest = (8 + (i * 13) % 70) + '%';
      html += `<span class="fall-leaf" style="--x:${x};--s:${size}px;--d:${dur}s;--delay:${delay}s;--sway:${sway}s;--rest:${rest}">${LEAF.replace('COLOR', COLORS[i % COLORS.length])}</span>`;
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
      <g transform="translate(130 92) rotate(-25) scale(.55)">${LEAF.replace('COLOR', '#C0392B').replace(/<\/?svg[^>]*>/g, '')}</g>
      <g transform="translate(70 96) rotate(35) scale(.45)">${LEAF.replace('COLOR', '#F2A900').replace(/<\/?svg[^>]*>/g, '')}</g>
    </svg>`;
  function decorate() {
    const host = document.getElementById('welcomeScreen') || document.getElementById('home');
    if (!host || host.querySelector(':scope > .fall-sky')) return;
    host.insertAdjacentHTML('afterbegin',
      `<div class="fall-sky" aria-hidden="true"><div class="harvest-sun"></div>${leaves(10)}</div>` +
      `<svg class="harvest-bough" viewBox="0 0 340 250" aria-hidden="true" focusable="false"><g fill="none" stroke="#795336" stroke-linecap="round"><path d="M-20 12Q130 5 270 190M123 58Q210 40 306 100" stroke-width="5"/><path d="M42 19Q55 25 60 36M106 44L96 39M135 63L122 60M229 142Q213 132 204 122M208 61L211 66M275 84L261 91" stroke-width="3"/></g><g fill="#B84F28"><path d="M60 36Q8 39 16 96Q68 93 60 36Z"/><path d="M122 60Q76 89 111 137Q152 107 122 60Z"/><path d="M204 122Q149 119 153 172Q206 178 204 122Z"/></g><g fill="#D99732"><path d="M96 39Q116 -12 167 14Q147 62 96 39Z"/><path d="M211 66Q231 20 274 46Q257 87 211 66Z"/><path d="M261 91Q296 72 318 118Q272 135 261 91Z"/></g></svg>` +
      HARVEST.replace('SIDE', 'left') + HARVEST.replace('SIDE', 'right') +
      `<svg class="harvest-wheat" viewBox="0 0 120 190" aria-hidden="true" focusable="false"><g fill="none" stroke="#C99543" stroke-width="3" stroke-linecap="round"><path d="M60 190L56 24M60 190L20 61M60 190L100 51"/></g><g fill="#D8AD60"><ellipse cx="47" cy="43" rx="7" ry="16" transform="rotate(-30 47 43)"/><ellipse cx="65" cy="57" rx="7" ry="16" transform="rotate(30 65 57)"/><ellipse cx="47" cy="77" rx="7" ry="16" transform="rotate(-30 47 77)"/><ellipse cx="65" cy="92" rx="7" ry="16" transform="rotate(30 65 92)"/><ellipse cx="17" cy="79" rx="7" ry="16" transform="rotate(-35 17 79)"/><ellipse cx="32" cy="104" rx="7" ry="16" transform="rotate(10 32 104)"/><ellipse cx="99" cy="74" rx="7" ry="16" transform="rotate(30 99 74)"/><ellipse cx="84" cy="101" rx="7" ry="16" transform="rotate(-10 84 101)"/></g></svg>`);
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

  function ready() { syncIcons(); decorate(); tip(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
