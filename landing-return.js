// Preserve the landing position across legal pages without putting it in URLs.
(function () {
  const KEY = 'knoxLandingReturn', PENDING = 'knoxLandingReturnPending';
  const legal = /^\/(privacy|terms|refund|reviews|updates)(\.html)?$/;
  const normalFinish = window.finishLandingLoading;
  let restoreStarted = false;
  function pending() { try { return sessionStorage.getItem(PENDING) === '1'; } catch (_) { return false; } }
  function restore() {
    if (!pending() || restoreStarted) return;
    restoreStarted = true;
    try {
      const item = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      const url = new URL(item?.url, location.origin);
      if (url.origin !== location.origin || !['/about','/index.html'].includes(url.pathname) ||
          !Number.isFinite(item?.y) || item.y < 0 || Date.now()-item.at < 0 || Date.now()-item.at > 7200000) return;
      const root = document.documentElement, behavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo({ top: item.y, left: 0, behavior: 'instant' });
      root.style.scrollBehavior = behavior;
    } catch (_) {}
    finally { try { sessionStorage.removeItem(PENDING); } catch (_) {} }
  }
  // Restore only after layout has been built, before uncovering the page.
  window.finishLandingLoading = function () {
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => { restore(); normalFinish(); }));
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done, { once: true });
  };
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
        a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !legal.test(url.pathname)) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ url: location.pathname+location.search+location.hash, y: scrollY, at: Date.now() })); } catch (_) {}
    // Opening a legal article is immediate; retain loading only on return.
  }, true);
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    restoreStarted = false;
    window._landingLoadingShownAt = performance.now();
    // The old cached page can have its loader hidden. Cover it immediately
    // and use the same minimum-duration loader as a normal landing visit.
    window.showLandingLoading();
    window.finishLandingLoading();
  });
})();
