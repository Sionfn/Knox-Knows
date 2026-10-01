// A return URL signals only that the browser returned, never proof of payment.
window.showKnoxBillingStatus = function () {
  document.getElementById('knoxBillingStatus')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'knoxBillingStatus';
  overlay.className = 'modal-backdrop';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px';
  const panel = document.createElement('section');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'knoxBillingHeading');
  panel.style.cssText = 'background:var(--surface,#fff);color:var(--text,#222);padding:28px;border-radius:24px;max-width:440px;width:100%';
  const title = document.createElement('h2');
  title.id = 'knoxBillingHeading';
  title.textContent = 'Checking your plan';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'line-height:1.6;margin:16px 0';
  status.textContent = 'Please wait while Knox checks your account. Returning from checkout does not confirm a payment.';
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = 'padding:12px 24px;border-radius:12px;border:0;background:var(--orange,#ff6b00);color:#181818;font:inherit;font-weight:800';
  panel.append(title, status, close);
  overlay.append(panel);
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  function dismiss() { controller.abort(); overlay.remove(); previousFocus?.focus?.(); }
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
      title.textContent = 'Sign in to check your plan';
      status.textContent = 'Sign in with the account used at checkout, then open Account & Plan.';
      return;
    }
    for (let attempt = 0; attempt < 6 && overlay.isConnected; attempt++) {
      try {
        const token = await user.getIdToken();
        if (window.currentUser?.uid !== user.uid) { dismiss(); return; }
        const response = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        const data = await response.json();
        if (window.currentUser?.uid !== user.uid || !overlay.isConnected) return;
        if (response.ok && ['super', 'plus', 'max'].includes(data.plan)) {
          title.textContent = 'Knox Plus is active';
          status.textContent = data.planStatus === 'trialing' ? 'Your account has an active trial. Manage billing from Account & Plan.' : 'Your account has Plus access. Manage billing from Account & Plan.';
          return;
        }
      } catch (_) { if (controller.signal.aborted) return; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (overlay.isConnected) {
      title.textContent = 'Your upgrade is not confirmed yet';
      status.textContent = 'Activation may still be processing. Refresh Account & Plan shortly. If you completed checkout and the plan stays Free, contact support@knoxknowsapp.com; do not pay again.';
    }
  })();
};
