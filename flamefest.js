// flamefest.js — the Flame Fest calendar (November 2026 study event).
//
// Each day a student studies in November lights a flame. Weekly goals unlock
// rewards, and lighting 20 flames in the month unlocks the grand prize. The
// server (api/flame-fest.js) keeps the flames and checks every claim; this
// file only shows them.
//
//   window.knoxFlameFest.open()   — open the calendar (streak pill, sidebar card)
//   window.knoxFlameFest.active() — true from Nov 1 until rewards close (Dec 7)
//   window.knoxFlameFest.studied() — a Flashcards review: light today's flame
//   ?flamefest=demo               — a pretend month, for trying the screen
//                                   before November (nothing is saved)
// Also shows a one-time "Flame Fest is on" popup during the event.
(function () {
  const START = '2026-11-01', END = '2026-11-30', CLAIM_UNTIL = '2026-12-07';
  const demo = new URLSearchParams(location.search).get('flamefest') === 'demo';
  const pad = n => String(n).padStart(2, '0');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => demo ? '2026-11-18' : localDay();
  const active = () => demo || (today() >= START && today() <= CLAIM_UNTIL);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = { w1: '✨', w2: '🛡️', w3: '💙', w4: '🪵', month: '🦅' };
  const STYLE_NAMES = { classic: '🔥 Classic', purple: '💜 Purple Flame', blue: '💙 Blue Flame', gold: '👑 Golden Flame' };

  // ── Data ────────────────────────────────────────────────────────────────
  let state = null, loading = false, error = '';
  function demoState() {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
    const rewards = [
      { id: 'w1', name: 'Spark', start: '2026-11-01', end: '2026-11-07', need: 4, label: '+10 bonus questions' },
      { id: 'w2', name: 'Kindling', start: '2026-11-08', end: '2026-11-14', need: 4, label: '🛡️ Flame Shield' },
      { id: 'w3', name: 'Blaze', start: '2026-11-15', end: '2026-11-21', need: 4, label: '+10 bonus questions + 💙 Blue Flame' },
      { id: 'w4', name: 'Bonfire', start: '2026-11-22', end: '2026-11-28', need: 3, label: '🛡️ Flame Shield' },
      { id: 'month', name: 'Phoenix', start: '2026-11-01', end: '2026-11-30', need: 20, label: '7 days of Knox Plus + 👑 Golden Flame' },
    ].map(r => ({ ...r, flames: days.filter(d => d >= r.start && d <= r.end).length }));
    return { event: { start: START, end: END, claimUntil: CLAIM_UNTIL }, plus: false, rewards, days, shielded: ['2026-11-10'], claimed: { w1: 'demo' }, shields: 1, flameStyle: 'classic', flameStyles: ['classic'], plusUntil: 0, giftCode: '', demo: true };
  }
  async function api(method, body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Sign in to join Flame Fest.');
    const r = await fetch('/api/flame-fest', {
      method, headers: { 'Authorization': 'Bearer ' + await user.getIdToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Flame Fest is busy right now. Please try again.');
    return data;
  }
  async function load() {
    if (demo) { state = state || demoState(); return; }
    loading = true; error = ''; render();
    try { state = await api('GET'); } catch (e) { error = e.message; }
    loading = false;
  }

  // ── Calendar ────────────────────────────────────────────────────────────
  let wrap = null, lastFocus = null;
  function dayCell(n) {
    const key = `2026-11-${pad(n)}`, t = today();
    const lit = state.days.includes(key), shielded = state.shielded.includes(key);
    const cls = lit ? 'lit' : shielded ? 'shielded' : key < t ? 'missed' : key === t ? 'today' : 'future';
    const label = `November ${n}: ${lit ? 'flame lit' : shielded ? 'saved by a Flame Shield' : key < t ? 'no flame' : key === t ? 'today — study to light it' : 'coming up'}`;
    return `<div class="ff-day ${cls}${key === t ? ' is-today' : ''}" role="gridcell" aria-label="${label}"><span class="ff-num">${n}</span><span class="ff-mark" aria-hidden="true">${lit ? '🔥' : shielded ? '🛡️' : ''}</span></div>`;
  }
  function rewardRow(r) {
    const claimed = !!state.claimed[r.id], ready = r.flames >= r.need;
    const t = today(), over = r.id !== 'month' && t > r.end && !ready;
    const pct = Math.min(100, Math.round(r.flames / r.need * 100));
    const action = claimed ? '<span class="ff-claimed">✓ Claimed</span>'
      : ready ? `<button type="button" class="ff-claim" data-claim="${r.id}">Claim</button>`
      : over ? '<span class="ff-missed-tag">Missed</span>'
      : `<span class="ff-left">${r.need - r.flames} to go</span>`;
    const when = r.id === 'month' ? 'Light 20 flames in November' : `${r.id === 'w4' ? 'Thanksgiving week · ' : ''}Nov ${Number(r.start.slice(8))}–${Number(r.end.slice(8))} · ${r.need} flames`;
    return `<div class="ff-reward${r.id === 'month' ? ' grand' : ''}${claimed ? ' is-claimed' : ready ? ' is-ready' : ''}">
      <span class="ff-reward-icon" aria-hidden="true">${ICONS[r.id]}</span>
      <div class="ff-reward-body"><b>${esc(r.name)}${r.id === 'month' ? ' · Grand prize' : ''}</b><span class="ff-reward-gift">${esc(r.label)}</span>
        <span class="ff-reward-when">${when}</span>
        <div class="ff-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${r.need}" aria-valuenow="${Math.min(r.flames, r.need)}" aria-label="${esc(r.name)} progress"><span style="width:${pct}%"></span></div></div>
      <div class="ff-reward-action"><span class="ff-count">${Math.min(r.flames, r.need)}/${r.need}</span>${action}</div>
    </div>`;
  }
  function html() {
    if (loading && !state) return '<div class="ff-loading">Lighting the calendar…</div>';
    if (error && !state) return `<div class="ff-loading">${esc(error)}</div>`;
    const t = today(), lit = state.days.length;
    const before = t < START, after = t > END;
    const daysLeft = Math.round((Date.parse(START) - Date.parse(t)) / 86400000);
    const sub = before ? `Starts November 1 — ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go. Study each day in November to light your calendar.`
      : after ? `Flame Fest is over — you lit ${lit} flame${lit === 1 ? '' : 's'}! Claim any rewards you earned by December 7.`
      : 'Study any day this month to light its flame. Hit each week’s goal for a reward — and light 20 flames for the grand prize.';
    let grid = '';
    for (const d of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) grid += `<div class="ff-dow" aria-hidden="true">${d}</div>`;
    for (let n = 1; n <= 30; n++) grid += dayCell(n); // Nov 1, 2026 is a Sunday
    const giftUrl = state.giftCode ? `${location.origin}/redeem?code=${state.giftCode}` : '';
    const gift = giftUrl ? `<div class="ff-gift"><b>🎁 Your Plus week to give</b><span>Send this link to a friend who doesn’t have Knox Plus — they get 7 days free. It works once.</span><div class="ff-gift-row"><input class="ff-gift-link" value="${esc(giftUrl)}" readonly aria-label="Your gift link"><button type="button" class="ff-copy" data-copy="${esc(giftUrl)}">Copy link</button></div></div>` : '';
    const plus = state.plusUntil > Date.now() ? `<div class="ff-note">⚡ Your free Knox Plus week runs until ${new Date(state.plusUntil).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</div>` : '';
    const styles = state.flameStyles.length > 1 ? `<div class="ff-styles"><span>Your flame:</span>${state.flameStyles.map(s => `<button type="button" class="ff-style${s === state.flameStyle ? ' on' : ''}" data-style="${s}" aria-pressed="${s === state.flameStyle}">${STYLE_NAMES[s]}</button>`).join('')}</div>` : '';
    return `<div class="ff-head">
        <span class="ff-badge">🔥 November event${state.plus ? ' · ⚡ Plus rewards' : ''}${state.demo ? ' · demo' : ''}</span>
        <h2 id="ffTitle">Flame <span>Fest</span></h2>
        <p>${sub}</p>
        <div class="ff-stats"><div><b>${lit}</b><span>flames lit</span></div><div><b>${state.shields}</b><span>🛡️ shield${state.shields === 1 ? '' : 's'}</span></div><div><b>${Math.max(0, 20 - lit)}</b><span>to grand prize</span></div></div>
      </div>
      ${plus}${gift}
      <div class="ff-cal" role="grid" aria-label="November 2026">${grid}</div>
      <div class="ff-legend" aria-hidden="true"><span>🔥 studied</span><span>🛡️ saved by a shield</span><span class="ff-legend-today">today</span></div>
      <h3 class="ff-h3">Rewards</h3>
      <div class="ff-rewards">${state.rewards.map(rewardRow).join('')}</div>
      ${styles}
      <p class="ff-fine">A flame lights when you study with Knox that day — Ask Knox, Learn or a Flashcards review. 🛡️ Flame Shields save your streak if you miss a day — they’re used automatically. Bonus questions add to your free questions.</p>`;
  }
  function render() {
    if (!wrap) return;
    wrap.querySelector('.ff-body').innerHTML = html();
  }
  async function claim(id, btn) {
    btn.disabled = true; btn.textContent = 'Claiming…';
    try {
      if (demo) { state.claimed[id] = 'demo'; } else state = await api('POST', { claim: id });
      const r = state.rewards.find(x => x.id === id);
      render();
      celebrate(r);
      if (!demo) { window.knoxRefreshPlan?.(); window.loadStreak?.(window.currentUser?.uid); }
    } catch (e) { btn.disabled = false; btn.textContent = 'Claim'; toast(e.message); }
  }
  async function pickStyle(style) {
    try {
      if (demo) state.flameStyle = style; else state = await api('POST', { style });
      render(); applyFlameStyle(state.flameStyle);
    } catch (e) { toast(e.message); }
  }
  function celebrate(r) {
    const box = wrap?.querySelector('.ff-card');
    if (!box) return;
    const burst = document.createElement('div');
    burst.className = 'ff-burst';
    burst.setAttribute('aria-hidden', 'true');
    burst.innerHTML = Array.from({ length: 14 }, (_, k) => `<span style="--a:${k * 360 / 14}deg;--d:${80 + (k % 3) * 30}px">${k % 2 ? '🔥' : '✨'}</span>`).join('');
    box.append(burst);
    setTimeout(() => burst.remove(), 1200);
    toast(`${ICONS[r.id]} ${r.name} unlocked: ${r.label}!`);
  }
  function toast(msg) {
    const el = wrap?.querySelector('.ff-toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3800);
  }

  function close() {
    if (!wrap) return;
    wrap.remove(); wrap = null;
    document.removeEventListener('keydown', onKey, true);
    lastFocus?.focus?.({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && wrap) {
      const f = [...wrap.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  async function open() {
    if (!window.currentUser && !demo) { window.openAuthModal?.(); return; }
    if (wrap) return;
    lastFocus = document.activeElement;
    wrap = document.createElement('div');
    wrap.className = 'ff-modal';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'ffTitle');
    wrap.innerHTML = '<div class="ff-card"><button type="button" class="ff-x" aria-label="Close Flame Fest">×</button><div class="ff-body"></div><div class="ff-toast" role="status"></div></div>';
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('.ff-x')) { close(); return; }
      const c = e.target.closest('[data-claim]'); if (c) { claim(c.dataset.claim, c); return; }
      const s = e.target.closest('[data-style]'); if (s) { pickStyle(s.dataset.style); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast('Gift link copied — send it to a friend! 🎁'), () => { wrap.querySelector('.ff-gift-link')?.select(); toast('Copy the link above and send it to a friend.'); });
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(wrap);
    wrap.querySelector('.ff-x').focus();
    if (!state || !demo) await load();
    render();
  }

  // ── Flame look on the streak pill (Blue / Golden) ───────────────────────
  function applyFlameStyle(style) {
    document.querySelectorAll('#streakFlame').forEach(el => {
      el.classList.remove('flame-purple', 'flame-blue', 'flame-gold');
      if (['purple', 'blue', 'gold'].includes(style)) el.classList.add('flame-' + style);
    });
  }

  // ── Flashcards review → today's flame (and the streak) ──────────────────
  const studiedKey = () => `knoxStudied.${window.currentUser?.uid}.${localDay()}`;
  async function studied() {
    if (!window.currentUser || demo) return;
    try { if (localStorage.getItem(studiedKey())) return; } catch (e) {}
    try {
      const s = await api('POST', { studied: 'flashcards', localDay: localDay() });
      try { localStorage.setItem(studiedKey(), '1'); } catch (e) {}
      const lit = s.days?.includes(localDay());
      if (state && !state.demo) state = s;
      window.loadStreak?.(window.currentUser.uid);
      if (lit && active()) note('🔥 Today’s Flame Fest flame is lit!');
    } catch (e) { /* a missed flame is never worth an error */ }
  }

  // ── Small popups: launch announcement, gift messages, quick notes ───────
  function note(msg) {
    let el = document.getElementById('ffNote');
    if (!el) { el = document.createElement('div'); el.id = 'ffNote'; el.className = 'ff-float'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3800);
  }
  function popup(html, buttons) {
    if (wrap || document.querySelector('.ff-modal')) return;
    const m = document.createElement('div');
    m.className = 'ff-modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'ffPopTitle');
    m.innerHTML = `<div class="ff-card ff-pop">${html}<div class="ff-pop-actions">${buttons.map((b, i) => `<button type="button" class="${i ? 'ff-pop-later' : 'ff-claim'}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    const done = () => { m.remove(); document.removeEventListener('keydown', esc_, true); };
    const esc_ = e => { if (e.key === 'Escape') { e.preventDefault(); done(); } };
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (b) { done(); buttons[+b.dataset.i].run?.(); }
      else if (e.target === m) done();
    });
    document.addEventListener('keydown', esc_, true);
    document.body.append(m);
    m.querySelector('[data-i="0"]').focus();
  }
  function intro() {
    if (!active()) return;
    const key = 'knoxFlameFestIntro2026';
    try { if (!demo && localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
    const startsToday = today() === START;
    popup(`<div class="ff-pop-flame" aria-hidden="true">🔥</div><h2 id="ffPopTitle">Flame Fest ${startsToday ? 'starts today!' : 'is on!'}</h2>
      <p>All November, every day you study with Knox lights a flame on your calendar.</p>
      <ul class="ff-pop-list"><li>🎁 Hit each week’s goal for a reward</li><li>🛡️ Win Flame Shields that save your streak</li><li>👑 Light 20 flames for the grand prize${window.userPlan && ['super', 'max', 'plus'].includes(window.userPlan) ? ' — a Plus week to gift a friend' : ' — a free week of Knox Plus'}</li></ul>`,
      [{ label: window.currentUser ? 'Open my calendar' : 'Sign in to join', run: () => window.currentUser ? open() : window.openAuthModal?.() }, { label: 'Later' }]);
  }
  let started = false;
  function whenReady() {
    if (started) return; started = true;
    setTimeout(intro, 1500);
  }
  addEventListener('knox-auth-changed', whenReady);
  if (document.readyState === 'complete') whenReady(); else addEventListener('load', () => setTimeout(whenReady, 1500));

  window.knoxFlameFest = { open, active, applyFlameStyle, close, studied };
})();
