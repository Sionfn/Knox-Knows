// Keep the first frame neutral until Firebase and the account have settled.
(() => {
  const root = document.documentElement;
  root.dataset.boot = 'loading';
  try { root.dataset.theme = localStorage.getItem('knoxTheme') === 'dark' ? 'dark' : 'light'; } catch (_) {}
  const style = document.createElement('style');
  style.textContent = `html[data-boot] {background:#fff8f0}html[data-theme=dark][data-boot]{background:#101013}
    html[data-boot] body{visibility:hidden}#knoxBoot{visibility:visible;position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;text-align:center;background:#fff8f0;color:#34343b;font:600 15px system-ui;padding:24px}
    html[data-theme=dark] #knoxBoot{background:#101013;color:#ededed}#knoxBoot img{width:56px;height:56px;border-radius:16px;margin:0 auto 16px}#knoxBoot p{max-width:360px;line-height:1.6}#knoxBoot button{border:0;border-radius:12px;background:#ff6b00;color:white;padding:12px 20px;font:inherit;cursor:pointer}`;
  document.head.append(style);
  let error = false;
  function draw() {
    if (!root.dataset.boot || !document.body) return;
    let el = document.getElementById('knoxBoot');
    if (!el) { el = document.createElement('div'); el.id = 'knoxBoot'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.replaceChildren();
    const logo = document.createElement('img'); logo.src = '/knox-logo-square.jpg'; logo.alt = 'Knox Knows'; el.append(logo);
    const message = document.createElement('p'); message.textContent = error ? 'We couldn’t restore your account. Check your connection and try again.' : 'Getting Knox ready…'; el.append(message);
    if (error) { const retry = document.createElement('button'); retry.textContent = 'Try again'; retry.onclick = () => location.reload(); el.append(retry); }
  }
  const timer = setTimeout(() => { error = true; draw(); }, 15000);
  window.knoxBoot = {
    ready() { clearTimeout(timer); delete root.dataset.boot; document.getElementById('knoxBoot')?.remove(); },
    fail() { clearTimeout(timer); error = true; draw(); }
  };
  document.addEventListener('DOMContentLoaded', draw);
})();
