// One site-themed loader: never let the OS color scheme choose a second screen.
(function () {
  const KEY = 'knoxLandingReturn', PENDING = 'knoxLandingReturnPending';
  const validClick = (e, a) => a && !e.defaultPrevented && e.button === 0 &&
    !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
    !a.hasAttribute('download') && (!a.target || a.target === '_self');
  function savedLanding() {
    try {
      const item = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      const url = new URL(item?.url, location.origin);
      if (url.origin === location.origin && ['/about','/index.html'].includes(url.pathname) &&
          Number.isFinite(item?.y) && item.y >= 0 && Date.now() - item.at >= 0 && Date.now() - item.at < 7200000) return item;
    } catch (_) {}
    return null;
  }
  let safety;
  function hide() { document.body.classList.remove('page-loading'); }
  function showPageTransition() {
    // Legal/review pages already contain this exact loading screen.
    // No second logo or OS-selected overlay is injected.
    document.body.classList.add('page-loading');
    clearTimeout(safety); safety = setTimeout(hide, 8000);
  }
  window._showPageTransition = showPageTransition;
  window.addEventListener('pageshow', hide);
  window.addEventListener('popstate', hide);
  document.querySelectorAll('a[href="/about"]').forEach(link => {
    link.addEventListener('click', event => {
      if (!validClick(event, link)) return;
      let previous;
      try { previous = new URL(document.referrer); } catch (_) {}
      const directBack = previous?.origin === location.origin &&
        ['/about','/index.html'].includes(previous.pathname) && history.length > 1;
      const saved = savedLanding();
      if (!directBack && !saved) return; // direct visits use the normal /about link
      event.preventDefault();
      try { sessionStorage.setItem(PENDING, '1'); } catch (_) {}
      showPageTransition();
      const go = () => directBack ? history.back() : location.assign(saved.url);
      // Allow the normal loader to paint before the navigation starts.
      requestAnimationFrame(() => requestAnimationFrame(go));
    });
  });
  document.addEventListener('click', event => {
    const a = event.target.closest?.('a[href]');
    if (!validClick(event, a)) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    showPageTransition();
  });
})();
