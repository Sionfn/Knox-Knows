// password-field.js — adds a show/hide eye button to every password box.
//
// Used by the sign-in / sign-up windows on the app and the landing page.
// Wraps each <input type="password"> so the eye sits inside the right edge
// of the box; clicking it switches between dots and plain text.
(function () {
  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/></svg>';

  var style = document.createElement('style');
  style.textContent =
    '.pw-wrap{position:relative;display:block}' +
    '.pw-wrap>input{padding-right:50px!important}' +
    '.pw-toggle{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:36px;height:36px;' +
    'border:0;border-radius:10px;background:transparent;color:var(--text-light,#777);display:flex;' +
    'align-items:center;justify-content:center;cursor:pointer;padding:0;transition:color .15s,background .15s}' +
    '.pw-toggle:hover{color:var(--orange,#FF6B00);background:var(--orange-cream,#FFF8F0)}' +
    '.pw-toggle:focus-visible{outline:3px solid var(--blue,#1CB0F6);outline-offset:1px}' +
    '.pw-toggle svg{width:20px;height:20px}';
  document.head.appendChild(style);

  function enhance(input) {
    if (input.dataset.pwToggle) return;
    input.dataset.pwToggle = '1';
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.innerHTML = EYE;
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });
    wrap.appendChild(btn);
  }

  document.querySelectorAll('input[type="password"]').forEach(enhance);
})();
