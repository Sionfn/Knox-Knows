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

  // ── HERO TOUR (one real recording of the iPhone app) ───────────────────
  // A single continuous video; each step is a stretch of it (data-start, in
  // seconds). The highlighted step and its progress bar follow the video, and
  // clicking a step (or Next step) jumps the video there. No gaps between
  // clips, so nothing freezes between steps.
  var tour = document.getElementById('klTour');
  if (tour) {
    var tv = $('#klTourVideo', tour), steps = $$('.kl-step', tour), nextBtn = $('#klNext'), caption = $('.kl-caption', tour);
    var starts = steps.map(function (b) { return +b.dataset.start || 0; });
    var at = -1, inView = false, raf = 0;
    var endOf = function (k) { return k + 1 < starts.length ? starts[k + 1] : (tv.duration || starts[k] + 9); };
    var stepAt = function (t) { var k = 0; for (var i = 0; i < starts.length; i++) if (t >= starts[i] - 0.04) k = i; return k; };
    var mark = function (k) {
      if (k === at) return;
      if (at >= 0) steps[at].style.setProperty('--p', 0);
      at = k;
      steps.forEach(function (b, i) { b.classList.toggle('on', i === k); b.setAttribute('aria-current', i === k ? 'step' : 'false'); });
      var mode = Array.prototype.find.call(steps[k].classList, function (c) { return c.indexOf('m-') === 0; });
      nextBtn.className = 'kl-next ' + mode;
      caption.textContent = $('strong', steps[k]).textContent + ' — ' + $('em', steps[k]).textContent;
    };
    var tick = function () {
      var t = tv.currentTime || 0, k = stepAt(t); mark(k);
      steps[k].style.setProperty('--p', Math.max(0, Math.min(1, (t - starts[k]) / Math.max(0.1, endOf(k) - starts[k]))));
      raf = !tv.paused ? requestAnimationFrame(tick) : 0;
    };
    var sync = function () {
      if (reduced) return;
      if (inView && !document.hidden) { var p = tv.play(); if (p && p.catch) p.catch(function () {}); } else tv.pause();
    };
    tv.addEventListener('play', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    tv.addEventListener('seeked', function () { if (!raf) tick(); });
    var go = function (k) {
      k = (k + starts.length) % starts.length;
      if (tv.preload !== 'auto') tv.preload = 'auto';
      try { tv.currentTime = starts[k] + 0.02; } catch (_) {}
      mark(k); if (!raf) tick(); sync();
    };
    steps.forEach(function (b, k) { b.addEventListener('click', function () { go(k); }); });
    nextBtn.addEventListener('click', function () { go(at + 1); });
    document.addEventListener('visibilitychange', sync);
    mark(0);
    whenSeen(tour, function () { inView = true; tv.preload = 'auto'; sync(); }, function () { inView = false; sync(); }, 0.25);
  }

  // A looping recording that plays only while it's on screen.
  var loopWhenSeen = function (v) {
    if (!v) return;
    if (reduced) { v.preload = 'auto'; return; }
    whenSeen(v, function () { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); }, function () { v.pause(); }, 0.3);
  };

  // ── ASK, LEARN, SNAP, FLASHCARDS: real recordings of the website and the iPhone app ──
  $$('.kl-feature .kl-rec-stage video, .kl-feature .kl-duo video').forEach(loopWhenSeen);

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
    // Plays through every grade on its own while the section is on screen
    // (pausing while the pointer is over it). Clicking a grade stops it there.
    var order = gradeTabs.map(function (b) { return b.dataset.grade; }), gAt = 0, gTimer = 0, gPicked = false, gSeen = false, gHover = false;
    var GRADE_MS = 4200;
    var gradeTick = function () {
      clearTimeout(gTimer);
      gradeTabs.forEach(function (b) { b.classList.remove('auto'); });
      if (gPicked || reduced || !gSeen || gHover || document.hidden) return;
      var on = gradeTabs[gAt]; void on.offsetWidth; on.style.setProperty('--gdur', GRADE_MS + 'ms'); on.classList.add('auto');
      gTimer = setTimeout(function () { gAt = (gAt + 1) % order.length; showGrade(order[gAt]); gradeTick(); }, GRADE_MS);
    };
    gradeTabs.forEach(function (b, k) { b.addEventListener('click', function () { gPicked = true; gAt = k; showGrade(b.dataset.grade); gradeTick(); }); });
    var gradeArea = gradeBox.parentElement;
    gradeArea.addEventListener('mouseenter', function () { gHover = true; gradeTick(); });
    gradeArea.addEventListener('mouseleave', function () { gHover = false; gradeTick(); });
    document.addEventListener('visibilitychange', gradeTick);
    showGrade(order[0]);
    whenSeen(gradeBox, function () { gSeen = true; gradeTick(); }, function () { gSeen = false; gradeTick(); }, 0.3);
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
    var backClip = phone('learn-full', 'back'), frontClip = phone('app-home', 'front');
    var widget = document.createElement('div');
    widget.className = 'kl-widget';
    // The same galaxy flame as the Home screen in the phone beside it (18 days).
    var galaxy = document.querySelector('.kl-flamecard .galaxy-flame');
    widget.innerHTML = '<span class="kl-emoji-flame kl-widget-flame" aria-hidden="true"></span><b>18</b><small>day streak</small>';
    if (galaxy) $('.kl-widget-flame', widget).appendChild(galaxy.cloneNode(true)); else $('.kl-widget-flame', widget).textContent = '🔥';
    phones.appendChild(widget);
    loopWhenSeen(backClip); loopWhenSeen(frontClip);
  }
})();
