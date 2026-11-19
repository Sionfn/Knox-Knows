/* Knox Knows landing page (December 2026): the hero tour, live previews of
   every mode, every grade and the iPhone app. Pairs with landing.css.
   Nothing here talks to a server; every preview is drawn on the page. */
(function () {
  'use strict';

  // The App Store link (Knox Knows, app id 6833644500). Every App Store button
  // uses it. Emptying it turns the buttons back into "Coming soon to the App Store".
  var APP_STORE_URL = 'https://apps.apple.com/app/id6833644500';

  // Opening the page always starts at the top, so the hero is never half under the
  // header (browsers bring back an old scroll spot on reload). Links to a section
  // (#pricing…) and coming back from Privacy/Terms keep their place.
  try {
    if (!location.hash && sessionStorage.getItem('knoxLandingReturnPending') !== '1') {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
    }
  } catch (_) {}

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cssVar = function (name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; };

  // ── App Store buttons ──────────────────────────────────────────────────
  $$('[data-appstore]').forEach(function (a) {
    if (APP_STORE_URL) { a.href = APP_STORE_URL; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Download Knox Knows on the App Store'); }
    else {
      a.classList.add('soon');
      var small = a.querySelector('small'); if (small) small.textContent = 'Coming soon to the';
      a.setAttribute('aria-label', 'Knox Knows for iPhone, coming soon to the App Store');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var app = document.getElementById('get-the-app');
        if (app && !app.contains(a)) { if (window.smoothScroll) window.smoothScroll('get-the-app', e); else app.scrollIntoView({ behavior: 'smooth' }); }
      });
    }
  });

  // ── Confetti in Knox colors ────────────────────────────────────────────
  function confetti(host, count) {
    if (reduced || !host || !host.animate) return;
    var box = document.createElement('div'); box.className = 'kl-confetti'; host.appendChild(box);
    var colors = ['#FF6B00', '#CE82FF', '#58CC02', '#1CB0F6', '#FFD900', '#FF4B4B'];
    var w = host.clientWidth, h = host.clientHeight;
    for (var k = 0; k < (count || 60); k++) {
      var p = document.createElement('i');
      p.style.background = colors[k % colors.length];
      if (k % 5 === 0) { p.style.width = '8px'; p.style.height = '8px'; p.style.borderRadius = '50%'; }
      box.appendChild(p);
      var dx = (Math.random() - 0.5) * w * 1.1, up = -(h * 0.18 + Math.random() * h * 0.3);
      p.animate([
        { transform: 'translate(-50%, 0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + (dx * 0.55) + 'px), ' + up + 'px) rotate(' + (Math.random() * 360) + 'deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), ' + (h * 0.75) + 'px) rotate(' + (Math.random() * 900) + 'deg)', opacity: 0 }
      ], { duration: 1700 + Math.random() * 900, easing: 'cubic-bezier(.2,.65,.4,1)', fill: 'forwards' });
    }
    setTimeout(function () { box.remove(); }, 2900);
  }

  // Plays a demo when it scrolls into view (and stops it when it leaves).
  function whenSeen(el, onIn, onOut, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { onIn(); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) onIn(); else if (onOut) onOut(); });
    }, { threshold: threshold || 0.35 }).observe(el);
  }

  // Where an element sits inside a container (CSS pixels — safe with the page zoom).
  function offsetIn(el, root) {
    var x = 0, y = 0;
    while (el && el !== root) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    return { x: x, y: y };
  }

  // ── HERO TOUR (real recordings of the iPhone app) ──────────────────────
  // One recording per step. Only the playing one is loaded and played; the
  // others wait (preload="none"), so the page stays light.
  var playClip = function (v) {
    if (!v) return;
    try { v.currentTime = 0; } catch (_) {}
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  };
  var tour = document.getElementById('klTour');
  if (tour) {
    var scenes = $$('.kl-scene', tour), steps = $$('.kl-step', tour), nextBtn = $('#klNext'), caption = $('.kl-caption', tour);
    var at = -1, timer = null, seen = false, inView = false, hovering = false;
    var running = function () { return inView && !hovering && !document.hidden; };
    var schedule = function () {
      clearTimeout(timer);
      steps.forEach(function (b) { b.classList.remove('running'); });
      var v = at >= 0 ? $('video', scenes[at]) : null;
      if (!running() || at < 0) { if (v) v.pause(); return; }
      if (v && v.paused && !v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      void steps[at].offsetWidth;
      steps[at].classList.add('running');
      timer = setTimeout(function () { show(at + 1); }, +scenes[at].dataset.dur || 7000);
    };
    var show = function (n) {
      at = (n + scenes.length) % scenes.length;
      scenes.forEach(function (s, k) {
        s.classList.toggle('on', k === at);
        var v = $('video', s); if (v && k !== at) v.pause();
      });
      // The next clip starts loading while this one plays.
      var next = $('video', scenes[(at + 1) % scenes.length]); if (next && next.preload === 'none') next.preload = 'auto';
      if (reduced) { var still = $('video', scenes[at]); if (still) still.preload = 'auto'; }
      else playClip($('video', scenes[at]));
      steps.forEach(function (b, k) { b.classList.toggle('on', k === at); b.setAttribute('aria-current', k === at ? 'step' : 'false'); });
      steps[at].style.setProperty('--dur', (+scenes[at].dataset.dur || 7000) + 'ms');
      var mode = Array.prototype.find.call(steps[at].classList, function (c) { return c.indexOf('m-') === 0; });
      nextBtn.className = 'kl-next ' + mode;
      caption.textContent = $('strong', steps[at]).textContent + ' — ' + $('em', steps[at]).textContent;
      if (reduced) { clearTimeout(timer); return; }
      schedule();
    };
    steps.forEach(function (b, k) { b.addEventListener('click', function () { show(k); }); });
    nextBtn.addEventListener('click', function () { show(at + 1); });
    // Looking closely? Hold still while the pointer is on the tour.
    tour.addEventListener('mouseenter', function () { hovering = true; schedule(); });
    tour.addEventListener('mouseleave', function () { hovering = false; schedule(); });
    document.addEventListener('visibilitychange', schedule);
    whenSeen(tour, function () { inView = true; if (!seen) { seen = true; show(0); } else schedule(); }, function () { inView = false; schedule(); }, 0.25);
  }

  // A looping recording that plays only while it's on screen.
  var loopWhenSeen = function (v) {
    if (!v) return;
    if (reduced) { v.preload = 'auto'; return; }
    whenSeen(v, function () { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); }, function () { v.pause(); }, 0.3);
  };

  // ── ASK KNOX (examples that type, think and answer) ────────────────────
  var EXAMPLES = {
    math: { q: 'What’s the derivative of 3x² + 5x − 2?',
      a: '<p>The derivative is <b>6x + 5</b>.</p><p>Use the <b>power rule</b>: bring the exponent down in front, then subtract one from it.</p><ul><li>3x² → <b>6x</b></li><li>5x → <b>5</b></li><li>−2 → <b>0</b> (constants disappear)</li></ul><div class="kl-ansbox"><span>ANSWER</span>6x + 5</div>' },
    science: { q: 'Why is the sky blue?',
      a: '<p>Sunlight has every color in it. As it passes through the air, tiny gas molecules scatter <b>short wavelengths</b> (blue) much more than long ones (red).</p><p>That’s called <b>Rayleigh scattering</b>: blue light gets bounced all over the sky, so it reaches your eyes from every direction.</p><div class="kl-ansbox"><span>ANSWER</span>Air scatters blue light the most</div>' },
    history: { q: 'What caused World War 1?',
      a: '<p>A common way to remember the main causes is <b>MAIN</b>:</p><ul><li><b>Militarism</b>: countries built up huge armies</li><li><b>Alliances</b>: one fight pulled in every ally</li><li><b>Imperialism</b>: competition for colonies</li><li><b>Nationalism</b>: intense national pride and rivalry</li></ul><p>The spark: the assassination of <b>Archduke Franz Ferdinand</b> in June 1914.</p>' },
    writing: { q: 'Is this a strong thesis? “Social media is bad.”',
      a: '<p>It’s a start, but it’s <b>too broad</b> to argue. A strong thesis takes a clear position and names your <b>reasons</b>.</p><p>Try: <i>“Social media hurts teens’ sleep and focus, because endless feeds are built to keep them scrolling.”</i></p><p>Now each reason can become a body paragraph.</p>' }
  };
  var ask = document.getElementById('klAsk');
  if (ask) {
    var body = $('.kl-window-body', ask), askTabs = $$('.kl-tabs button', ask), askTimers = [], askSeen = false;
    var bar = document.createElement('div');
    bar.className = 'kl-typebar'; bar.style.cssText = 'position:static;margin:0 20px 18px;height:48px;font-size:14px';
    bar.innerHTML = '<span class="kl-plus" style="width:34px;height:34px">+</span><span class="kl-typed">Ask Knox anything…</span><span class="kl-send" style="width:34px;height:34px"><svg><use href="#kli-send"/></svg></span>';
    ask.appendChild(bar);
    var typed = $('.kl-typed', bar);
    var later = function (fn, ms) { askTimers.push(setTimeout(fn, ms)); };
    var play = function (key) {
      askTimers.forEach(clearTimeout); askTimers = [];
      askTabs.forEach(function (b) { b.classList.toggle('on', b.dataset.ex === key); b.setAttribute('aria-selected', b.dataset.ex === key); });
      var ex = EXAMPLES[key];
      body.innerHTML = '';
      var follow = '<div class="kl-follow"><span style="--f:#CE82FF;--fd:#9B59B6">✨ Explain simpler</span><span style="--f:#1CB0F6;--fd:#0A85C2">🔁 Similar problem</span><span style="--f:#58CC02;--fd:#46A302">🃏 Make flashcards</span></div>';
      var html = '<div class="kl-me" style="opacity:0"><div class="kl-bubble"></div></div>' +
        '<div class="kl-knox" style="opacity:0"><img class="kl-av" src="./knox-logo-square.jpg" alt=""><div style="flex:1;min-width:0"><span class="kl-label">KNOX</span>' +
        '<div class="kl-stack"><div class="kl-dots"><i></i><i></i><i></i></div><div class="kl-answer kl-writing">' + ex.a + '</div></div>' + follow + '</div></div>';
      body.innerHTML = html;
      $('.kl-bubble', body).textContent = ex.q;
      var me = $('.kl-me', body), knox = $('.kl-knox', body), dots = $('.kl-dots', body), ans = $('.kl-answer', body), fol = $('.kl-follow', body);
      if (reduced) { me.style.opacity = 1; knox.style.opacity = 1; dots.style.opacity = 0; fol.style.opacity = 1; typed.textContent = 'Ask Knox anything…'; return; }
      // Type the question, send it, think, then write the answer in.
      typed.innerHTML = '<span class="kl-typing"></span><span class="kl-caret"></span>';
      var out = $('.kl-typing', bar), n = 0, speed = Math.max(18, Math.min(42, 1300 / ex.q.length));
      (function type() { if (n <= ex.q.length) { out.textContent = ex.q.slice(0, n++); later(type, speed); } else { later(send, 260); } })();
      function send() {
        typed.textContent = 'Ask Knox anything…';
        me.classList.add('kl-reveal-in');
        later(function () { knox.classList.add('kl-reveal-in'); }, 450);
        later(function () {
          dots.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
          ans.style.setProperty('--wd', Math.max(1.1, Math.min(2.4, ans.offsetHeight / 120)) + 's');
          ans.classList.add('go');
        }, 1750);
        later(function () { fol.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 350, fill: 'forwards' }); }, 1750 + Math.max(1100, Math.min(2400, ans.offsetHeight * 8.3)) + 150);
      }
    };
    askTabs.forEach(function (b) { b.addEventListener('click', function () { play(b.dataset.ex); }); });
    whenSeen(ask, function () { if (!askSeen) { askSeen = true; play('math'); } });
  }

  // ── LEARN (a lesson you can actually play) ─────────────────────────────
  var LESSON = [
    { say: 'To solve <b>3x + 5 = 20</b>, undo what was done to x, in reverse order. What should we undo first?',
      choices: [['The + 5', true], ['The × 3', false], ['The 20', false]],
      hint: 'The + 5 happened last, so undo it first.',
      wrong: 'Not quite. Undo the + 5 before the × 3.',
      right: 'Yes! Subtract 5 from both sides: <b>3x = 15</b>.' },
    { say: 'Now we have <b>3x = 15</b>. What is x?',
      choices: [['x = 12', false], ['x = 5', true], ['x = 45', false]],
      hint: 'x is multiplied by 3. What undoes multiplying?',
      wrong: 'Close! Divide both sides by 3 instead.',
      right: 'Exactly: 15 ÷ 3 = <b>5</b>.' },
    { say: 'Always check your answer. Is <b>3(5) + 5 = 20</b>?',
      choices: [['Yes, 15 + 5 = 20', true], ['No', false]],
      hint: 'Multiply first: 3 × 5 = 15. Then add 5.',
      wrong: 'Try it again: 3 × 5 = 15, and 15 + 5 = …?',
      right: 'It checks out. <b>x = 5</b> is right!' }
  ];
  var lesson = document.getElementById('klLesson');
  if (lesson) {
    var lbody = $('.kl-window-body', lesson), step = 0;
    var dots = function () {
      return '<div class="kl-progress">' + LESSON.map(function (_, k) { return '<i class="' + (k <= step ? 'on' : '') + '"></i>'; }).join('') + '<span>Step ' + (step + 1) + ' of ' + LESSON.length + '</span></div>';
    };
    var renderStep = function () {
      var s = LESSON[step];
      lbody.innerHTML = '<div class="kl-knox kl-reveal-in" style="margin-top:0"><img class="kl-av" src="./knox-logo-square.jpg" alt=""><div style="flex:1;min-width:0"><span class="kl-label">KNOX</span>' +
        '<div class="kl-answer"><p>' + s.say + '</p><div class="kl-turn"><span class="kl-turn-label">YOUR TURN</span>' +
        s.choices.map(function (c, k) { return '<button type="button" class="kl-choice" data-k="' + k + '">' + c[0] + '</button>'; }).join('') +
        '</div><div class="kl-msg" aria-live="polite"></div>' +
        '<div class="kl-lesson-foot"><button type="button" class="kl-hint">💡 Hint</button>' + dots() + '</div></div></div></div>';
      var msg = $('.kl-msg', lbody);
      $('.kl-hint', lbody).addEventListener('click', function () { msg.className = 'kl-msg tip'; msg.innerHTML = '💡 ' + s.hint; });
      $$('.kl-choice', lbody).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ok = s.choices[+btn.dataset.k][1];
          if (!ok) {
            btn.classList.remove('wrong'); void btn.offsetWidth; btn.classList.add('wrong');
            msg.className = 'kl-msg bad'; msg.innerHTML = s.wrong;
            setTimeout(function () { btn.classList.remove('wrong'); }, 900);
            return;
          }
          btn.classList.add('right');
          $$('.kl-choice', lbody).forEach(function (b) { b.disabled = true; });
          msg.className = 'kl-msg good'; msg.innerHTML = '✓ ' + s.right;
          setTimeout(function () { step++; if (step < LESSON.length) renderStep(); else finish(); }, 1500);
        });
      });
    };
    var finish = function () {
      lbody.innerHTML = '<div class="kl-complete kl-reveal-in"><span class="kl-badge">🎓 Lesson complete!</span>' +
        '<p><b>What you learned:</b> undo + and − first, then × and ÷, and check your answer by plugging it back in.</p>' +
        '<div class="kl-cta-row" style="justify-content:center;margin-top:18px"><button type="button" class="kl-btn kl-btn-mode m-purple" style="height:48px;font-size:15px">Try it again</button>' +
        '<a class="kl-btn kl-btn-plain" style="height:48px;font-size:15px" href="/app?open=learn">Start a real lesson →</a></div></div>';
      confetti(lbody, 70);
      $('button', lbody).addEventListener('click', function () { step = 0; renderStep(); });
    };
    renderStep();
  }

  // ── SNAP (a real recording of the camera in the app) ───────────────────
  loopWhenSeen($('#klSnap video'));

  // ── FLASHCARDS (flip, grade, score) ────────────────────────────────────
  var CARDS = [
    ['What does the mitochondria do?', 'Makes energy (ATP) for the cell'],
    ['What is photosynthesis?', 'How plants turn light, water and CO₂ into sugar and oxygen'],
    ['What carries genetic information?', 'DNA'],
    ['What do red blood cells do?', 'Carry oxygen around the body']
  ];
  var deck = $('#klDeck .kl-deck');
  if (deck) {
    var queue, flipped, done, counts, missed;
    var start = function () { queue = [0, 1, 2, 3]; flipped = false; done = 0; counts = { again: 0, good: 0, easy: 0 }; missed = {}; render(); };
    var render = function () {
      if (!queue.length) return score();
      var c = CARDS[queue[0]], total = done + queue.length;
      deck.innerHTML = '<div class="kl-deck-top"><span>' + done + ' REVIEWED</span><span>' + queue.length + ' TO GO</span></div>' +
        '<div class="kl-bar" style="margin-bottom:14px"><i style="width:' + Math.round(100 * done / total) + '%"></i></div>' +
        '<div class="kl-flip kl-reveal-in" role="button" tabindex="0" aria-label="Flip the card"><div class="kl-flip-in">' +
        '<div class="kl-face"><span class="kl-face-label">QUESTION</span><p></p><small style="font-weight:800;color:var(--app-soft)">Tap to flip</small></div>' +
        '<div class="kl-face back"><span class="kl-face-label">ANSWER</span><p></p></div></div></div>' +
        '<div class="kl-grades off"><button type="button" class="g-again" data-g="again">Again<small>Show again</small></button><button type="button" class="g-good" data-g="good">Good<small>Got it</small></button><button type="button" class="g-easy" data-g="easy">Easy<small>Knew it!</small></button></div>';
      var faces = $$('.kl-face p', deck); faces[0].textContent = c[0]; faces[1].textContent = c[1];
      var flip = $('.kl-flip', deck), inner = $('.kl-flip-in', deck), grades = $('.kl-grades', deck);
      var turn = function () { flipped = !flipped; inner.style.transform = flipped ? 'rotateY(180deg)' : ''; grades.classList.toggle('off', !flipped); };
      flip.addEventListener('click', turn);
      flip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); turn(); } });
      $$('button', grades).forEach(function (b) {
        b.addEventListener('click', function () {
          var g = b.dataset.g, id = queue.shift();
          counts[g]++;
          if (g === 'again') { missed[id] = true; queue.splice(Math.min(queue.length, 2), 0, id); } else done++;
          flipped = false;
          // The card leaves by its frame (fading the spinning card itself breaks the flip).
          flip.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-140px)', opacity: 0 }], { duration: reduced ? 1 : 260, fill: 'forwards' })
            .onfinish = render;
        });
      });
    };
    var score = function () {
      var knew = done - Object.keys(missed).length, pct = Math.round(100 * knew / Math.max(1, done));
      deck.innerHTML = '<div class="kl-done kl-reveal-in"><h5>Deck done! 🎉</h5><div class="kl-ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="45"/><circle class="fg" cx="50" cy="50" r="45"/></svg><b>' + pct + '%<small>FIRST TRY</small></b></div>' +
        '<p style="font-weight:800;color:var(--text-body)">You knew ' + knew + ' of ' + done + ' cards the first time.</p>' +
        '<div class="kl-gchips"><span class="g-easy">Easy ' + counts.easy + '</span><span class="g-good">Good ' + counts.good + '</span><span class="g-again">Again ' + counts.again + '</span></div>' +
        '<button type="button" class="kl-btn kl-btn-mode m-green" style="height:46px;font-size:15px;margin-top:10px">Practice again</button></div>';
      var fg = $('.fg', deck);
      fg.style.transition = reduced ? 'none' : 'stroke-dashoffset 1s .25s ease-out';
      requestAnimationFrame(function () { requestAnimationFrame(function () { fg.style.strokeDashoffset = 283 * (1 - pct / 100); }); });
      confetti(deck, 60);
      $('button', deck).addEventListener('click', start);
    };
    start();
  }

  // Memory curve: drawn when it comes into view.
  var curve = document.getElementById('klCurve');
  if (curve) {
    whenSeen(curve, function () { curve.classList.add('play'); });
  }

  // ── CALCULATOR GRAPH ───────────────────────────────────────────────────
  function canvasLoop(canvas, draw) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d'), raf = 0, t0 = 0;
    var size = function () {
      var r = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * r)) { canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); }
      ctx.setTransform(r, 0, 0, r, 0, 0);
      return { w: w, h: h };
    };
    var frame = function (now) { if (!t0) t0 = now; var s = size(); draw(ctx, s.w, s.h, (now - t0) / 1000); if (!reduced) raf = requestAnimationFrame(frame); };
    var go = function () { if (!raf) { t0 = 0; raf = requestAnimationFrame(frame); } };
    var stop = function () { cancelAnimationFrame(raf); raf = 0; };
    if (reduced) { var s = size(); draw(ctx, s.w, s.h, 99); return { restart: function () { var s2 = size(); draw(ctx, s2.w, s2.h, 99); } }; }
    whenSeen(canvas, go, stop, 0.2);
    return { restart: function () { t0 = 0; } };
  }
  canvasLoop(document.getElementById('klGraph'), function (ctx, w, h, t) {
    var text = cssVar('--text', '#3C3C3C'), line = cssVar('--border', '#E5E5E5'), blue = '#1CB0F6';
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h * 0.68, sx = w / 9, sy = h / 9.5;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (var gx = -4; gx <= 4; gx++) { ctx.beginPath(); ctx.moveTo(cx + gx * sx, 0); ctx.lineTo(cx + gx * sx, h); ctx.stroke(); }
    for (var gy = -2; gy <= 6; gy++) { ctx.beginPath(); ctx.moveTo(0, cy - gy * sy); ctx.lineTo(w, cy - gy * sy); ctx.stroke(); }
    ctx.strokeStyle = text; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke(); ctx.globalAlpha = 1;
    var cycle = t % 7, p = Math.min(1, cycle / 1.6), x0 = -3.2, x1 = 3.2, xe = x0 + (x1 - x0) * p;
    ctx.strokeStyle = blue; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath();
    for (var x = x0; x <= xe; x += 0.04) { var y = x * x - 4, X = cx + x * sx, Y = cy - y * sy; if (x === x0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.stroke();
    if (cycle > 1.6) {
      var u = Math.sin((cycle - 1.6) * 1.2) * 2.6, py = u * u - 4, PX = cx + u * sx, PY = cy - py * sy;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = blue; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(PX, PY, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.font = '800 12px Nunito, sans-serif'; ctx.fillStyle = text;
      ctx.fillText('(' + u.toFixed(1) + ', ' + py.toFixed(1) + ')', Math.min(w - 70, PX + 10), Math.max(16, PY - 10));
    }
    ctx.font = '900 13px Nunito, sans-serif'; ctx.fillStyle = blue; ctx.fillText('y = x² − 4', 12, 20);
  });

  // ── SIMULATION (projectile with an angle slider) ───────────────────────
  var angleIn = document.getElementById('klSimAngle'), angleOut = document.getElementById('klSimAngleOut');
  var sim = canvasLoop(document.getElementById('klSim'), function (ctx, w, h, t) {
    var text = cssVar('--text', '#3C3C3C'), line = cssVar('--border', '#E5E5E5');
    var ang = (+(angleIn && angleIn.value) || 45) * Math.PI / 180, v = 20, g = 9.8;
    var flight = 2 * v * Math.sin(ang) / g, range = v * v * Math.sin(2 * ang) / g;
    var maxRange = v * v / g, ground = h - 26, sx = (w - 40) / maxRange, sy = (ground - 16) / (v * v / (2 * g));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = line; ctx.fillRect(0, ground, w, 3);
    var tt = reduced ? flight : Math.min(flight, (t % (flight + 1.2)) * 1.5);
    ctx.setLineDash([4, 6]); ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (var s = 0; s <= tt; s += 0.02) { var X = 20 + v * Math.cos(ang) * s * sx, Y = ground - (v * Math.sin(ang) * s - g * s * s / 2) * sy; if (s === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]);
    var bx = 20 + v * Math.cos(ang) * tt * sx, by = ground - (v * Math.sin(ang) * tt - g * tt * tt / 2) * sy;
    ctx.fillStyle = '#FF6B00'; ctx.strokeStyle = '#CC5500'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by - 7, 7, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '800 12px Nunito, sans-serif'; ctx.fillStyle = text;
    ctx.fillText('Lands at ' + range.toFixed(1) + ' m', 12, 20);
  });
  if (angleIn) angleIn.addEventListener('input', function () { angleOut.textContent = angleIn.value + '°'; if (sim) sim.restart(); });

  // ── EVERY GRADE ────────────────────────────────────────────────────────
  var GRADES = {
    elementary: [['Math', 'orange', 'How do I add 3/8 + 1/4?'], ['Science', 'green', 'Why does the moon change shape?'], ['Reading', 'purple', 'What is the main idea of a story?'], ['Social studies', 'blue', 'What are the three branches of government?']],
    middle: [['Math', 'orange', 'What is 3/4 + 2/3?'], ['Science', 'green', 'What’s the difference between weather and climate?'], ['English', 'purple', 'What is a metaphor? Give me an example.'], ['History', 'blue', 'Why did the colonies want independence from Britain?']],
    high: [['Algebra', 'orange', 'How do I solve x² − 5x + 6 = 0?'], ['Chemistry', 'green', 'How do I balance H₂ + O₂ → H₂O?'], ['English', 'purple', 'Help me write a thesis about The Great Gatsby.'], ['Spanish', 'blue', 'When do I use ser and when do I use estar?']],
    ap: [['AP Calculus', 'orange', 'Find the derivative of sin(x²).'], ['AP Biology', 'green', 'How does the electron transport chain make ATP?'], ['AP US History', 'blue', 'What were the causes and effects of the New Deal?'], ['AP Lang', 'purple', 'How do I analyze rhetorical choices in a speech?']],
    college: [['Statistics', 'orange', 'When do I use a t-test instead of a z-test?'], ['Organic Chem', 'green', 'Why are SN2 reactions fastest at primary carbons?'], ['Economics', 'blue', 'What happens to the price when supply falls?'], ['Psychology', 'purple', 'Classical vs. operant conditioning: what’s the difference?']]
  };
  var gradeBox = document.getElementById('klGrades'), gradeTabs = $$('.kl-grade-tabs button');
  if (gradeBox) {
    var showGrade = function (g) {
      gradeTabs.forEach(function (b) { b.classList.toggle('on', b.dataset.grade === g); b.setAttribute('aria-selected', b.dataset.grade === g); });
      gradeBox.innerHTML = GRADES[g].map(function (q, k) {
        return '<a class="kl-card kl-q m-' + q[1] + ' swap" style="animation-delay:' + (k * 60) + 'ms" href="/app"><span class="kl-tag">' + q[0] + '</span><p></p><span class="go">Ask Knox →</span></a>';
      }).join('');
      $$('.kl-q p', gradeBox).forEach(function (p, k) { p.textContent = GRADES[g][k][2]; });
    };
    gradeTabs.forEach(function (b) { b.addEventListener('click', function () { showGrade(b.dataset.grade); }); });
    showGrade('middle');
  }

  // ── THE IPHONE APP (two phones playing real recordings) ───────────────
  var phones = document.getElementById('klAppPhones');
  if (phones) {
    var phone = function (clip, cls) {
      var p = document.createElement('div');
      p.className = 'kl-phone kl-rec-phone ' + cls;
      p.innerHTML = '<div class="kl-screen"><video class="kl-rec" muted playsinline loop preload="none" poster="/media/landing/' + clip + '.jpg" src="/media/landing/' + clip + '.mp4"></video></div>';
      phones.appendChild(p);
      return $('video', p);
    };
    var backClip = phone('3-learn', 'back'), frontClip = phone('5-home', 'front');
    var widget = document.createElement('div');
    widget.className = 'kl-widget';
    widget.innerHTML = '<span class="kl-emoji-flame" aria-hidden="true">🔥</span><b>18</b><small>day streak</small>';
    phones.appendChild(widget);
    loopWhenSeen(backClip); loopWhenSeen(frontClip);
  }
})();
