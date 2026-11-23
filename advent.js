// advent.js — the Knox Advent Calendar (December 2026 study event).
//
// 25 doors, December 1–25. Studying on a day (a question, a Learn step or a
// Flashcards review; a Flame Shield covers a missed day) unlocks that day's
// door, and opening it gives its surprise: bonus questions, Flame Shields,
// the ❄️ Frost and ❤️ Ruby flames, and the big present behind door 25. Every
// door also has a little winter fact or study tip. The server
// (api/flame-fest.js, ?event=advent) keeps the doors and checks every open.
//
//   window.knoxAdvent.open()     — open the calendar (sidebar card, intro)
//   window.knoxAdvent.active()   — true in December (and on the preview)
//   ?advent=demo                 — a pretend December 9, for trying it early
//                                  (nothing is saved)
(function () {
  const pad = n => String(n).padStart(2, '0');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let demo = new URLSearchParams(location.search).get('advent') === 'demo';
  try { if (demo) sessionStorage.setItem('knoxAdventDemo', '1'); else demo = sessionStorage.getItem('knoxAdventDemo') === '1'; } catch (e) {}
  const preview = /preview|localhost|127\.0\.0\.1/.test(location.hostname);
  // Before December the preview shows the demo, so the calendar can be tried.
  const today = () => demo ? '2026-12-09' : localDay();
  const season = () => { const t = localDay(); return t >= '2026-12-01' && t <= '2026-12-31'; };
  if (preview && !season()) demo = true;
  const active = () => demo || season();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ki = html => window.KI?.fill ? window.KI.fill(html) : html;

  // A winter fact or study tip behind every door.
  const TREATS = [
    'Snowflakes have six sides because of how water molecules link up as they freeze.',
    'Study tip: explain today’s topic out loud as if you were teaching Knox. Gaps show up fast.',
    'Reindeer eyes turn from gold in summer to blue in winter to see better in the dark.',
    'Study tip: 25 minutes of focus, then a 5-minute break. Repeat. That’s the Pomodoro method.',
    'The first artificial Christmas trees were made in Germany from dyed goose feathers.',
    'Study tip: quiz yourself before you reread. Pulling an answer from memory makes it stick.',
    'The tradition of the Advent calendar started in Germany in the 1800s.',
    'Study tip: put your phone in another room while you study. Out of sight, out of mind.',
    'An average snowflake falls at about 3 miles per hour.',
    'Study tip: sleep is when your brain saves what you learned. Don’t trade it for cramming.',
    'Penguins live almost entirely in the Southern Hemisphere, so polar bears never meet them in the wild.',
    'Study tip: mix up topics when you practice. Switching subjects helps you remember both.',
    'Candy canes were around for centuries before they got their red stripes, in the early 1900s.',
    'Study tip: write a question on one side of a card and the answer on the other. Knox can help!',
    'The Arctic tern flies from the Arctic to Antarctica and back every year, the longest migration of any animal.',
    'Study tip: start with the hardest assignment while your brain is fresh.',
    'Most of the world’s fresh water is frozen in ice sheets and glaciers.',
    'Study tip: when you’re stuck, try drawing the problem. A quick sketch can unlock it.',
    'The largest snowflake ever reported was said to be 15 inches wide, in Montana in 1887.',
    'Study tip: review your notes the same day. A quick look now saves hours before a test.',
    'Hot chocolate goes back over 3,000 years, to cacao drinks in ancient Mesoamerica.',
    'Study tip: set one small goal for each study session, like “finish 10 flashcards.”',
    'A group of owls is called a parliament.',
    'Study tip: celebrate your streak. Small wins every day add up to big ones.',
    'Merry Christmas from Knox! Thanks for studying with us all month. 🦊',
  ];

  // ── Data ────────────────────────────────────────────────────────────────
  let state = null, loading = false, error = '', busy = 0;
  function demoState() {
    const studied = [1, 2, 3, 5, 6, 7, 8, 9], opened = [1, 2, 3, 5, 6, 7];
    const label = n => ({ 6: '🛡️ Flame Shield', 7: '❄️ Frost Flame', 13: '+10 bonus questions + 🛡️ Flame Shield', 17: '❤️ Ruby Flame', 20: '🛡️ Flame Shield', 24: '+15 bonus questions + 🛡️ Flame Shield', 25: '🎁 5 days of Mega Knox' }[n] || '+5 bonus questions');
    return { demo: true, tier: 'free', shields: 1, giftCode: '', doors: Array.from({ length: 25 }, (_, k) => { const n = k + 1; return { n, day: `2026-12-${pad(n)}`, studied: studied.includes(n), opened: opened.includes(n), label: label(n) }; }) };
  }
  async function api(method, body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Sign in to open your Advent Calendar.');
    const token = await user.getIdToken();
    const test = (() => { try { return sessionStorage.getItem('knoxFlameTest') === '1'; } catch (e) { return false; } })();
    const r = await fetch('/api/flame-fest' + (method === 'GET' ? '?event=advent' : ''), {
      method, headers: { 'Authorization': 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(test ? { 'X-Knox-Flame-Test': '1' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The Advent Calendar is busy right now. Please try again.');
    return j;
  }
  async function load() {
    if (demo) { state = state?.demo ? state : demoState(); return; }
    loading = true; error = ''; render();
    try { state = await api('GET'); } catch (e) { error = e.message; }
    loading = false;
  }

  // ── The calendar ─────────────────────────────────────────────────────────
  let wrap = null;
  // The look of each door: open, ready to open, today (study first), missed, or later.
  function doorState(d) {
    if (d.opened) return 'open';
    if (d.studied && d.day <= today()) return 'ready';
    if (d.day === today()) return 'today';
    if (d.day < today()) return 'missed';
    return 'later';
  }
  // The door's prize as one icon: its first emoji (bonus questions show a star).
  const prizeIcon = label => (String(label).match(/\p{Extended_Pictographic}\uFE0F?/u) || ['⭐'])[0];
  function door(d) {
    const s = doorState(d), big = d.n === 25;
    const inner = s === 'open' ? `<span class="adv-prize">${prizeIcon(d.label)}</span><span class="adv-n">${d.n}</span>`
      : s === 'ready' ? `<span class="adv-ribbon" aria-hidden="true"></span><span class="adv-n">${d.n}</span><span class="adv-cta">Open!</span>`
      : s === 'today' ? `<span class="adv-n">${d.n}</span><span class="adv-cta">Study today</span>`
      : s === 'missed' ? `<span class="adv-n">${d.n}</span><span class="adv-cta">❄️ Missed</span>`
      : `<span class="adv-n">${d.n}</span>`;
    const name = s === 'open' ? `Door ${d.n}, opened: ${d.label}` : s === 'ready' ? `Door ${d.n}, ready to open` : s === 'today' ? `Door ${d.n}: study today to open it` : s === 'missed' ? `Door ${d.n}, missed` : `Door ${d.n}, opens December ${d.n}`;
    return `<button type="button" class="adv-door is-${s}${big ? ' is-big' : ''}" data-door="${d.n}" aria-label="${esc(name)}"${s === 'later' ? ' aria-disabled="true"' : ''}>${inner}</button>`;
  }
  function render() {
    if (!wrap) return;
    const card = wrap.querySelector('.adv-card');
    if (!state && !error) { card.innerHTML = head() + '<p class="adv-note">Unwrapping your calendar…</p>'; return; }
    if (error && !state) { card.innerHTML = head() + `<p class="adv-note">${esc(error)}</p><div class="adv-actions"><button type="button" class="adv-btn" data-retry>Try again</button></div>`; return; }
    const doors = state.doors, opened = doors.filter(d => d.opened).length;
    card.innerHTML = head() +
      `<div class="adv-meta"><span><b>${opened}</b> of 25 opened</span><span>🛡️ <b>${state.shields || 0}</b> Flame Shield${state.shields === 1 ? '' : 's'}</span></div>` +
      `<div class="adv-grid">${doors.map(door).join('')}</div>` +
      (state.giftCode ? `<p class="adv-gift">🎁 Your Mega Knox week for a friend: <a href="/redeem?code=${esc(state.giftCode)}" target="_blank" rel="noopener">knoxknowsapp.com/redeem?code=${esc(state.giftCode)}</a></p>` : '') +
      `<p class="adv-note">Study any day in December (ask a question, do a Learn step or review flashcards) to open that day’s door. Missed a day? A 🛡️ Flame Shield saves it.${state.demo ? ' <b>Demo:</b> pretend it’s December 9. Nothing is saved.' : ''}</p>`;
    card.innerHTML = ki(card.innerHTML);
  }
  const head = () => `<button type="button" class="adv-x" data-close aria-label="Close">✕</button><div class="adv-head"><span class="adv-badge">🎄 December event</span><h2 id="advTitle">Knox <span>Advent Calendar</span></h2><p>A surprise behind every door. Door 25 is the big present!</p></div>`;

  // The prize card after a door opens (or when you look at an opened one).
  function reveal(d, fresh) {
    const pop = document.createElement('div');
    pop.className = 'adv-reveal';
    pop.innerHTML = ki(`<div class="adv-reveal-card" role="dialog" aria-modal="true" aria-labelledby="advRevealT"><span class="adv-reveal-n">Door ${d.n}</span><div class="adv-reveal-prize">${prizeIcon(d.label)}</div><h3 id="advRevealT">${fresh ? 'You got' : 'Behind this door'}: ${esc(d.label)}</h3><p>${esc(TREATS[d.n - 1])}</p><button type="button" class="adv-btn" data-done>${fresh ? 'Yay!' : 'Close'}</button></div>`);
    const done = () => { pop.remove(); wrap?.querySelector(`[data-door="${d.n}"]`)?.focus(); };
    pop.addEventListener('click', e => { if (e.target === pop || e.target.closest('[data-done]')) done(); });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    wrap.append(pop);
    pop.querySelector('[data-done]').focus();
  }
  async function openDoor(n) {
    const d = state?.doors?.[n - 1]; if (!d || busy) return;
    const s = doorState(d);
    if (s === 'open') { reveal(d, false); return; }
    const btn = wrap.querySelector(`[data-door="${n}"]`);
    const nudge = t => { const note = wrap.querySelector('.adv-note'); if (note) { note.textContent = t; note.classList.add('adv-flash'); setTimeout(() => note.classList.remove('adv-flash'), 1200); } };
    if (s === 'later') { nudge(`Door ${n} opens on December ${n}. Come back then!`); return; }
    if (s === 'today') { nudge('Ask Knox a question, do a Learn step or review flashcards today, then come back to open this door.'); return; }
    if (s === 'missed') { nudge(`You didn’t study on December ${n}, so this door stays shut. A 🛡️ Flame Shield saves a missed day next time.`); return; }
    busy = n;
    btn?.classList.add('is-opening');
    try {
      if (demo) { await new Promise(r => setTimeout(r, 450)); d.opened = true; }
      else { state = await api('POST', { advent: 'open', door: n }); window.knoxRefreshPlan?.(); window.knoxFlameFest?.applyFlameStyle?.(state.flameStyle); }
      const fresh = state.doors[n - 1];
      render();
      reveal(fresh, true);
    } catch (e) { btn?.classList.remove('is-opening'); nudge(e.message); }
    busy = 0;
  }

  // ── Open / close ─────────────────────────────────────────────────────────
  let lastFocus = null;
  async function open() {
    if (!window.currentUser && !demo) { window.openAuthModal?.('signup'); return; }
    if (wrap) return;
    lastFocus = document.activeElement;
    wrap = document.createElement('div');
    wrap.className = 'adv-wrap';
    wrap.innerHTML = '<div class="adv-card" role="dialog" aria-modal="true" aria-labelledby="advTitle"></div>';
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-retry]')) { load().then(render); return; }
      const d = e.target.closest('[data-door]'); if (d) openDoor(+d.dataset.door);
    });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(wrap);
    render();
    await load(); render();
    wrap?.querySelector('.adv-door.is-ready, .adv-x')?.focus();
  }
  function close() { if (!wrap) return; wrap.remove(); wrap = null; lastFocus?.focus?.(); }
  addEventListener('knox-auth-changed', () => { state = null; close(); syncCards(); });

  // ── Where it shows up ────────────────────────────────────────────────────
  // The promo cards (app.html) only show while the calendar is on.
  function syncCards() {
    document.querySelectorAll('.sidebar-advent-card').forEach(c => c.classList.toggle('adv-off', !active()));
  }
  // A one-time "the calendar is open" note on the app's welcome screen.
  function intro() {
    if (!active() || !window.currentUser) return;
    let seen = false; try { seen = localStorage.getItem('knoxAdventIntro') === '1'; } catch (e) {}
    if (seen || document.querySelector('.adv-intro')) return;
    const ws = document.getElementById('welcomeScreen'), badge = ws?.querySelector('.welcome-badge');
    if (!badge) return;
    const el = document.createElement('div');
    el.className = 'fall-tip adv-intro';
    el.setAttribute('role', 'note');
    el.innerHTML = ki('<span aria-hidden="true">🎄</span><span class="ft-text">The Knox Advent Calendar is open! Study each day to open a door.</span><button type="button" class="ft-btn">Open it</button><button type="button" class="ft-x" aria-label="Hide this note" title="Hide">×</button>');
    const hide = () => { el.remove(); try { localStorage.setItem('knoxAdventIntro', '1'); } catch (e) {} };
    el.querySelector('.ft-btn').addEventListener('click', () => { hide(); open(); });
    el.querySelector('.ft-x').addEventListener('click', hide);
    ws.querySelector('.fall-tip:not(.adv-intro)')?.remove(); // one tip at a time
    badge.before(el);
  }
  window.knoxAdvent = { open, active, close };
  syncCards();
  addEventListener('knox-auth-changed', () => setTimeout(intro, 400));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { syncCards(); setTimeout(intro, 800); }); else setTimeout(intro, 800);
})();
