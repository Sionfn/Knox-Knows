// sidebar-tools.js — pick which 4 tools show in the web app's sidebar.
// Tools: Ask Knox, Learn, Flashcards, Calculator, Simulations (the last two
// buttons are added by flashcards.js and notes.js). "Your tools · Edit" sits
// above them; the choice is saved on this device:
//   localStorage 'knoxSidebarTools.v1' = ['chat', 'learn', 'cards', 'calc']
(function () {
  const KEY = 'knoxSidebarTools.v1', MAX = 4;
  const TOOLS = [
    ['chat', 'Ask Knox', '[data-nav="chat"], [data-mobile-nav="chat"]'],
    ['learn', 'Learn', '[data-nav="learn"], [data-mobile-nav="learn"]'],
    ['cards', 'Flashcards', '.fc-nav'],
    ['calc', 'Calculator', '[data-nav="calculator"], [data-mobile-nav="calculator"]'],
    ['sims', 'Simulations', '.sims-nav'],
  ];
  const DEFAULT = ['chat', 'learn', 'cards', 'calc'];
  const chosen = () => {
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) { const ok = v.filter(k => TOOLS.some(t => t[0] === k)).slice(0, MAX); if (ok.length) return ok; } } catch (_) {}
    return DEFAULT.slice();
  };
  const navs = () => [...document.querySelectorAll('.sidebar-quicknav')];

  function apply() {
    const pick = chosen();
    navs().forEach(nav => {
      if (!nav.querySelector(':scope > .sq-head')) {
        nav.insertAdjacentHTML('afterbegin', '<div class="sq-head"><span>Your tools</span><button type="button" class="sq-edit" aria-haspopup="dialog">Edit</button></div>');
      }
      const order = [nav.querySelector(':scope > .sq-head')];
      TOOLS.forEach(([k, , sel]) => {
        const b = nav.querySelector(':scope > ' + sel.split(', ').join(', :scope > '));
        if (!b) return;
        b.classList.toggle('sq-off', !pick.includes(k));
        order.push(b);
      });
      // Keep them in one order (only move what's out of place, so this doesn't loop).
      const kids = [...nav.children].filter(c => order.includes(c));
      if (kids.some((c, i) => c !== order[i])) order.forEach(c => nav.appendChild(c));
    });
  }

  // ── The picker ──
  let pop = null, anchor = null;
  function render() {
    const pick = chosen(), full = pick.length >= MAX;
    const nav = navs()[0];
    pop.innerHTML = '<div class="st-title">Your sidebar</div><p class="st-sub">Pick the ' + MAX + ' tools you want to see.</p>' +
      TOOLS.map(([k, name, sel]) => {
        const on = pick.includes(k), btn = nav && nav.querySelector(sel.split(', ')[0]);
        const icon = btn && btn.querySelector('.sq-icon') ? btn.querySelector('.sq-icon').outerHTML : '';
        return '<button type="button" class="st-row' + (k === 'sims' ? ' st-mega' : '') + '" data-tool="' + k + '" aria-pressed="' + on + '"' + (!on && full ? ' aria-disabled="true"' : '') + '>' +
          icon + '<span class="st-name">' + name + (k === 'sims' ? ' <small>💎 Mega</small>' : '') + '</span><span class="st-check" aria-hidden="true">' + (on ? '✓' : '') + '</span></button>';
      }).join('') +
      '<p class="st-note">' + (full ? 'To add another, take one off first.' : 'You can show up to ' + MAX + '.') + '</p>';
  }
  function open(btn) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'st-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose your sidebar tools');
      pop.addEventListener('click', e => {
        const r = e.target.closest('[data-tool]'); if (!r) return;
        let pick = chosen(); const k = r.dataset.tool;
        if (pick.includes(k)) { if (pick.length > 1) pick = pick.filter(x => x !== k); }
        else if (pick.length < MAX) pick = TOOLS.map(t => t[0]).filter(x => x === k || pick.includes(x));
        else return;
        try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch (_) {}
        apply(); render();
      });
      document.body.append(pop);
    }
    anchor = btn; render(); pop.hidden = false;
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.min(Math.max(8, r.left - 8), innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8) + 'px';
  }
  const close = () => { if (pop) pop.hidden = true; };
  document.addEventListener('click', e => {
    const edit = e.target.closest('.sq-edit');
    if (edit) { e.preventDefault(); if (pop && !pop.hidden && anchor === edit) close(); else open(edit); return; }
    if (pop && !pop.hidden && !pop.contains(e.target)) close();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('resize', close);

  // The Flashcards and Simulations buttons arrive a moment later.
  navs().forEach(nav => new MutationObserver(apply).observe(nav, { childList: true }));
  apply();
})();
