// tour.js — "Show me around": a short guided tour for new accounts, and a
// one-time "What's new" walkthrough of the November 1 update for everyone
// who already had an account (shown once, Nov 1–30).
//
// Starts on its own the first time a new account (made in the last 3 days)
// opens the app, and replaces the old one-card welcome after sign-up. Each
// step lights up one part of the app in that section's color. Anyone can
// replay it from the profile menu ("Show me around").
//
//   window.knoxTour.start()   — run the tour now
//   window.knoxTour.pending() — true while a tour is waiting or running
//                               (Flame Fest's popup waits for it)
//   window.knoxTour.whatsNew() — run the Nov 1 "What's new" walkthrough now
//   ?tour=1                   — always run it (for trying it out)
(function () {
  if (window.knoxTour) return;
  const DAY = 864e5;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const seenKey = () => 'knoxTour.' + (window.currentUser?.uid || 'guest');
  const seen = () => { try { return localStorage.getItem(seenKey()) === '1'; } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(seenKey(), '1'); } catch (e) {} };
  const newsKey = () => 'knoxWhatsNewNov2026.' + (window.currentUser?.uid || 'guest');
  const newsSeen = () => { try { return localStorage.getItem(newsKey()) === '1'; } catch (e) { return false; } };
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  // checked: sign-in is known and we've decided whether to show anything, so
  // Flame Fest's popup (which waits on pending()) never jumps in first.
  let waiting = false, running = false, checked = false;

  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden'; };
  const pick = sel => [...document.querySelectorAll(sel)].find(visible) || null;
  const navIcon = nav => { const i = document.querySelector(`.sidebar-quicknav-link${nav} .sq-icon`); return i ? i.outerHTML : ''; };

  function steps(name) {
    const tier = window.userTier;
    const paid = tier === 'plus' || tier === 'mega' || tier === 'paid';
    const plan = tier === 'mega' ? '💎 Mega Knox' : '⚡ Knox Plus';
    const fest = window.knoxFlameFest?.active?.() ? ' This month, studying also lights your Flame Fest calendar for rewards.' : '';
    return [
      { color: 'orange', icon: '<img src="/knox-logo-square.jpg" alt="">', title: `Hi ${esc(name)}! I’m Knox`,
        text: 'Your study buddy for every subject. Let me show you around. It takes about 30 seconds.',
        next: 'Show me around', skip: 'Skip for now' },
      { color: 'orange', target: '#inputOuter', icon: navIcon('[data-nav="chat"]'), title: 'Ask Knox',
        text: 'Ask about any subject. Type it, snap a photo of your homework, or upload a PDF or Word file. Knox walks you through it step by step.' },
      { color: 'purple', target: '.sidebar-quicknav-link[data-nav="learn"]', icon: navIcon('[data-nav="learn"]'), title: 'Learn',
        text: 'Want to really get it? Learn teaches a topic one small step at a time and checks your answers as you go. It never just hands you the answer.' },
      { color: 'green', target: '.sidebar-quicknav-link.fc-nav', icon: navIcon('.fc-nav'), title: 'Flashcards',
        text: 'Make a deck from any topic or your notes, build your own, or import one. Knox brings cards back right when it’s time to review.' },
      { color: 'blue', target: '.sidebar-quicknav-link[data-nav="calculator"]', icon: navIcon('[data-nav="calculator"]'), title: 'Calculator',
        text: 'Basic and scientific. Got an answer you don’t understand? Tap Explain it and Learn shows you why.' },
      { color: 'orange', target: '#sidebarControlsSlot .account-status-row, #headerUsage', icon: '<span class="kt-emoji" aria-hidden="true">🔥</span>', title: paid ? 'Your plan and streak' : 'Your questions and streak',
        text: (paid ? `You’re on ${plan}, so ask as much as you like.` : 'The coin shows how many questions you have. You start with 10, and get 5 more every day (you can save up to 20).') + ' Study every day to grow your 🔥 streak.' + fest },
      { color: 'orange', icon: '<span class="kt-emoji" aria-hidden="true">🎉</span>', title: 'You’re all set!',
        text: 'Need help later? Open your profile menu and choose Help & support, or Show me around to see this again.',
        next: 'Ask my first question', done: true },
    ];
  }

  // The November 1 update, for students who already use Knox.
  function whatsNewSteps(name) {
    const tier = window.userTier;
    const fest = !!window.knoxFlameFest?.active?.();
    const mega = tier === 'mega'
      ? { text: 'You’re on Mega Knox. Thanks for being one of the first! Your private Mega lounge on Discord is open, and you get 40-card flashcard decks and the highest limits.' }
      : { text: 'A new plan above Knox Plus: 40-card flashcard decks you can customize, the highest limits, early access to new features and a private Mega lounge on Discord.' + (tier === 'plus' || tier === 'paid' ? '' : ' Try it free for 3 days.'),
          extra: { label: 'See Mega Knox', run: () => window.goToPricing?.() } };
    return [
      { color: 'orange', icon: '<img src="/knox-logo-square.jpg" alt="">', title: name === 'there' ? 'Big update!' : `Big update, ${esc(name)}!`,
        text: 'Knox Knows just got a lot better. Here’s what’s new for November. It takes about 30 seconds.',
        next: 'Show me', skip: 'Later' },
      { color: 'gold', target: '#appUpgradeBtn, #appAccountBtn', icon: '<span class="kt-emoji" aria-hidden="true">💎</span>', title: 'Meet Mega Knox', ...mega },
      { color: 'purple', target: '.sidebar-quicknav-link[data-nav="learn"]', icon: navIcon('[data-nav="learn"]'), title: 'Learn got smarter',
        text: 'Every lesson has a plan you can follow, Knox gives credit for the parts you got right, simple diagrams show the idea, and Review from your lessons brings back skills that were tricky.' },
      { color: 'green', target: '.sidebar-quicknav-link.fc-nav', icon: navIcon('.fc-nav'), title: 'Flashcards for everyone',
        text: 'On every plan now. Knox can make a deck from a topic, your notes, slides or photos, or you can build or import your own. Your decks follow you to any device.' },
      { color: 'orange', target: '#inputOuter', icon: navIcon('[data-nav="chat"]'), title: 'Bring your files',
        text: 'Upload a PDF, Word doc, PowerPoint or photo in Ask Knox and Learn, and Knox reads it with you.' },
      fest
        ? { id: 'fest', color: 'orange', target: '#streakPill', icon: '<span class="kt-emoji" aria-hidden="true">🔥</span>', title: 'Flame Fest is on!',
            text: 'All November, every day you study lights a flame on your calendar. Hit each week’s goal for rewards, and light 20 flames for the grand prize.',
            next: 'Open my calendar', skip: 'Done', finish: () => window.knoxFlameFest?.open() }
        : { color: 'orange', icon: '<span class="kt-emoji" aria-hidden="true">🎉</span>', title: 'That’s the big stuff!',
            text: 'There’s more, like gift codes and better answers in Ask Knox. See the full list any time on the What’s new page.',
            next: 'See everything new', skip: 'Done', finish: () => { location.href = '/updates'; } },
    ];
  }

  function start(opts = {}) {
    if (running) return;
    running = true; waiting = false;
    const first = (opts.name || window.currentUser?.displayName || '').split(' ')[0] || 'there';
    const news = opts.kind === 'news';
    if (news) { try { localStorage.setItem(newsKey(), '1'); } catch (e) {} } else markSeen();
    const list = news ? whatsNewSteps(first) : steps(first);
    let i = 0, spot = null;
    const layer = document.createElement('div');
    layer.className = 'kt-layer';
    const card = document.createElement('div');
    card.className = 'kt-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ktTitle');
    card.tabIndex = -1;
    layer.append(card);
    document.body.append(layer);
    document.body.classList.add('kt-open');

    function place() {
      const s = list[i];
      const target = s.target ? pick(s.target) : null;
      if (spot) { spot.remove(); spot = null; }
      layer.classList.toggle('kt-dim', !target);
      card.style.left = card.style.top = '';
      card.classList.toggle('kt-center', !target);
      if (!target) return;
      // Short laptops zoom the whole page (desktop-fit.js): work in its CSS pixels.
      const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, b = target.getBoundingClientRect();
      const r = { left: b.left / z, top: b.top / z, right: b.right / z, bottom: b.bottom / z, width: b.width / z, height: b.height / z }, pad = 6;
      const W = innerWidth / z, H = innerHeight / z;
      spot = document.createElement('div');
      spot.className = 'kt-spot';
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      layer.prepend(spot);
      // Beside the lit-up part when there's room (the sidebar), otherwise above or below it.
      const w = card.offsetWidth, h = card.offsetHeight, gap = 16;
      let x, y;
      if (r.right + pad + gap + w <= W - 12) { x = r.right + pad + gap; y = r.top + r.height / 2 - h / 2; }
      else { x = r.left + r.width / 2 - w / 2; y = r.top - pad - gap - h >= 12 ? r.top - pad - gap - h : r.bottom + pad + gap; }
      card.style.left = Math.max(12, Math.min(x, W - w - 12)) + 'px';
      card.style.top = Math.max(12, Math.min(y, H - h - 12)) + 'px';
    }
    function render() {
      const s = list[i], last = i === list.length - 1;
      layer.dataset.color = s.color;
      const dots = list.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('');
      card.innerHTML = `<button type="button" class="kt-x" aria-label="Close the tour">×</button>
        <div class="kt-head"><span class="kt-icon">${s.icon || ''}</span><h2 id="ktTitle">${s.title}</h2></div>
        <p>${esc(s.text)}</p>
        ${i === 0 && opts.welcomeEmail ? '<p class="kt-fine">We also sent a welcome email from support@knoxknowsapp.com.</p>' : ''}
        <div class="kt-foot${s.next ? ' kt-wide' : ''}"><div class="kt-dots" aria-label="Step ${i + 1} of ${list.length}">${dots}</div>
          <div class="kt-btns">${s.skip ? `<button type="button" class="kt-btn kt-ghost" data-act="end">${s.skip}</button>` : s.extra ? `<button type="button" class="kt-btn kt-ghost" data-act="extra">${esc(s.extra.label)}</button>` : i > 0 && !last ? '<button type="button" class="kt-btn kt-ghost" data-act="back">Back</button>' : ''}
          <button type="button" class="kt-btn kt-main" data-act="${last ? 'finish' : 'next'}">${s.next || 'Next'}</button></div></div>`;
      place();
      card.focus({ preventScroll: true });
      // Reached the Flame Fest step: the separate Flame Fest popup would repeat it.
      if (s.id === 'fest') { try { localStorage.setItem('knoxFlameFestIntro2026', '1'); } catch (e) {} }
    }
    function end(finish) {
      removeEventListener('resize', place);
      document.removeEventListener('keydown', key, true);
      layer.remove();
      document.body.classList.remove('kt-open');
      running = false;
      dispatchEvent(new Event('knox-tour-done'));
      if (typeof finish === 'function') finish();
      else if (finish) { window.appStartNewChat?.(); setTimeout(() => document.getElementById('appChatInput')?.focus({ preventScroll: true }), 60); }
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); }
      else if (e.key === 'ArrowRight' && i < list.length - 1) { i++; render(); }
      else if (e.key === 'ArrowLeft' && i > 0) { i--; render(); }
      else if (e.key === 'Tab') { // keep focus inside the card
        const b = [...card.querySelectorAll('button')], f = b[0], l = b[b.length - 1];
        if (e.shiftKey && (document.activeElement === f || document.activeElement === card)) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    }
    card.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('kt-x') || b.dataset.act === 'end') end(false);
      else if (b.dataset.act === 'back') { i--; render(); }
      else if (b.dataset.act === 'next') { i++; render(); }
      else if (b.dataset.act === 'extra') end(list[i].extra.run);
      else if (b.dataset.act === 'finish') end(list[i].finish || true);
    });
    addEventListener('resize', place);
    document.addEventListener('keydown', key, true);
    render();
  }

  // New accounts: wait until the app is on screen with nothing else open.
  function busy() { return [...document.querySelectorAll('.modal-backdrop, .ff-modal')].some(el => getComputedStyle(el).display !== 'none') || document.body.classList.contains('knox-flashcards'); }
  function maybeStart() {
    const u = window.currentUser;
    const forced = /[?&]tour=1\b/.test(location.search);
    if (!u || running || waiting) return;
    const made = Date.parse(u.metadata?.creationTime || '');
    const isNew = forced || (made && Date.now() - made < 3 * DAY && !seen());
    // Older accounts: once, during November, the "What's new" walkthrough instead.
    const news = !forced && !(made && Date.now() - made < 3 * DAY) && today() >= '2026-11-01' && today() <= '2026-11-30' && !newsSeen();
    if (!isNew && !news) return;
    if (!forced && /[?&]open=/.test(location.search)) return; // came here for something specific
    waiting = true;
    let tries = 0;
    (function check() {
      if (!waiting) return;
      if (!busy()) return start(news ? { kind: 'news' } : {});
      if (++tries < 40) setTimeout(check, 500); else { waiting = false; dispatchEvent(new Event('knox-tour-done')); }
    })();
  }
  addEventListener('knox-auth-changed', () => setTimeout(() => {
    maybeStart(); checked = true;
    if (!waiting && !running) dispatchEvent(new Event('knox-tour-done'));
  }, 900));

  window.knoxTour = { start, whatsNew: () => start({ kind: 'news' }), pending: () => !checked || waiting || running };
})();
