// calc.js — the Knox Calculator screen (math lives in calc-core.js).
//
// A Knox-style page like Flashcards: tap or type, the answer shows as you go,
// Basic and Scientific keys, DEG/RAD, a 2nd key for inverse functions, Ans,
// fractions for school answers, a history you can tap to reuse, and buttons
// to copy the answer, send it to Knox, or ask Knox to explain it.
//   window.KnoxCalc.onOpen() — called by openCalc() in app.html
(function () {
  const root = document.getElementById('kcRoot');
  if (!root || !window.KnoxMath) return;
  const M = window.KnoxMath;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── State ───────────────────────────────────────────────────────────────
  const st = {
    tokens: [],                 // what the student entered, one key at a time
    mode: store.get('knoxCalcMode', 'basic'),
    deg: store.get('knoxCalcDeg', true),
    second: false,
    ans: null,                  // last answer (the Ans key)
    done: null,                 // { expr, value } right after "="
    error: '',
    history: store.get('knoxCalcHistory', []).slice(0, 30),
  };
  const OPS = ['+', '−', '×', '÷', '^'];
  const expr = () => st.tokens.join('');
  const isValueEnd = t => !!t && (/[\d.)πe²³%!]$/.test(t) || t === 'Ans');

  // ── Keys ────────────────────────────────────────────────────────────────
  // [label, action, style, aria]
  const BASIC = [
    ['AC', 'clear', 'clear', 'Clear'], ['( )', 'paren', 'op', 'Brackets'], ['%', 'in:%', 'op', 'Percent'], ['÷', 'op:÷', 'op', 'Divide'],
    ['7', 'in:7', 'num'], ['8', 'in:8', 'num'], ['9', 'in:9', 'num'], ['×', 'op:×', 'op', 'Times'],
    ['4', 'in:4', 'num'], ['5', 'in:5', 'num'], ['6', 'in:6', 'num'], ['−', 'op:−', 'op', 'Minus'],
    ['1', 'in:1', 'num'], ['2', 'in:2', 'num'], ['3', 'in:3', 'num'], ['+', 'op:+', 'op', 'Plus'],
    ['0', 'in:0', 'num'], ['.', 'in:.', 'num', 'Decimal point'], ['⌫', 'del', 'del', 'Delete'], ['=', 'equals', 'eq', 'Equals'],
  ];
  const sci = () => [
    ['2nd', 'second', st.second ? 'fn on' : 'fn', 'Second functions'],
    [st.deg ? 'DEG' : 'RAD', 'deg', 'fn modekey', st.deg ? 'Degrees (tap for radians)' : 'Radians (tap for degrees)'],
    ['π', 'in:π', 'const', 'Pi'], ['e', 'in:e', 'const', 'e'], ['Ans', 'in:Ans', 'const', 'Last answer'],
    ...(st.second
      ? [['sin⁻¹', 'fn:sin⁻¹(', 'fn'], ['cos⁻¹', 'fn:cos⁻¹(', 'fn'], ['tan⁻¹', 'fn:tan⁻¹(', 'fn'], ['10ˣ', 'in:10^', 'fn', '10 to the power'], ['eˣ', 'in:e^', 'fn', 'e to the power']]
      : [['sin', 'fn:sin(', 'fn'], ['cos', 'fn:cos(', 'fn'], ['tan', 'fn:tan(', 'fn'], ['log', 'fn:log(', 'fn'], ['ln', 'fn:ln(', 'fn']]),
    ['x²', 'in:²', 'fn', 'Squared'], ['x³', 'in:³', 'fn', 'Cubed'], ['xʸ', 'op:^', 'fn', 'Power'], ['√', 'fn:√(', 'fn', 'Square root'], ['∛', 'fn:∛(', 'fn', 'Cube root'],
    ['n!', 'in:!', 'fn', 'Factorial'], ['1/x', 'recip', 'fn', 'One over'], ['|x|', 'fn:abs(', 'fn', 'Absolute value'], ['(', 'in:(', 'op', 'Open bracket'], [')', 'in:)', 'op', 'Close bracket'],
  ];
  const key = ([label, action, style, aria]) =>
    `<button type="button" class="kc-key kc-${style.split(' ').join(' kc-')}" data-k="${esc(action)}"${aria ? ` aria-label="${esc(aria)}"` : ''}>${esc(label)}</button>`;

  // ── Input ───────────────────────────────────────────────────────────────
  function press(action) {
    const [kind, val] = action.includes(':') ? [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)] : [action, ''];
    st.error = '';
    if (kind === 'equals') return equals();
    if (kind === 'clear') { st.tokens = []; st.done = null; return render(); }
    if (kind === 'del') { if (st.done) { st.tokens = []; st.done = null; } else st.tokens.pop(); return render(); }
    if (kind === 'second') { st.second = !st.second; return render(); }
    if (kind === 'deg') { st.deg = !st.deg; store.set('knoxCalcDeg', st.deg); return render(); }
    // Right after "=": an operator keeps going from the answer; anything else starts fresh.
    if (st.done) {
      const continues = kind === 'op' || ['%', '!', '²', '³'].includes(val) || kind === 'recip';
      st.tokens = continues ? ['Ans'] : [];
      st.done = null;
    }
    const last = st.tokens[st.tokens.length - 1];
    if (kind === 'in') {
      if (val === '.') {
        // One decimal point per number; "." on its own becomes "0."
        const tail = (expr().match(/[\d.]*$/) || [''])[0];
        if (tail.includes('.')) return render();
        if (!tail) { st.tokens.push('0.'); return render(); }
      }
      st.tokens.push(val);
    } else if (kind === 'op') {
      if (!st.tokens.length) {
        if (val === '−') st.tokens.push('−');                          // a negative number
        else if (Number.isFinite(st.ans)) st.tokens.push('Ans', val);  // keep going from the last answer
      } else if (last === '(') {
        if (val === '−') st.tokens.push('−');
      } else if (OPS.includes(last)) {
        if (val === '−' && last !== '−' && last !== '+') st.tokens.push('−'); // 2 × −3
        else st.tokens[st.tokens.length - 1] = val;                       // changed your mind: swap it
      } else st.tokens.push(val);
    } else if (kind === 'fn') {
      st.tokens.push(val);
      if (st.second) st.second = false;
    } else if (kind === 'paren') {
      const open = (expr().match(/\(/g) || []).length - (expr().match(/\)/g) || []).length;
      st.tokens.push(open > 0 && isValueEnd(last) ? ')' : '(');
    } else if (kind === 'recip') {
      st.tokens = st.tokens.length && isValueEnd(last) ? ['1÷(', ...st.tokens, ')'] : [...st.tokens, '1÷('];
    }
    if (st.tokens.length > 120) st.tokens.length = 120;
    render();
  }
  function equals() {
    const text = expr();
    if (!text) return;
    const r = M.evaluate(text, { deg: st.deg, ans: st.ans });
    if (r.error) { st.error = r.error; return render(); }
    if (r.value === null) return;
    // Show the real number instead of "Ans" (84 × 2, not Ans × 2).
    const prev = Number.isFinite(st.ans) ? M.format(st.ans) : '';
    const shownExpr = prev ? text.replace(/Ans/g, prev.startsWith('-') || prev.includes('×') ? '(' + prev + ')' : prev) : text;
    st.ans = r.value;
    st.done = { expr: closeParens(shownExpr), value: r.value };
    const shown = M.format(r.value);
    if (st.history[0]?.expr !== st.done.expr) {
      st.history.unshift({ expr: st.done.expr, result: shown, value: r.value });
      st.history = st.history.slice(0, 30);
      store.set('knoxCalcHistory', st.history);
    }
    render();
    pop();
  }
  const closeParens = t => t + ')'.repeat(Math.max(0, (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length));
  // Re-split a saved expression into keys so ⌫ removes whole pieces again.
  function toTokens(text) {
    const PIECES = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'abs(', '√(', '∛(', 'Ans', '1÷('];
    const out = []; let i = 0;
    while (i < text.length) {
      const piece = PIECES.find(p => text.startsWith(p, i));
      if (piece) { out.push(piece); i += piece.length; } else out.push(text[i++]);
    }
    return out;
  }

  // ── Screen ──────────────────────────────────────────────────────────────
  const pretty = t => esc(t).replace(/([+×÷^])/g, ' $1 ').replace(/(\S)−/g, '$1 − ').replace(/ \^ /g, '^');
  function screenHtml() {
    if (st.done) {
      const frac = M.fraction(st.done.value);
      return `<div class="kc-expr">${pretty(st.done.expr)} =</div>
        <div class="kc-result kc-big" aria-live="polite">${esc(M.format(st.done.value))}</div>
        ${frac ? `<div class="kc-frac">= ${esc(frac)}</div>` : '<div class="kc-frac"></div>'}`;
    }
    const text = expr();
    let preview = '';
    if (st.error) preview = `<div class="kc-preview kc-err" role="alert">${esc(st.error)}</div>`;
    else if (text && /[+−×÷^%!²³(πeA]|sin|cos|tan|log|ln|abs|√|∛/.test(text)) {
      const r = M.evaluate(text, { deg: st.deg, ans: st.ans });
      preview = `<div class="kc-preview">${!r.error && r.value !== null ? '= ' + esc(M.format(r.value)) : '&nbsp;'}</div>`;
    } else preview = '<div class="kc-preview">&nbsp;</div>';
    return `<div class="kc-expr kc-typing">${st.ans !== null ? `Ans = ${esc(M.format(st.ans))}` : '&nbsp;'}</div>
      <div class="kc-result" aria-live="polite">${text ? pretty(text) : '0'}<span class="kc-caret" aria-hidden="true"></span></div>${preview}`;
  }
  function historyHtml() {
    if (!st.history.length) return '<p class="kc-empty">Your answers show up here. Tap one to use it again.</p>';
    return '<ol class="kc-hist">' + st.history.map((h, i) =>
      `<li><button type="button" class="kc-hist-item" data-h="${i}"><span class="kc-hist-expr">${pretty(h.expr)} =</span><b>${esc(h.result)}</b></button></li>`).join('') + '</ol>';
  }
  function render() {
    root.querySelector('.kc-screen-inner').innerHTML = screenHtml();
    const sciBox = root.querySelector('.kc-sci');
    sciBox.hidden = st.mode !== 'sci';
    if (st.mode === 'sci') sciBox.innerHTML = sci().map(key).join('');
    root.querySelectorAll('.kc-mode').forEach(b => { const on = b.dataset.mode === st.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    root.querySelector('.kc-history-body').innerHTML = historyHtml();
    root.querySelector('[data-k="clear-history"]').hidden = !st.history.length;
    const has = !!st.done;
    root.querySelectorAll('.kc-act').forEach(b => { b.disabled = !has; });
  }
  function pop() {
    const r = root.querySelector('.kc-big');
    if (!r) return;
    r.classList.remove('kc-pop'); void r.offsetWidth; r.classList.add('kc-pop');
  }
  function toast(msg) {
    const t = root.querySelector('.kc-toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ── Page ────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <header class="kc-head">
      <span class="kc-badge">🧮 Knox Calculator</span>
      <h1 class="kc-title" tabindex="-1">Crunch the <span class="accent">numbers.</span></h1>
      <p class="kc-sub">Tap or type — Knox shows the answer as you go.</p>
    </header>
    <div class="kc-topbar">
      <button type="button" class="kc-back" data-k="back">← Back to chat</button>
      <div class="kc-modes" role="group" aria-label="Calculator type">
        <button type="button" class="kc-mode" data-mode="basic">Basic</button><button type="button" class="kc-mode" data-mode="sci">Scientific</button>
      </div>
    </div>
    <div class="kc-layout">
      <section class="kc-card" aria-label="Calculator">
        <div class="kc-screen"><div class="kc-screen-inner"></div></div>
        <div class="kc-sci" hidden></div>
        <div class="kc-keys">${BASIC.map(key).join('')}</div>
        <div class="kc-actions">
          <button type="button" class="kc-act" data-k="copy" disabled>📋 Copy</button>
          <button type="button" class="kc-act" data-k="send" disabled>➤ Send to Knox</button>
          <button type="button" class="kc-act kc-act-main" data-k="explain" disabled>💡 Explain it</button>
        </div>
      </section>
      <aside class="kc-history" aria-label="History">
        <div class="kc-history-top"><b>History</b><button type="button" class="kc-link" data-k="clear-history">Clear</button></div>
        <div class="kc-history-body"></div>
      </aside>
    </div>
    <p class="kc-note">Keyboard works too: numbers, + − * / ^ ( ) % !, Enter for =, Backspace to delete.</p>
    <div class="kc-toast" role="status"></div>`;

  root.addEventListener('click', e => {
    const m = e.target.closest('.kc-mode');
    if (m) { st.mode = m.dataset.mode; store.set('knoxCalcMode', st.mode); render(); return; }
    const h = e.target.closest('[data-h]');
    if (h) { const item = st.history[+h.dataset.h]; if (item) { st.tokens = toTokens(item.expr); st.done = null; st.error = ''; render(); } return; }
    const b = e.target.closest('[data-k]');
    if (!b || b.disabled) return;
    const k = b.dataset.k;
    if (k === 'back') { window.closeCalc?.(); return; }
    if (k === 'clear-history') { st.history = []; store.set('knoxCalcHistory', []); render(); return; }
    if (k === 'copy' || k === 'send' || k === 'explain') return act(k);
    b.classList.add('kc-pressed'); setTimeout(() => b.classList.remove('kc-pressed'), 120);
    press(k);
  });
  function act(k) {
    if (!st.done) return;
    const answer = M.format(st.done.value), line = `${st.done.expr} = ${answer}`;
    if (k === 'copy') { navigator.clipboard?.writeText(answer).then(() => toast('Copied ' + answer), () => toast('Couldn’t copy — select the answer instead')); return; }
    const text = k === 'send' ? line : `Can you explain how to work out ${st.done.expr}? I got ${answer}.`;
    const ta = document.getElementById('appChatInput');
    if (ta) {
      ta.value = ta.value && k === 'send' ? ta.value + ' ' + text : text;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    }
    window.closeCalc?.();
    ta?.focus();
  }

  // Keyboard: only while the calculator is open and you're not typing elsewhere.
  document.addEventListener('keydown', e => {
    if (!document.getElementById('calcModal')?.classList.contains('open')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const map = { '+': 'op:+', '-': 'op:−', '*': 'op:×', 'x': 'op:×', '/': 'op:÷', '^': 'op:^', '(': 'in:(', ')': 'in:)', '%': 'in:%', '!': 'in:!', '.': 'in:.', ',': 'in:.',
      Enter: 'equals', '=': 'equals', Backspace: 'del', Delete: 'clear', p: 'in:π' };
    let action = /^\d$/.test(e.key) ? 'in:' + e.key : map[e.key];
    if (!action) return;
    if (e.key === 'Enter' && e.target.closest?.('button')) return; // Enter on a focused key presses that key
    e.preventDefault();
    const btn = root.querySelector(`[data-k="${CSS.escape(action)}"]`);
    if (btn) { btn.classList.add('kc-pressed'); setTimeout(() => btn.classList.remove('kc-pressed'), 120); }
    press(action);
  });

  window.KnoxCalc = {
    onOpen() { st.error = ''; render(); root.querySelector('.kc-title')?.focus({ preventScroll: true }); },
    press, state: st,
  };
  render();
})();
