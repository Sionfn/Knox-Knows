// Shared navigation script for static pages (privacy, terms, refund, 404, updates).
//
// Two jobs:
//   1) /about links go BACK to the previous landing scroll position when the
//      referrer was the landing page itself; otherwise they fall through to
//      the normal /about link.
//   2) On any internal link click, show a lightweight loading overlay so the
//      transition feels intentional instead of a blank flicker between pages.
//      Without this, going from /privacy → / used to instantly switch with
//      no feedback — the landing page's own loading screen resolves before
//      the browser paints, so nothing bridges the two views.

(function() {
  // ── 1) /about back-navigation ─────────────────────────────────────────
  document.querySelectorAll('a[href="/about"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      try {
        const previous = new URL(document.referrer);
        if (previous.origin === location.origin && previous.pathname === '/about' && history.length > 1) {
          event.preventDefault();
          // Show the transition overlay before navigating back too, so a
          // returning click reads the same as a forward click.
          showPageTransition();
          history.back();
        }
      } catch { /* No referrer: use the ordinary landing-page link. */ }
    });
  });

  // ── 2) Page-transition loading overlay ────────────────────────────────
  // Injected once per page, mirrors the landing loading screen so all
  // views feel like one product.
  const overlay = document.createElement('div');
  overlay.id = 'knoxPageTransition';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = [
    '<div class="kpt-content">',
      '<img class="kpt-logo" src="/knox-logo-square.jpg" alt="" aria-hidden="true">',
      '<div class="kpt-title">Knox Knows</div>',
      '<div class="kpt-spinner" aria-hidden="true"></div>',
    '</div>'
  ].join('');

  const style = document.createElement('style');
  style.textContent = [
    '#knoxPageTransition { position:fixed; inset:0; z-index:100000; display:none; align-items:center; justify-content:center; background:#FFF8F0; opacity:0; transition:opacity 120ms ease-out; }',
    '#knoxPageTransition.kpt-show { display:flex; opacity:1; }',
    '#knoxPageTransition .kpt-content { display:flex; flex-direction:column; align-items:center; gap:13px; font-family:"Nunito",system-ui,sans-serif; color:#18181B; }',
    '#knoxPageTransition .kpt-logo { width:76px; height:76px; border:4px solid #FF6B00; border-radius:22px; box-shadow:0 5px 0 #CC5500; object-fit:cover; }',
    '#knoxPageTransition .kpt-title { font-size:24px; font-weight:900; }',
    '#knoxPageTransition .kpt-spinner { width:26px; height:26px; border:3px solid #E5E5E5; border-top-color:#FF6B00; border-radius:50%; animation:kptSpin .8s linear infinite; }',
    '@keyframes kptSpin { to { transform:rotate(360deg); } }',
    '@media (prefers-color-scheme: dark) { #knoxPageTransition { background:#18181B; color:#EDEDED; } #knoxPageTransition .kpt-spinner { border-color:#3b3b43; border-top-color:#FF6B00; } }',
    '@media (prefers-reduced-motion: reduce) { #knoxPageTransition .kpt-spinner { animation:none; border-color:#FF6B00; } #knoxPageTransition { transition:none; } }'
  ].join('\n');
  document.head.appendChild(style);
  document.body.appendChild(overlay);

  function showPageTransition() {
    overlay.classList.add('kpt-show');
  }
  // Expose for /about back-nav path above.
  window._showPageTransition = showPageTransition;

  // Hide the overlay on ANY pageshow (both fresh loads and bfcache
  // restores) so a browser Back with bfcache disabled doesn't leave the
  // spinner stuck until the safety timeout fires. Also hide on popstate
  // for good measure — some browsers fire that first.
  window.addEventListener('pageshow', () => overlay.classList.remove('kpt-show'));
  window.addEventListener('popstate', () => overlay.classList.remove('kpt-show'));

  // ── Intercept internal-link clicks ──
  // Only show the overlay for real navigations to another page on this
  // origin. Anchors (#foo), external links, downloads, mailto:, target="_blank",
  // and modifier-clicks are all skipped so the browser handles them normally.
  document.addEventListener('click', event => {
    const a = event.target.closest('a[href]');
    if (!a) return;
    if (event.defaultPrevented) return; // another handler already took over
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (a.hasAttribute('download')) return;
    if (a.target && a.target !== '_self') return;

    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    // Same-page hash change (nothing to load): skip.
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

    showPageTransition();
    // Safety net: if navigation is cancelled (e.g. dialog blocks it), hide
    // the overlay a second later so the page isn't left frozen.
    setTimeout(() => overlay.classList.remove('kpt-show'), 4000);
  }, { capture: true });
})();
