/* knox-select.js — Knox's own dropdown in place of the system (Apple) one.

   Any <select class="kx-select"> becomes a Knox sticker button that opens a
   Knox menu: white card, border + edge, rounded options, a check on the one
   you picked. The real <select> stays in the page (hidden) and still gets
   the value and its input/change events, so the code that listens to it
   doesn't change. New selects are picked up as they appear.

   Options:  data-kx="pill"   → round pill button (filters)
   window.knoxSelect = { enhance(root), refresh(root) } — refresh after
   setting a select's value from code. */
(function () {
  'use strict';
  if (window.knoxSelect) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEV = '<svg class="kx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const CHECK = '<svg class="kx-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  let open = null;

  const text = sel => sel.options[sel.selectedIndex]?.textContent || '';
  function sync(sel) {
    const b = sel._kx; if (!b) return;
    b.querySelector('.kx-text').textContent = text(sel);
    b.disabled = sel.disabled;
    const name = sel.getAttribute('aria-label') || sel.closest('label')?.querySelector('span')?.textContent?.trim() || '';
    b.setAttribute('aria-label', (name ? name + ': ' : '') + text(sel));
  }
  function enhance(root = document) {
    const list = root.matches?.('select.kx-select') ? [root] : [...(root.querySelectorAll?.('select.kx-select') || [])];
    for (const sel of list) {
      if (sel._kx && sel._kx.isConnected) { sync(sel); continue; }
      const wrap = document.createElement('span'); wrap.className = 'kx-wrap' + (sel.dataset.kx === 'pill' ? ' pill' : '');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kx-sel';
      b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false');
      b.innerHTML = `<span class="kx-text"></span>${CHEV}`;
      sel.before(wrap); wrap.append(sel, b);
      sel.classList.add('kx-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
      sel._kx = b; sync(sel);
      sel.addEventListener('change', () => sync(sel));
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open?.sel === sel ? close(true) : show(sel); });
      b.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(sel); } });
    }
  }
  function refresh(root = document) { (root.querySelectorAll?.('select.kx-select') || []).forEach(sync); }

  function show(sel) {
    close();
    const b = sel._kx, wrap = b.parentElement;
    const menu = document.createElement('div'); menu.className = 'kx-menu'; menu.setAttribute('role', 'listbox');
    menu.innerHTML = [...sel.options].map((o, i) => `<button type="button" class="kx-opt${i === sel.selectedIndex ? ' on' : ''}" role="option" aria-selected="${i === sel.selectedIndex}" data-i="${i}"${o.disabled ? ' disabled' : ''}><span>${esc(o.textContent)}</span>${CHECK}</button>`).join('');
    wrap.append(menu);
    // Open upward when there isn't room below (inside whatever scrolls).
    let box = wrap.parentElement; while (box && box !== document.body && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const r = b.getBoundingClientRect(), lim = box && box !== document.body ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const below = lim.bottom - r.bottom, above = r.top - lim.top, h = Math.min(menu.scrollHeight, 300);
    if (below < h + 12 && above > below) menu.classList.add('up');
    open = { sel, menu }; b.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
    (menu.querySelector('.kx-opt.on') || menu.querySelector('.kx-opt'))?.focus({ preventScroll: true });
    menu.querySelector('.kx-opt.on')?.scrollIntoView({ block: 'nearest' });
    menu.addEventListener('click', e => {
      e.stopPropagation();
      const o = e.target.closest('.kx-opt'); if (!o || o.disabled) return;
      const i = +o.dataset.i; close(true);
      if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    menu.addEventListener('keydown', e => {
      const opts = [...menu.querySelectorAll('.kx-opt:not([disabled])')], at = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(0, Math.min(opts.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); opts[e.key === 'Home' ? 0 : opts.length - 1]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close();
    });
  }
  function close(focus) {
    if (!open) return;
    const { sel, menu } = open; open = null;
    menu.remove(); sel._kx?.setAttribute('aria-expanded', 'false'); sel._kx?.parentElement?.classList.remove('is-open');
    if (focus) sel._kx?.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => { if (open && !open.menu.contains(e.target)) close(); });
  window.addEventListener('resize', () => close());

  // Pick up selects as screens are drawn.
  const start = () => {
    enhance(document);
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('select.kx-select') || n.querySelector('select.kx-select'))) enhance(n); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.knoxSelect = { enhance, refresh };
})();
