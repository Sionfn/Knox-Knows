// A return URL signals only that the browser returned, never proof of payment.
// Styled like Knox's other popups: a bordered card with a ledge, in the plan's color.
const KNOX_BILLING_CSS = `
#knoxBillingStatus { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(20,12,4,.55); --kb: var(--orange,#FF6B00); --kb-dark: var(--orange-dark,#D45500); --kb-light: var(--orange-light,#FFE8D6); }
#knoxBillingStatus.kb-mega { --kb: #F2B705; --kb-dark: #B38600; --kb-light: #FFF3C4; }
#knoxBillingStatus.kb-wait { --kb: var(--border,#E5DCD0); --kb-dark: var(--border,#E5DCD0); }
.kb-hold .kb-card { visibility: hidden; }
.kb-card { position: relative; width: min(380px, 100%); padding: 26px 22px 20px; border-radius: 24px; background: var(--surface,#fff); color: var(--text,#222); border: 2px solid var(--kb); box-shadow: 0 6px 0 var(--kb-dark), 0 18px 40px rgba(0,0,0,.25); text-align: center; animation: kbIn .25s cubic-bezier(.34,1.56,.64,1); }
@keyframes kbIn { from { opacity: 0; transform: translateY(8px) scale(.95); } }
.kb-icon { width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 18px; display: grid; place-items: center; font-size: 32px; background: var(--kb-light, #FFF3E8); border: 2px solid var(--kb); box-shadow: 0 4px 0 var(--kb-dark); }
.kb-wait .kb-icon { background: var(--cream-warm,#FFF3E8); }
.kb-spin { width: 28px; height: 28px; border: 3px solid var(--border,#E5DCD0); border-top-color: var(--orange,#FF6B00); border-radius: 50%; animation: kbSpin .8s linear infinite; }
@keyframes kbSpin { to { transform: rotate(360deg); } }
.kb-card h2 { margin: 0 0 8px; font-size: 22px; font-weight: 900; line-height: 1.2; }
.kb-card p { margin: 0; font-size: 14.5px; font-weight: 700; line-height: 1.55; color: var(--text-light,#666); }
.kb-perks { list-style: none; margin: 14px 0 0; padding: 12px 14px; border-radius: 16px; background: var(--kb-light); text-align: left; display: grid; gap: 7px; }
.kb-perks li { font-size: 14px; font-weight: 800; color: var(--text,#222); }
html[data-theme="dark"] .kb-perks { background: color-mix(in srgb, var(--kb) 16%, var(--surface,#222)); }
.kb-btn { margin-top: 18px; width: 100%; padding: 12px 18px; border-radius: 14px; border: 2px solid var(--kb-dark); background: var(--kb); color: #fff; font: inherit; font-size: 15px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 0 var(--kb-dark); transition: transform .12s, box-shadow .12s; }
.kb-mega .kb-btn { color: #4A3400; }
.kb-wait .kb-btn { background: var(--surface,#fff); color: var(--text,#222); border-color: var(--border,#E5DCD0); box-shadow: 0 3px 0 var(--border,#E5DCD0); }
.kb-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 0 var(--kb-dark); }
.kb-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--kb-dark); }
.kb-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--kb) 60%, transparent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .kb-card, .kb-spin { animation: none; } }
`;
const KNOX_PERKS = {
  plus: ['⚡ Unlimited questions', '🎓 Full Learn lessons', '🃏 Bigger flashcard decks'],
  mega: ['💎 The highest limits on everything', '🃏 40-card decks you can customize', '🚀 Early access + the Mega Discord lounge'],
};
window.showKnoxBillingStatus = function () {
  document.getElementById('knoxBillingStatus')?.remove();
  // A plan change on an existing subscription names the new plan (see index.html):
  // wait for that one, so it never welcomes you to the plan you just left.
  let switched = '';
  try { switched = new URLSearchParams(location.search).get('switched') || ''; } catch (_) {}
  const wanted = switched === 'max' ? ['max'] : switched === 'plus' ? ['super', 'plus'] : ['super', 'plus', 'max'];
  if (!document.getElementById('knoxBillingCss')) {
    const css = document.createElement('style');
    css.id = 'knoxBillingCss'; css.textContent = KNOX_BILLING_CSS;
    document.head.append(css);
  }
  const overlay = document.createElement('div');
  overlay.id = 'knoxBillingStatus';
  // The "Checking…" step only shows if the check takes a while; a quick answer
  // goes straight to the welcome, with no half-second flash before it.
  overlay.className = 'modal-backdrop kb-wait kb-hold';
  const reveal = setTimeout(() => overlay.classList.remove('kb-hold'), 1500);
  const panel = document.createElement('section');
  panel.className = 'kb-card';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'knoxBillingHeading');
  const icon = document.createElement('div');
  icon.className = 'kb-icon';
  icon.innerHTML = '<span class="kb-spin" aria-hidden="true"></span>';
  const title = document.createElement('h2');
  title.id = 'knoxBillingHeading';
  title.textContent = 'Checking your plan…';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'One moment while Knox sets up your account.';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'kb-btn';
  close.textContent = 'Close';
  panel.append(icon, title, status, close);
  overlay.append(panel);
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  function dismiss() { clearTimeout(reveal); controller.abort(); overlay.remove(); previousFocus?.focus?.(); }
  close.onclick = dismiss;
  overlay.onclick = e => { if (e.target === overlay) dismiss(); };
  overlay.onkeydown = e => {
    if (e.key === 'Escape') dismiss();
    if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
  };
  document.body.append(overlay);
  close.focus();
  (async () => {
    const user = window.currentUser;
    if (!user) {
      clearTimeout(reveal); overlay.classList.remove('kb-hold');
      title.textContent = 'Sign in to see your plan';
      status.textContent = 'Sign in with the account you used at checkout, then open Account & Plan.';
      icon.textContent = '🔑';
      return;
    }
    for (let attempt = 0; attempt < 6 && overlay.isConnected; attempt++) {
      try {
        const token = await user.getIdToken();
        if (window.currentUser?.uid !== user.uid) { dismiss(); return; }
        const response = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        const data = await response.json();
        if (window.currentUser?.uid !== user.uid || !overlay.isConnected) return;
        // A repeat free trial was cancelled by Knox (one per card): say so, no charge.
        if (response.ok && data.trialDenied && Date.now() - Date.parse(data.trialDenied) < 15 * 60 * 1000 && !['super', 'plus', 'max'].includes(data.plan)) {
          clearTimeout(reveal); overlay.classList.remove('kb-wait', 'kb-hold');
          icon.textContent = '💎';
          title.textContent = 'You’ve already had a free trial';
          status.textContent = 'That card already started a Mega Knox trial, so this one was cancelled and you weren’t charged. Get Mega Knox from Pricing any time.';
          close.textContent = 'See plans';
          close.onclick = () => { dismiss(); location.href = '/about#pricing'; };
          try { localStorage.setItem('knoxMegaTrialDevice', '1'); } catch (_) {}
          return;
        }
        if (response.ok && ['super', 'plus', 'max'].includes(data.plan) && wanted.includes(data.plan)) {
          await window.knoxRefreshPlan?.();
          if (window.currentUser?.uid !== user.uid || !overlay.isConnected) return;
          const mega = data.plan === 'max', planName = mega ? 'Mega Knox' : 'Knox Plus';
          clearTimeout(reveal);
          overlay.classList.remove('kb-wait', 'kb-hold');
          overlay.classList.toggle('kb-mega', mega);
          icon.textContent = mega ? '💎' : '⚡';
          title.textContent = data.planStatus === 'trialing' ? 'Your ' + planName + ' trial is on!' : 'Welcome to ' + planName + '!';
          status.textContent = switched ? 'Your new plan is active. Stripe confirmed the change; your receipt and renewal details are in Manage billing.' : 'You’re all set. Manage billing any time from Account & Plan.';
          const perks = document.createElement('ul');
          perks.className = 'kb-perks';
          for (const perk of KNOX_PERKS[mega ? 'mega' : 'plus']) { const li = document.createElement('li'); li.textContent = perk; perks.append(li); }
          status.after(perks);
          close.textContent = 'Start studying';
          return;
        }
      } catch (_) { if (controller.signal.aborted) return; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (overlay.isConnected) {
      clearTimeout(reveal); overlay.classList.remove('kb-hold');
      icon.textContent = '⏳';
      title.textContent = 'Almost there';
      status.textContent = 'Your upgrade is not confirmed yet. It may still be setting up, so check Account & Plan in a minute. If your new plan still does not appear after you paid, email support@knoxknowsapp.com and don’t pay again.';
    }
  })();
};
