// sidebar-tools.js — pick which 4 tools show in the web app's sidebar.
// Tools, in this order: Ask Knox, Learn, Calculator, Flashcards, Simulations (the
// buttons are added by flashcards.js and notes.js). "Your tools · Edit" sits
// above them; the choice is saved on this device:
//   localStorage 'knoxSidebarTools.v1' = ['chat', 'learn', 'calc', 'cards']
// Under the 4 sits "··· More": it lists the hidden tools, opens one without
// changing your 4, and lights up in that tool's color while it's open.
// (More is not a .sidebar-quicknav-link on purpose: the Flashcards and
// Simulations panels close on any click of one of those.)
(function () {
  const KEY = 'knoxSidebarTools.v1', MAX = 4;
  const TOOLS = [
    ['chat', 'Ask Knox', '[data-nav="chat"], [data-mobile-nav="chat"]'],
    ['learn', 'Learn', '[data-nav="learn"], [data-mobile-nav="learn"]'],
    ['calc', 'Calculator', '[data-nav="calculator"], [data-mobile-nav="calculator"]'],
    ['cards', 'Flashcards', '.fc-nav'],
    ['sims', 'Simulations', '.sims-nav'],
  ];
  const DEFAULT = ['chat', 'learn', 'calc', 'cards'];
  const DOTS = '<span class="sq-icon sq-more-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>';
  const chosen = () => {
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) { const ok = v.filter(k => TOOLS.some(t => t[0] === k)).slice(0, MAX); if (ok.length) return ok; } } catch (_) {}
    return DEFAULT.slice();
  };
  const navs = () => [...document.querySelectorAll('.sidebar-quicknav')];
  const btnFor = (nav, sel) => nav && nav.querySelector(':scope > ' + sel.split(', ').join(', :scope > '));
  const usable = b => !!b && !b.classList.contains('fc-locked');
  const iconOf = b => (b && b.querySelector('.sq-icon') ? b.querySelector('.sq-icon').outerHTML : '');
  const mega = k => (k === 'sims' ? ' <small>💎 Mega</small>' : '');
  // The tools this nav is hiding that can actually be opened right now.
  const hiddenIn = nav => { const pick = chosen(); return TOOLS.filter(([k, , sel]) => !pick.includes(k) && usable(btnFor(nav, sel))); };

  function apply() {
    const pick = chosen();
    navs().forEach(nav => {
      if (!nav.querySelector(':scope > .sq-head')) {
        nav.insertAdjacentHTML('afterbegin', '<div class="sq-head"><span>Your tools</span><button type="button" class="sq-edit" aria-haspopup="dialog">Edit</button></div>');
      }
      let more = nav.querySelector(':scope > .sq-more');
      if (!more) {
        more = document.createElement('button');
        more.type = 'button'; more.className = 'sq-more'; more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-label', 'More tools');
        more.innerHTML = DOTS + '<span class="sidebar-collapsible sq-more-label">More</span>';
      }
      const order = [nav.querySelector(':scope > .sq-head')];
      TOOLS.forEach(([k, , sel]) => {
        const b = btnFor(nav, sel);
        if (!b) return;
        b.classList.toggle('sq-off', !pick.includes(k));
        order.push(b);
      });
      order.push(more);
      // Keep them in one order (only move what's out of place, so this doesn't loop).
      const kids = [...nav.children].filter(c => order.includes(c));
      if (kids.length !== order.length || kids.some((c, i) => c !== order[i])) order.forEach(c => nav.appendChild(c));
      mark(nav);
    });
  }

  // Show More only when something is hidden; light it up while a hidden tool is open.
  function mark(nav) {
    const more = nav.querySelector(':scope > .sq-more'); if (!more) return;
    const hidden = hiddenIn(nav);
    if (more.hidden !== !hidden.length) more.hidden = !hidden.length;
    const on = hidden.find(([, , sel]) => btnFor(nav, sel).classList.contains('sidebar-nav-active'));
    const key = on ? on[0] : '';
    if ((more.dataset.on || '') === key) return;
    if (key) more.dataset.on = key; else delete more.dataset.on;
    more.querySelector('.sq-more-label').innerHTML = key ? 'More <small>· ' + on[1] + '</small>' : 'More';
    more.setAttribute('aria-label', key ? 'More tools, ' + on[1] + ' is open' : 'More tools');
  }

  // ── The popup: "edit" picks your 4, "more" opens a hidden tool ──
  let pop = null, anchor = null, mode = 'edit';
  function render() {
    const nav = (anchor && anchor.closest('.sidebar-quicknav')) || navs()[0];
    if (mode === 'more') {
      pop.setAttribute('aria-label', 'More tools');
      pop.innerHTML = '<div class="st-title">More tools</div><p class="st-sub">Open one without changing your ' + MAX + '.</p>' +
        hiddenIn(nav).map(([k, name, sel]) => {
          const b = btnFor(nav, sel), cur = b.classList.contains('sidebar-nav-active');
          return '<button type="button" class="st-row st-go" data-go="' + k + '"' + (cur ? ' aria-current="true"' : '') + '>' +
            iconOf(b) + '<span class="st-name">' + name + mega(k) + '</span>' + (cur ? '<span class="st-open">Open</span>' : '') + '</button>';
        }).join('') +
        '<button type="button" class="st-editlink" data-edit>Edit your tools</button>';
      return;
    }
    const pick = chosen(), full = pick.length >= MAX;
    pop.setAttribute('aria-label', 'Choose your sidebar tools');
    pop.innerHTML = '<div class="st-title">Your sidebar</div><p class="st-sub">Pick the ' + MAX + ' tools you want to see.</p>' +
      TOOLS.map(([k, name, sel]) => {
        const on = pick.includes(k);
        return '<button type="button" class="st-row' + (k === 'sims' ? ' st-mega' : '') + '" data-tool="' + k + '" aria-pressed="' + on + '"' + (!on && full ? ' aria-disabled="true"' : '') + '>' +
          iconOf(btnFor(nav, sel)) + '<span class="st-name">' + name + mega(k) + '</span><span class="st-check" aria-hidden="true">' + (on ? '✓' : '') + '</span></button>';
      }).join('') +
      '<p class="st-note">' + (full ? 'To add another, take one off first.' : 'You can show up to ' + MAX + '.') + '</p>';
  }
  function place() {
    // Short laptops zoom the whole page (desktop-fit.js): work in its CSS pixels.
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, b = anchor.getBoundingClientRect();
    const r = { left: b.left / z, top: b.top / z, right: b.right / z, bottom: b.bottom / z }, W = innerWidth / z, H = innerHeight / z;
    // Collapsed desktop sidebar: open beside the icon instead of on top of it.
    const beside = document.body.classList.contains('app-sidebar-collapsed') && !anchor.closest('#mobileHistoryDrawer');
    const left = beside ? r.right + 10 : r.left - 8, top = beside ? r.top - 8 : r.bottom + 6;
    pop.style.left = Math.min(Math.max(8, left), W - pop.offsetWidth - 8) + 'px';
    pop.style.top = Math.max(8, Math.min(top, H - pop.offsetHeight - 8)) + 'px';
  }
  function open(btn, m) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'st-pop'; pop.setAttribute('role', 'dialog');
      pop.addEventListener('click', e => {
        if (e.target.closest('[data-edit]')) { mode = 'edit'; render(); place(); return; }
        const go = e.target.closest('[data-go]');
        if (go) {
          const nav = anchor.closest('.sidebar-quicknav'), t = TOOLS.find(x => x[0] === go.dataset.go);
          close();
          const b = t && btnFor(nav, t[2]);
          if (b) b.click(); // the same click as the tool's own sidebar button
          return;
        }
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
    anchor = btn; mode = m; render(); pop.hidden = false; place();
  }
  const close = () => { if (pop) pop.hidden = true; };
  document.addEventListener('click', e => {
    const btn = e.target.closest('.sq-edit, .sq-more');
    if (btn) { e.preventDefault(); if (pop && !pop.hidden && anchor === btn) close(); else open(btn, btn.classList.contains('sq-more') ? 'more' : 'edit'); return; }
    if (pop && !pop.hidden && !pop.contains(e.target)) close();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('resize', close);

  // The Flashcards and Simulations buttons arrive a moment later; the active
  // tool and Flashcards' lock change through classes.
  navs().forEach(nav => {
    new MutationObserver(apply).observe(nav, { childList: true });
    new MutationObserver(() => mark(nav)).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  apply();
})();
