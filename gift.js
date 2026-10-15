// gift.js — Knox Plus gift codes in the app.
//
//   window.knoxGifts.openRedeem(code?) — "Redeem a code" (account menu, /redeem)
//   window.knoxGifts.openBuy()         — "Give Knox Plus" (account menu, pricing)
// URL hooks: /redeem, ?code=…, ?gift=… (Flame Fest friend links),
// ?buy_gift=1 (from the landing page) and ?gift_purchase=success (back from Stripe).
// The server (api/redeem.js, api/create-checkout-session.js) does all checks.
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OPTIONS = [
    { id: '1m', label: '1 month', price: '$9.99', note: 'A great stocking stuffer' },
    { id: '3m', label: '3 months', price: '$29.99', note: 'A whole semester' },
    { id: '12m', label: '12 months', price: '$79.99', note: 'The full school year and summer' },
  ];
  async function api(path, method, body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Please sign in first.');
    const r = await fetch(path, {
      method, headers: { 'Authorization': 'Bearer ' + await user.getIdToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // ── A small window (same look as Flame Fest's) ──────────────────────────
  let modal = null, lastFocus = null;
  function show(html) {
    close();
    lastFocus = document.activeElement;
    modal = document.createElement('div');
    modal.className = 'ff-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'kgTitle');
    modal.innerHTML = `<div class="ff-card ff-pop kg-card"><button type="button" class="ff-x" aria-label="Close">×</button>${html}</div>`;
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.ff-x')) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(modal);
    return modal;
  }
  function close() {
    if (!modal) return;
    modal.remove(); modal = null;
    document.removeEventListener('keydown', onKey, true);
    lastFocus?.focus?.({ preventScroll: true });
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  // Signed out: remember what they wanted, ask them to sign in, carry on after.
  function needSignIn(action, code) {
    try { sessionStorage.setItem('knoxGiftAction', JSON.stringify({ action, code: code || '' })); } catch (e) {}
    const m = show(`<div class="ff-pop-flame" aria-hidden="true">🎁</div><h2 id="kgTitle">${action === 'buy' ? 'Give Knox Plus' : 'Redeem your gift'}</h2>
      <p>${action === 'buy' ? 'Sign in first, so we can send your gift code to your email.' : 'Sign in or make a free account to add your Knox Plus gift.'}</p>
      <div class="ff-pop-actions"><button type="button" class="ff-claim" data-signin>Sign in</button></div>`);
    m.querySelector('[data-signin]').addEventListener('click', () => { close(); (window.openAuthModal || window.openLoginModal)?.('signin'); }); // app / landing page
  }

  // ── Redeem ──────────────────────────────────────────────────────────────
  async function openRedeem(code = '') {
    if (!window.currentUser) return needSignIn('redeem', code);
    const m = show(`<div class="ff-pop-flame" aria-hidden="true">🎁</div><h2 id="kgTitle">Redeem a code</h2>
      <p>Got a Knox Plus gift card? Enter the code to add Knox Plus to your account.</p>
      <form class="kg-form" autocomplete="off"><input class="kg-input" id="kgCode" placeholder="KNOX-XXXX-XXXX-XXXX" value="${esc(code)}" aria-label="Gift code" autocapitalize="characters" spellcheck="false" maxlength="40"><button type="submit" class="ff-claim">Redeem</button></form>
      <div class="kg-msg" role="status"></div>
      <div class="kg-bought"></div>
      <button type="button" class="ff-pop-later" data-buy>🎁 Want to give Knox Plus instead?</button>`);
    const input = m.querySelector('#kgCode'), msg = m.querySelector('.kg-msg');
    input.focus();
    m.querySelector('[data-buy]').addEventListener('click', openBuy);
    m.querySelector('.kg-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true; msg.className = 'kg-msg'; msg.textContent = 'Checking…';
      try {
        const r = await api('/api/redeem', 'POST', { code: input.value });
        window.knoxRefreshPlan?.();
        const until = new Date(r.plusUntil).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
        show(`<div class="ff-pop-flame" aria-hidden="true">⚡</div><h2 id="kgTitle">You’re on Knox Plus!</h2>
          <p>Your gift added ${r.days} days of Knox Plus — unlimited questions and everything else Knox Plus has, through <b>${until}</b>. Nothing renews and you won’t be charged. 🎉</p>
          <div class="ff-pop-actions"><button type="button" class="ff-claim" data-ok>Let’s go</button></div>`).querySelector('[data-ok]').addEventListener('click', close);
      } catch (err) { msg.className = 'kg-msg err'; msg.textContent = err.message; btn.disabled = false; }
    });
    // Gifts this account bought (so the code is never lost).
    try {
      const { gifts } = await api('/api/redeem', 'GET');
      if (gifts?.length && modal === m) {
        m.querySelector('.kg-bought').innerHTML = `<div class="kg-bought-title">Gifts you bought</div>` + gifts.slice().reverse().map(g =>
          `<div class="kg-bought-row"><span><b>${esc(g.label)}</b><code>${esc(g.code)}</code></span><button type="button" class="ff-copy" data-copy="${esc(g.code)}">Copy</button></div>`).join('');
        m.querySelector('.kg-bought').addEventListener('click', e => {
          const b = e.target.closest('[data-copy]');
          if (b) navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied!'; }, () => {});
        });
      }
    } catch (e) { /* the list is a nice-to-have */ }
  }

  // ── Buy a gift ──────────────────────────────────────────────────────────
  function openBuy() {
    if (!window.currentUser) return needSignIn('buy');
    const m = show(`<div class="ff-pop-flame" aria-hidden="true">🎁</div><h2 id="kgTitle">Give Knox Plus</h2>
      <p>A gift card for unlimited homework help. You get a code by email to give or print — no subscription, it never renews.</p>
      <div class="kg-options" role="radiogroup" aria-label="Gift length">${OPTIONS.map((o, i) =>
        `<button type="button" class="kg-option${o.id === '12m' ? ' on' : ''}" role="radio" aria-checked="${o.id === '12m'}" data-gift="${o.id}"><b>${o.label}</b><span class="kg-price">${o.price}</span><small>${o.note}</small></button>`).join('')}</div>
      <div class="ff-pop-actions"><button type="button" class="ff-claim" data-checkout>Continue to payment</button></div>
      <div class="kg-msg" role="status"></div>
      <p class="kg-fine">The code works once and never expires. Whoever redeems it gets Knox Plus for that long, then goes back to the free plan — they’re never charged.</p>`);
    let choice = '12m';
    m.querySelector('.kg-options').addEventListener('click', e => {
      const b = e.target.closest('[data-gift]'); if (!b) return;
      choice = b.dataset.gift;
      m.querySelectorAll('.kg-option').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    });
    m.querySelector('[data-checkout]').addEventListener('click', async e => {
      const btn = e.currentTarget, msg = m.querySelector('.kg-msg');
      btn.disabled = true; btn.textContent = 'Opening checkout…'; msg.textContent = '';
      try { const { url } = await api('/api/create-checkout-session', 'POST', { gift: choice }); location.href = url; }
      catch (err) { msg.className = 'kg-msg err'; msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Continue to payment'; }
    });
  }

  function purchased() {
    show(`<div class="ff-pop-flame" aria-hidden="true">🎄</div><h2 id="kgTitle">Your gift is on its way!</h2>
      <p>We’re emailing you the gift card with the code — it can take a minute. You can always find it under <b>Redeem a code → Gifts you bought</b>.</p>
      <div class="ff-pop-actions"><button type="button" class="ff-claim" data-see>See my gift code</button><button type="button" class="ff-pop-later" data-ok>Done</button></div>`);
    modal.querySelector('[data-ok]').addEventListener('click', close);
    modal.querySelector('[data-see]').addEventListener('click', () => openRedeem());
  }

  // ── URL hooks ───────────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  let pending = null;
  if (location.pathname.replace(/\/$/, '') === '/redeem' || params.has('code') || params.has('gift')) pending = { action: 'redeem', code: params.get('code') || params.get('gift') || '' };
  else if (params.has('buy_gift')) pending = { action: 'buy' };
  else if (params.get('gift_purchase') === 'success') pending = { action: 'purchased' };
  if (pending) {
    const url = new URL(location.href);
    ['code', 'gift', 'buy_gift', 'gift_purchase'].forEach(k => url.searchParams.delete(k));
    if (url.pathname.replace(/\/$/, '') === '/redeem') url.pathname = '/app';
    history.replaceState(null, '', url);
  } else {
    try { pending = JSON.parse(sessionStorage.getItem('knoxGiftAction') || 'null'); } catch (e) {}
  }
  // Both pages keep a loading screen up until sign-in is known; wait for it.
  const authSettling = () => document.body.classList.contains('app-auth-pending') || document.body.classList.contains('landing-loading');
  let waits = 0;
  function run() {
    if (!pending) return;
    if (authSettling() && waits++ < 40) { setTimeout(run, 400); return; }
    const p = pending;
    if (p.action !== 'purchased' && !window.currentUser) { needSignIn(p.action, p.code); return; }
    pending = null;
    try { sessionStorage.removeItem('knoxGiftAction'); } catch (e) {}
    if (p.action === 'buy') openBuy(); else if (p.action === 'purchased') purchased(); else openRedeem(p.code);
  }
  // Wait for sign-in to settle (the app fires knox-auth-changed), then act.
  let ready = false;
  addEventListener('knox-auth-changed', () => { if (!ready) return; if (window.currentUser) { try { pending = pending || JSON.parse(sessionStorage.getItem('knoxGiftAction') || 'null'); } catch (e) {} run(); } });
  addEventListener('load', () => setTimeout(() => { ready = true; run(); }, 600));

  window.knoxGifts = { openRedeem, openBuy, close };
})();
