// calc-core.js — the Knox Calculator's math engine (no eval).
//
// KnoxMath.evaluate(text, { deg, ans }) → { value } or { error }
// Reads what students type or tap, the way a school calculator does:
//   12×(3+4)  2π  3(4)  (2)(3)  2sin(30)   implied multiplication
//   -3^2 = -9    2^3^2 = 2^9                powers bind tighter than minus, right to left
//   50%  2/50% = 4                          percent is postfix ÷100
//   5!  3²  4³                              postfix factorial and squares/cubes
//   √16  ∛27  sin cos tan  sin⁻¹ cos⁻¹ tan⁻¹  log ln  abs  10^x  e^x
//   π e Ans                                 constants and the last answer
// Missing ")" at the end are closed for you.
// KnoxMath.format(n) → a tidy string; KnoxMath.fraction(n) → "3/4" or "".
(function (root) {
  const FUNCS = {
    'sin⁻¹': 'asin', 'cos⁻¹': 'acos', 'tan⁻¹': 'atan',
    asin: 'asin', acos: 'acos', atan: 'atan',
    sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', abs: 'abs', sqrt: 'sqrt', cbrt: 'cbrt',
  };
  const FUNC_NAMES = Object.keys(FUNCS).sort((a, b) => b.length - a.length);

  // ── Tokens ────────────────────────────────────────────────────────────────
  function tokenize(text) {
    const s = String(text).replace(/\s+/g, '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      const num = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(s.slice(i));
      if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const fn = FUNC_NAMES.find(f => s.startsWith(f, i));
      if (fn) { out.push({ t: 'fn', v: FUNCS[fn] }); i += fn.length; if (s[i] === '(') { out.push({ t: '(' }); i++; } else out.push({ t: 'open-implicit' }); continue; }
      if (s.startsWith('Ans', i)) { out.push({ t: 'const', v: 'ans' }); i += 3; continue; }
      if (c === 'π') { out.push({ t: 'const', v: 'pi' }); i++; continue; }
      if (c === 'e') { out.push({ t: 'const', v: 'e' }); i++; continue; }
      if (c === '√') { out.push({ t: 'root', v: 2 }); i++; continue; }
      if (c === '∛') { out.push({ t: 'root', v: 3 }); i++; continue; }
      if ('+-−'.includes(c)) { out.push({ t: c === '+' ? '+' : '-' }); i++; continue; }
      if ('*×·'.includes(c)) { out.push({ t: '*' }); i++; continue; }
      if ('/÷'.includes(c)) { out.push({ t: '/' }); i++; continue; }
      if (c === '^') { out.push({ t: '^' }); i++; continue; }
      if (c === '²' || c === '³') { out.push({ t: 'pow', v: c === '²' ? 2 : 3 }); i++; continue; }
      if (c === '%' || c === '!') { out.push({ t: c }); i++; continue; }
      if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
      throw new CalcError("Knox can't read that");
    }
    return out;
  }
  class CalcError extends Error {}

  // ── Parser (recursive descent) ───────────────────────────────────────────
  function parse(tokens, opts) {
    let p = 0;
    const peek = () => tokens[p];
    const next = () => tokens[p++];
    const startsValue = tok => tok && ['num', 'const', '(', 'fn', 'root'].includes(tok.t);
    const D = opts.deg ? Math.PI / 180 : 1;
    const snap = x => (Math.abs(x) < 1e-12 ? 0 : Math.abs(x - Math.round(x)) < 1e-12 ? Math.round(x) : x);

    function expr() {
      let v = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t; const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        const tok = peek();
        if (tok && (tok.t === '*' || tok.t === '/')) {
          next(); const r = unary();
          if (tok.t === '/' && r === 0) throw new CalcError("Can't divide by 0");
          v = tok.t === '*' ? v * r : v / r;
        } else if (startsValue(tok)) {
          v *= unary(); // 2π, 3(4), (2)(3), 2sin(30)
        } else return v;
      }
    }
    function unary() {
      const tok = peek();
      if (tok && tok.t === '-') { next(); return -unary(); }
      if (tok && tok.t === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const base = postfix();
      if (peek() && peek().t === '^') { next(); return pow(base, unary()); } // right to left; -3^2 = -(3^2)
      return base;
    }
    function pow(a, b) {
      if (a < 0 && !Number.isInteger(b)) {
        // Odd roots of negatives are real: (-8)^(1/3) = -2
        const inv = 1 / b;
        if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2) return -Math.pow(-a, b);
        throw new CalcError('No real answer');
      }
      return Math.pow(a, b);
    }
    function postfix() {
      let v = primary();
      for (;;) {
        const tok = peek();
        if (!tok) return v;
        if (tok.t === '%') { next(); v = v / 100; }
        else if (tok.t === '!') { next(); v = factorial(v); }
        else if (tok.t === 'pow') { next(); v = Math.pow(v, tok.v); }
        else return v;
      }
    }
    function group() { // "(" expr ")" — a missing ")" at the very end is fine
      const v = expr();
      if (peek() && peek().t === ')') next();
      else if (peek()) throw new CalcError('Check your brackets');
      return v;
    }
    function primary() {
      const tok = next();
      if (!tok) throw new CalcError('Finish the problem');
      if (tok.t === 'num') return tok.v;
      if (tok.t === 'const') {
        if (tok.v === 'pi') return Math.PI;
        if (tok.v === 'e') return Math.E;
        if (!Number.isFinite(opts.ans)) throw new CalcError('No answer yet');
        return opts.ans;
      }
      if (tok.t === '(') return group();
      if (tok.t === 'root') {
        // √(25)% is (√25)%: a bracketed root finishes before any % or ! after it.
        const x = peek() && peek().t === '(' ? (next(), group()) : postfixOrUnary();
        if (tok.v === 2 && x < 0) throw new CalcError('No real answer');
        return tok.v === 2 ? Math.sqrt(x) : Math.cbrt(x);
      }
      if (tok.t === 'fn') {
        const open = next();
        const x = open && open.t === '(' ? group() : postfixOrUnary();
        return fn(tok.v, x);
      }
      if (tok.t === ')') throw new CalcError('Check your brackets');
      throw new CalcError('Finish the problem');
    }
    function postfixOrUnary() { // √-4 / √(…) / √16
      const tok = peek();
      if (tok && tok.t === '-') { next(); return -postfix(); }
      return postfix();
    }
    function fn(name, x) {
      switch (name) {
        case 'sin': return snap(Math.sin(x * D));
        case 'cos': return snap(Math.cos(x * D));
        case 'tan': {
          if (opts.deg && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) throw new CalcError('tan is undefined there');
          const c = Math.cos(x * D);
          if (Math.abs(c) < 1e-15) throw new CalcError('tan is undefined there');
          return snap(Math.tan(x * D));
        }
        case 'asin': case 'acos':
          if (x < -1 || x > 1) throw new CalcError('Use a number from −1 to 1');
          return snap(Math[name](x) / D);
        case 'atan': return snap(Math.atan(x) / D);
        case 'log': if (x <= 0) throw new CalcError('log needs a positive number'); return snap(Math.log10(x));
        case 'ln': if (x <= 0) throw new CalcError('ln needs a positive number'); return Math.log(x);
        case 'abs': return Math.abs(x);
        case 'sqrt': if (x < 0) throw new CalcError('No real answer'); return Math.sqrt(x);
        case 'cbrt': return Math.cbrt(x);
      }
      throw new CalcError("Knox can't read that");
    }
    function factorial(n) {
      if (n < 0 || !Number.isInteger(n)) throw new CalcError('! needs a whole number');
      if (n > 170) throw new CalcError('That number is too big');
      let r = 1;
      for (let k = 2; k <= n; k++) r *= k;
      return r;
    }

    if (!tokens.length) return null;
    const v = expr();
    while (peek() && peek().t === ')') throw new CalcError('Check your brackets');
    if (p < tokens.length) throw new CalcError("Knox can't read that");
    return v;
  }

  function evaluate(text, opts = {}) {
    try {
      const tokens = tokenize(text);
      // A trailing operator means the student is still typing.
      const last = tokens[tokens.length - 1];
      if (last && ['+', '-', '*', '/', '^', 'fn', 'root', '(', 'open-implicit'].includes(last.t)) return { error: 'Finish the problem', incomplete: true };
      const value = parse(tokens, { deg: opts.deg !== false, ans: opts.ans });
      if (value === null) return { value: null };
      if (!Number.isFinite(value)) return { error: Number.isNaN(value) ? 'Math error' : 'That number is too big' };
      return { value };
    } catch (err) {
      return { error: err instanceof CalcError ? err.message : 'Math error' };
    }
  }

  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
  function format(n) {
    if (n === null || n === undefined) return '';
    if (!Number.isFinite(n)) return 'Error';
    if (Object.is(n, -0) || Math.abs(n) < 1e-15) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e15 || abs < 1e-9) {
      const [m, e] = n.toExponential(8).split('e');
      return parseFloat(m) + ' × 10' + e.replace(/^\+/, '').split('').map(ch => SUP[ch]).join('');
    }
    return String(parseFloat(n.toPrecision(12)));
  }
  // Simple fractions for school answers: 0.75 → 3/4, 0.333… → 1/3 (denominators up to 1000).
  function fraction(n) {
    if (!Number.isFinite(n) || Number.isInteger(n) || Math.abs(n) > 1e6) return '';
    let [h0, h1, k0, k1, x] = [0, 1, 1, 0, Math.abs(n)];
    for (let i = 0; i < 25; i++) {
      const a = Math.floor(x);
      [h0, h1] = [h1, a * h1 + h0];
      [k0, k1] = [k1, a * k1 + k0];
      if (k1 > 1000) return '';
      if (Math.abs(h1 / k1 - Math.abs(n)) < 1e-10) return k1 === 1 ? '' : (n < 0 ? '−' : '') + h1 + '/' + k1;
      x = 1 / (x - a);
      if (!Number.isFinite(x)) break;
    }
    return '';
  }

  root.KnoxMath = { evaluate, format, fraction, tokenize };
})(typeof window !== 'undefined' ? window : globalThis);
