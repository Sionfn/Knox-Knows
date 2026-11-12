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
//   ?flamefest=test               — tester mode for the Knox admin account:
//                                   real rewards on your own account, any day
// Also shows a one-time "Flame Fest is on" popup during the event.
(function () {
  const START = '2026-11-01', END = '2026-11-30', CLAIM_UNTIL = '2026-12-07';
  // ?flamefest=demo turns the demo on for the rest of this visit (tab).
  let demo = new URLSearchParams(location.search).get('flamefest') === 'demo';
  try { if (demo) sessionStorage.setItem('knoxFlameDemo', '1'); else demo = sessionStorage.getItem('knoxFlameDemo') === '1'; } catch (e) {}
  const pad = n => String(n).padStart(2, '0');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // ?flamefest=test also sticks for this tab (the server checks it's the admin).
  let testMode = new URLSearchParams(location.search).get('flamefest') === 'test';
  try { if (testMode) { sessionStorage.setItem('knoxFlameTest', '1'); sessionStorage.removeItem('knoxFlameDemo'); demo = false; } else testMode = sessionStorage.getItem('knoxFlameTest') === '1'; } catch (e) {}
  const today = () => demo ? '2026-11-18' : localDay();
  const active = () => demo || testMode || (today() >= START && today() <= CLAIM_UNTIL);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = { w1: '✨', w2: '🛡️', w3: '💙', w4: '🪵', month: '🦅' };
  const STYLE_NAMES = { classic: '🔥 Classic', purple: '💜 Purple Flame', blue: '💙 Blue Flame', gold: '🟡 Golden Flame', slime: '🟢 Slime Flame', diamond: '💎 Diamond Flame', galaxy: '🌌 Galaxy Flame' };
  // In the flame picker each look shows its real flame instead of an emoji dot.
  const STYLE_LABELS = { classic: 'Classic', purple: 'Purple Flame', blue: 'Blue Flame', gold: 'Golden Flame', slime: 'Slime Flame', diamond: 'Diamond Flame', galaxy: 'Galaxy Flame' };
  const flameOf = look => `<span class="knox-flame"${look ? ` data-look="${look}"` : ''} aria-hidden="true">🔥</span>`;

  // ── Data ────────────────────────────────────────────────────────────────
  let state = null, loading = false, error = '';
  function demoState() {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
    const rewards = [
      { id: 'w1', name: 'Spark', start: '2026-11-01', end: '2026-11-07', need: 4, label: '+10 bonus questions' },
      { id: 'w2', name: 'Kindling', start: '2026-11-08', end: '2026-11-14', need: 4, label: '🛡️ Flame Shield' },
      { id: 'w3', name: 'Blaze', start: '2026-11-15', end: '2026-11-21', need: 4, label: '+10 bonus questions + 💙 Blue Flame' },
      { id: 'w4', name: 'Bonfire', start: '2026-11-22', end: '2026-11-28', need: 3, label: '🛡️ Flame Shield' },
      { id: 'month', name: 'Phoenix', start: '2026-11-01', end: '2026-11-30', need: 20, label: '7 days of Mega Knox + 🟡 Golden Flame' },
    ].map(r => ({ ...r, flames: days.filter(d => d >= r.start && d <= r.end).length }));
    return { event: { start: START, end: END, claimUntil: CLAIM_UNTIL }, plus: false, rewards, days, shielded: ['2026-11-10'], claimed: { w1: 'demo' }, shields: 1, flameStyle: 'classic', flameStyles: ['classic', 'slime'], plusUntil: 0, megaUntil: 0, giftCode: '', demo: true };
  }
  let accountGeneration = 0;
  const staleAccount = () => Object.assign(new Error('Account changed.'), { name: 'AbortError' });
  async function api(method, body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Sign in to join Flame Fest.');
    const generation = accountGeneration;
    try {
    const token = await user.getIdToken();
    if (generation !== accountGeneration || window.currentUser?.uid !== user.uid) throw staleAccount();
    const r = await fetch('/api/flame-fest', {
      method, headers: { 'Authorization': 'Bearer ' + token, ...(testMode && !demo ? { 'X-Knox-Flame-Test': '1' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (generation !== accountGeneration || window.currentUser?.uid !== user.uid) throw staleAccount();
    if (!r.ok) throw new Error(data.error || 'Flame Fest is busy right now. Please try again.');
    return data;
    } catch (error) {
      if (generation !== accountGeneration || window.currentUser?.uid !== user.uid) throw staleAccount();
      throw error;
    }
  }
  async function load() {
    if (demo) { state = state || demoState(); return; }
    const generation = accountGeneration;
    loading = true; error = ''; render();
    try { const saved = await api('GET'); if (generation === accountGeneration) state = saved; }
    catch (e) { if (generation === accountGeneration && e.name !== 'AbortError') error = e.message; }
    if (generation === accountGeneration) loading = false;
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
  // A prize's flame shows as that flame (the same look the streak would wear),
  // not as an emoji: "💎 Diamond Flame" → the Diamond Flame itself.
  const FLAME_EMOJI = { '💜': 'purple', '💙': 'blue', '🟡': 'gold', '💎': 'diamond', '🟢': 'slime', '🌌': 'galaxy' };
  const giftHtml = label => esc(label).replace(/(💜|💙|🟡|💎|🟢)\s*((?:Purple|Blue|Golden|Diamond|Slime) Flame)/gu, (_, e, name) => flameOf(FLAME_EMOJI[e]) + ' ' + name);
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
      <div class="ff-reward-body"><b>${esc(r.name)}${r.id === 'month' ? ' · Grand prize' : ''}</b><span class="ff-reward-gift">${giftHtml(r.label)}</span>
        <span class="ff-reward-when">${when}</span>
        <div class="ff-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${r.need}" aria-valuenow="${Math.min(r.flames, r.need)}" aria-label="${esc(r.name)} progress"><span style="width:${pct}%"></span></div></div>
      <div class="ff-reward-action"><span class="ff-count">${Math.min(r.flames, r.need)}/${r.need}</span>${action}</div>
    </div>`;
  }
  function html() {
    // Until the calendar arrives: the same boxed loading card as the app.
    if (loading && !state) return '<div class="ff-loading" role="status"><img class="ff-loading-logo" src="/knox-logo-square.jpg" alt=""><b>Flame Fest</b><span class="ff-loading-spinner" aria-hidden="true"></span><span>Lighting your calendar…</span></div>';
    if (error && !state) return `<div class="ff-loading" role="status"><img class="ff-loading-logo" src="/knox-logo-square.jpg" alt=""><b>Flame Fest</b><span>${esc(error)}</span><button type="button" class="ff-claim" data-retry>Try again</button></div>`;
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
    const gift = giftUrl ? `<div class="ff-gift"><b>🎁 Your Mega Knox week to give</b><span>Send this link to a friend who doesn’t have Mega Knox — they get 7 days free. It works once.</span><div class="ff-gift-row"><input class="ff-gift-link" value="${esc(giftUrl)}" readonly aria-label="Your gift link"><button type="button" class="ff-copy" data-copy="${esc(giftUrl)}">Copy link</button></div></div>` : '';
    const plus = state.megaUntil > Date.now() ? `<div class="ff-note">💎 Your free Mega Knox week runs until ${new Date(state.megaUntil).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</div>` : '';
    const picker = state.flameStyles.length > 1 ? `<div class="ff-styles">${state.flameStyles.map(s => `<button type="button" class="ff-style${s === state.flameStyle ? ' on' : ''}" data-style="${s}" aria-pressed="${s === state.flameStyle}">${flameOf(s)}${STYLE_LABELS[s]}</button>`).join('')}</div>` : '';
    return `<div class="ff-head">
        <span class="ff-badge">🔥 November event${state.tier === 'mega' ? ' · 💎 Mega Knox rewards' : state.plus ? ' · ⚡ Knox Plus rewards' : ''}${state.demo ? ' · demo' : ''}</span>
        <h2 id="ffTitle">Flame <span>Fest</span></h2>
        <p>${sub}</p>
        <div class="ff-stats"><div><b>${lit}</b><span>flames lit</span></div><div><b>${state.shields}</b><span>🛡️ shield${state.shields === 1 ? '' : 's'}</span></div><div><b>${Math.max(0, 20 - lit)}</b><span>to grand prize</span></div></div>
      </div>
      ${myFlame(picker)}
      ${plus}${gift}
      <div class="ff-cal" role="grid" aria-label="November 2026">${grid}</div>
      <div class="ff-legend" aria-hidden="true"><span><i class="ff-legend-ic">🔥</i>studied</span><span><i class="ff-legend-ic">🛡️</i>saved by a shield</span><span><i class="ff-legend-today"></i>today</span></div>
      <h3 class="ff-h3">Rewards</h3>
      <div class="ff-rewards">${state.rewards.map(rewardRow).join('')}</div>
      ${state.tester && testMode ? testerPanel() : testMode && !demo ? testerOff() : ''}
      <p class="ff-fine">A flame lights when you study with Knox that day — Ask Knox, Learn or a Flashcards review. 🛡️ Flame Shields save your streak if you miss a day — they’re used automatically. Bonus questions add to your free questions.</p>`;
  }
  // The flame you're using, big, so you can really see it (and pick another).
  function myFlame(picker) {
    const tip = state.flameStyles.length > 1 ? '' : '<span class="ff-myflame-tip">Earn new flames from the rewards below — or link your Discord with /link for the 🟢 Slime Flame.</span>';
    return `<div class="ff-myflame"><span class="knox-flame ff-myflame-icon" aria-hidden="true">🔥</span><div class="ff-myflame-copy"><span class="ff-myflame-label">Your flame</span><b>${STYLE_LABELS[state.flameStyle] || STYLE_LABELS.classic}</b>${tip}${picker}</div></div>`;
  }
  function testerPanel() {
    return `<div class="ff-tester"><b>🧪 Tester mode</b><span>Real rewards on your own account, so you can try everything before November. Only your admin account sees this.</span>
      <div class="ff-tester-row">
        <button type="button" class="ff-claim" data-test="fill">🔥 Light every flame</button>
        <button type="button" class="ff-pop-later" data-test="miss"${state.shields ? '' : ' disabled title="Claim a reward with a Flame Shield first"'}>🛡️ Miss a day</button>
        <button type="button" class="ff-pop-later" data-test="slime"${(state.flameStyles || []).includes('slime') ? ' disabled title="You already have the Slime Flame"' : ''}>${flameOf('slime')} Slime Flame</button>
        <button type="button" class="ff-pop-later" data-test="reset">↺ Reset</button>
      </div>
      <span class="ff-tester-tip">Miss a day pretends you skipped yesterday — ask Knox anything and watch a shield save your streak.</span></div>`;
  }
  function testerOff() {
    return `<div class="ff-tester ff-tester-off"><b>🧪 Tester mode is off</b><span>${state.testerReady === false
      ? 'This version of the site has no admin account set up (ADMIN_UID), so the tester buttons can’t turn on here.'
      : 'Tester mode only works on the Knox admin account — the one that can open the admin page. Sign in with that account and try again.'}</span></div>`;
  }
  async function runTest(kind, btn) {
    if (kind === 'reset' && !confirm('Reset your Flame Fest? Flames, claims, shields, flame colours and the Flame Fest Mega Knox week are cleared.')) return;
    btn.disabled = true;
    try {
      state = await api('POST', { test: kind, localDay: localDay() });
      render(); applyFlameStyle(state.flameStyle);
      window.knoxRefreshPlan?.(); window.loadStreak?.(window.currentUser?.uid);
      toast(kind === 'fill' ? '🔥 Every flame is lit — claim your rewards!'
        : kind === 'miss' ? '🛡️ Yesterday is now “missed”. Ask Knox something to use a shield.'
        : kind === 'slime' ? 'Slime Flame unlocked and on — like linking Discord.'
        : '↺ Flame Fest reset.');
    } catch (e) { if (e.name === 'AbortError') return; btn.disabled = false; toast(e.message); }
  }
  function render() {
    if (!wrap) return;
    wrap.querySelector('.ff-card').classList.toggle('ff-card-loading', !state);
    wrap.querySelector('.ff-body').innerHTML = html();
    if (state) applyFlameStyle(state.flameStyle);
  }
  async function claim(id, btn) {
    btn.disabled = true; btn.textContent = 'Claiming…';
    try {
      if (demo) {
        // The demo hands out flame colors too, so the color picker can be tried.
        state.claimed[id] = 'demo';
        const won = { w3: 'blue', month: 'gold' }[id];
        if (won && !state.flameStyles.includes(won)) { state.flameStyles.push(won); state.flameStyle = won; }
      } else state = await api('POST', { claim: id });
      const r = state.rewards.find(x => x.id === id);
      render();
      celebrate(r);
      applyFlameStyle(state.flameStyle);
      if (!demo) { window.knoxRefreshPlan?.(); window.loadStreak?.(window.currentUser?.uid); }
    } catch (e) { if (e.name === 'AbortError') return; btn.disabled = false; btn.textContent = 'Claim'; toast(e.message); }
  }
  // The new flame shows at once and saves in the background; if saving fails it
  // switches back. Quick taps: only the last one's answer counts.
  let styleSeq = 0;
  async function pickStyle(style) {
    if (!state || state.flameStyle === style) return;
    const before = state.flameStyle, seq = ++styleSeq;
    state.flameStyle = style; render(); applyFlameStyle(style);
    if (demo) return;
    try {
      const saved = await api('POST', { style });
      if (seq === styleSeq) { state = saved; render(); applyFlameStyle(state.flameStyle); }
    } catch (e) {
      if (seq !== styleSeq || e.name === 'AbortError') return;
      state.flameStyle = before; render(); applyFlameStyle(before); toast(e.message);
    }
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
  let opening = false;
  async function open() {
    if (!window.currentUser && !demo) { window.openAuthModal?.(); return; }
    if (wrap || opening) return;
    // No loading screen: Flame Fest opens once its data is here (usually already
    // loaded in the background after sign-in).
    if (!state && !demo) { opening = true; try { await load(); } catch {} opening = false; if (wrap) return; }
    lastFocus = document.activeElement;
    wrap = document.createElement('div');
    wrap.className = 'ff-modal';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'ffTitle');
    wrap.innerHTML = '<div class="ff-card"><button type="button" class="ff-x" aria-label="Close Flame Fest">×</button><div class="ff-body"></div><div class="ff-toast" role="status"></div></div>';
    // The ✕ closes on the first touch (no waiting for a click iOS may hold back).
    wrap.addEventListener('pointerup', e => { if (e.target.closest('.ff-x')) { e.preventDefault(); close(); } });
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('.ff-x')) { close(); return; }
      const c = e.target.closest('[data-claim]'); if (c) { claim(c.dataset.claim, c); return; }
      const s = e.target.closest('[data-style]'); if (s) { pickStyle(s.dataset.style); return; }
      const t = e.target.closest('[data-test]'); if (t) { runTest(t.dataset.test, t); return; }
      if (e.target.closest('[data-retry]')) { load().then(render); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast('Gift link copied — send it to a friend! 🎁'), () => { wrap.querySelector('.ff-gift-link')?.select(); toast('Copy the link above and send it to a friend.'); });
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(wrap);
    focusCard(wrap.querySelector('.ff-card'));
    // Saved data shows at once (refreshed quietly behind it); only the very first open waits.
    if (!state) await load(); else if (!demo) load().then(() => { if (wrap) render(); });
    render();
  }

  // ── Flame look on the streak pill (Purple / Blue / Golden / Slime) ──────
  // The Slime Flame is drawn (not a recolored 🔥) so it can wobble and drip
  // like slime; filters and animations on the emoji itself look broken.
  const SLIME = '<svg class="slime-flame" viewBox="0 0 24 32" aria-hidden="true"><defs><linearGradient id="slimeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9F86E"/><stop offset=".55" stop-color="#6FD83C"/><stop offset="1" stop-color="#33A52A"/></linearGradient></defs><ellipse class="slime-drip" cx="15.2" cy="23.5" rx="1.7" ry="2.1" fill="#5BCB34" stroke="#2A8F22" stroke-width=".8"/><ellipse class="slime-drip slime-drip-2" cx="8.6" cy="22.8" rx="1.3" ry="1.6" fill="#5BCB34" stroke="#2A8F22" stroke-width=".7"/><g class="slime-body"><path d="M12.6 1C14 5.4 19.8 8.6 19.8 16.2c0 4.6-3.5 8-7.8 8s-7.8-3.4-7.8-8c0-4.3 2.2-6.9 3.6-9.8.3 2.8 1.3 4.4 2.6 5.1-.4-4 .3-7.4 2-10.5z" fill="url(#slimeFill)" stroke="#2A8F22" stroke-width="1.3" stroke-linejoin="round"/><ellipse cx="8.9" cy="16.2" rx="1.5" ry="2.7" fill="#fff" opacity=".6"/><circle cx="15.3" cy="19.4" r="1" fill="#fff" opacity=".45"/><circle cx="12.4" cy="13.2" r=".7" fill="#fff" opacity=".4"/></g></svg>';
  // 🌌 Galaxy Flame (website subscribers): a drawn flame of deep space, nebula colors
  // drifting through it, stars twinkling inside and sparks orbiting it.
  const GALAXY = '<svg class="galaxy-flame" viewBox="0 0 24 32" aria-hidden="true"><defs><linearGradient id="galaxyFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6FD8"/><stop offset=".4" stop-color="#7B3FF2"/><stop offset="1" stop-color="#141B5E"/></linearGradient><radialGradient id="galaxyCore" cx=".5" cy=".62" r=".5"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".35" stop-color="#7FE3FF" stop-opacity=".7"/><stop offset="1" stop-color="#7FE3FF" stop-opacity="0"/></radialGradient></defs><g class="galaxy-body"><path d="M12.6 1C14 5.4 19.8 8.6 19.8 16.2c0 4.6-3.5 8-7.8 8s-7.8-3.4-7.8-8c0-4.3 2.2-6.9 3.6-9.8.3 2.8 1.3 4.4 2.6 5.1-.4-4 .3-7.4 2-10.5z" fill="url(#galaxyFill)" stroke="#8FE9FF" stroke-width=".8" stroke-linejoin="round"/><ellipse class="galaxy-swirl" cx="12" cy="15.6" rx="6" ry="1.7" fill="#FF7AD9" opacity=".6"/><ellipse class="galaxy-swirl g2" cx="12" cy="18.4" rx="4.8" ry="1.2" fill="#FFD36E" opacity=".45"/><ellipse class="galaxy-core" cx="12" cy="17.5" rx="4.6" ry="5.4" fill="url(#galaxyCore)"/><circle class="galaxy-star s1" cx="9.2" cy="14" r=".85" fill="#fff"/><circle class="galaxy-star s2" cx="14.6" cy="11.8" r=".6" fill="#fff"/><circle class="galaxy-star s3" cx="15.4" cy="19.6" r=".7" fill="#FFE38A"/><circle class="galaxy-star s4" cx="10.4" cy="20.4" r=".5" fill="#fff"/><path class="galaxy-star s5" d="M12.3 7.2l.45 1.05 1.05.45-1.05.45-.45 1.05-.45-1.05-1.05-.45 1.05-.45z" fill="#fff"/></g><g class="galaxy-rise"><circle class="gr1" cx="9" cy="6" r=".75" fill="#FFE38A"/><circle class="gr2" cx="15.5" cy="8" r=".6" fill="#8FE9FF"/><circle class="gr3" cx="12.4" cy="3" r=".5" fill="#fff"/></g></svg>';
  let currentStyle = 'classic', slimeCount = 0, galaxyCount = 0;
  function applyFlameStyle(style) {
    if (style) currentStyle = style;
    document.querySelectorAll('#streakFlame, .knox-flame').forEach(el => {
      const look = el.dataset.look || currentStyle;
      el.classList.remove('flame-purple', 'flame-blue', 'flame-gold', 'flame-slime', 'flame-diamond', 'flame-galaxy');
      if (['purple', 'blue', 'gold', 'slime', 'diamond', 'galaxy'].includes(look)) el.classList.add('flame-' + look);
      // Each copy gets its own gradient id: a shared id breaks when the first copy is hidden.
      if (look === 'slime') { if (!el.querySelector('.slime-flame')) el.innerHTML = SLIME.replace(/slimeFill/g, 'slimeFill' + (++slimeCount)); }
      else if (look === 'galaxy') { if (!el.querySelector('.galaxy-flame')) { const n = ++galaxyCount; el.innerHTML = GALAXY.replace(/galaxyFill/g, 'galaxyFill' + n).replace(/galaxyCore/g, 'galaxyCore' + n); } }
      else if (el.querySelector('.slime-flame, .galaxy-flame')) el.textContent = '🔥';
    });
  }
  // ── Flame peek: press and hold a flame (mouse or finger) to see it big,
  // alive and turning in 3D; letting go hides it. Layers stacked in depth give
  // it thickness as it sways. A normal click/tap still does what it did.
  const GLOW = { classic: '#FF6B00', purple: '#A35BFF', blue: '#2E9BFF', gold: '#F2B705', slime: '#6FD83C', diamond: '#8FE3FF', galaxy: '#B455FF' };
  const PEEK_AT = '#streakPill, .ff-myflame-icon, .discord-slime-badge, .ff-style, .km-flame-pill, .km-streak-card';
  let peek = null, peekFor = null, peekTimer = 0;
  function peekLook(host) {
    const own = host.matches('.knox-flame') ? host : host.querySelector('.knox-flame[data-look], .knox-flame, #streakFlame');
    return (own && own.dataset.look) || currentStyle;
  }
  function showPeek(host) {
    if (peekFor === host) return;
    hidePeek();
    const look = peekLook(host);
    const streak = host.matches('#streakPill, .km-flame-pill, .km-streak-card') ? Number(document.getElementById('streakCount')?.textContent) || 0 : null;
    const layers = [6, 5, 4, 3, 2, 1, 0].map(z => `<span class="fp-layer${z ? ' fp-depth' : ''}" style="--z:${z}">${flameOf(look)}</span>`).join('');
    const embers = Array.from({ length: 7 }, (_, i) => `<i style="--x:${(i * 37) % 70 - 35}px;--d:${(i * 0.43).toFixed(2)}s;--s:${3 + (i % 3)}px"></i>`).join('');
    peek = document.createElement('div');
    peek.className = 'flame-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.style.setProperty('--fp-glow', GLOW[look] || GLOW.classic);
    peek.innerHTML = `<div class="fp-stage"><div class="fp-halo"></div><div class="fp-embers">${embers}</div><div class="fp-rotor">${layers}</div><div class="fp-floor"></div></div>
      <b>${esc(STYLE_LABELS[look] || STYLE_LABELS.classic)}</b>${streak !== null ? `<span>${streak}-day streak</span>` : ''}`;
    document.body.append(peek);
    applyFlameStyle();
    // Beside the flame when there's room (the sidebar), otherwise above or below it.
    // Short laptops zoom the whole page (desktop-fit.js): work in its CSS pixels.
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, b = host.getBoundingClientRect();
    const r = { left: b.left / z, top: b.top / z, right: b.right / z, bottom: b.bottom / z, width: b.width / z, height: b.height / z };
    const W = innerWidth / z, H = innerHeight / z, w = peek.offsetWidth, h = peek.offsetHeight, gap = 12;
    let x, y;
    if (r.right + gap + w <= W - 8) { x = r.right + gap; y = r.top + r.height / 2 - h / 2; }
    else { x = r.left + r.width / 2 - w / 2; y = r.top - gap - h >= 8 ? r.top - gap - h : r.bottom + gap; }
    // Keep it clear of the notch / Dynamic Island and the home bar (iPhone app).
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.append(probe); const cs = getComputedStyle(probe), safeTop = parseFloat(cs.paddingTop) || 0, safeBottom = parseFloat(cs.paddingBottom) || 0; probe.remove();
    if (y < safeTop + 8 && r.bottom + gap + h <= H - safeBottom - 8) y = r.bottom + gap;
    peek.style.left = Math.max(8, Math.min(x, W - w - 8)) + 'px';
    peek.style.top = Math.max(safeTop + 8, Math.min(y, H - h - safeBottom - 8)) + 'px';
    // The native "Your study streak" tooltip would sit on top of it.
    if (host.title) { host.dataset.peekTitle = host.title; host.removeAttribute('title'); }
    peekFor = host;
    peek.classList.add('open'); // after the size read above, so it still animates in
  }
  function hidePeek() {
    clearTimeout(peekTimer);
    if (peekFor && peekFor.dataset.peekTitle) { peekFor.title = peekFor.dataset.peekTitle; delete peekFor.dataset.peekTitle; }
    peekFor = null;
    if (peek) { const old = peek; peek = null; old.classList.remove('open'); setTimeout(() => old.remove(), 180); }
  }
  const HOLD_MS = 1500;
  let charging = null, swallowClick = false;
  function stopCharge() { clearTimeout(peekTimer); if (charging) charging.classList.remove('fp-charging'); charging = null; }
  document.addEventListener('pointerdown', e => {
    const host = e.button === 0 && e.target.closest?.(PEEK_AT);
    if (!host) return;
    stopCharge(); swallowClick = false;
    charging = host; host.classList.add('fp-charging');
    peekTimer = setTimeout(() => { stopCharge(); swallowClick = true; showPeek(host); }, HOLD_MS);
  });
  // Letting go (or moving off / scrolling) ends it.
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { stopCharge(); if (peekFor) hidePeek(); }, true));
  document.addEventListener('pointerout', e => { if (charging && !charging.contains(e.relatedTarget)) stopCharge(); });
  // The click that ends a hold shouldn't also open the streak window or pick a look.
  addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  // A long press on phones would otherwise open the browser's menu.
  document.addEventListener('contextmenu', e => { if (e.target.closest?.(PEEK_AT)) e.preventDefault(); });
  ['scroll', 'resize', 'blur'].forEach(t => addEventListener(t, () => { stopCharge(); if (peekFor) hidePeek(); }, true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && peekFor) hidePeek(); });

  // Clicking the Knox Discord card: say how to earn the Slime Flame (linking in
  // the server unlocks it; see api/_discord-link.js).
  function discordHint() {
    if (window.knoxDiscordLinked) { note('✅ Your Discord is already linked — the 🟢 Slime Flame is yours.'); return; }
    note('🟢 Join, then type /link in the Knox Discord to unlock the Slime Flame!');
  }

  // ── Flashcards review → today's flame (and the streak) ──────────────────
  const studiedKey = (uid = window.currentUser?.uid) => `knoxStudied.${uid}.${localDay()}`;
  async function studied() {
    if (!window.currentUser || demo) return;
    const uid = window.currentUser.uid;
    try { if (localStorage.getItem(studiedKey(uid))) return; } catch (e) {}
    try {
      const s = await api('POST', { studied: 'flashcards', localDay: localDay() });
      if (window.currentUser?.uid !== uid) return;
      try { localStorage.setItem(studiedKey(uid), '1'); } catch (e) {}
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
    focusCard(m.querySelector('.ff-card'));
  }
  // Focus the window, not its first button, so no focus ring shows on open;
  // Tab still goes straight to the buttons (orange ring, see flamefest.css).
  function focusCard(card) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
  // preview: show the Nov 1 version now, whatever the date (the admin's
  // "Preview Nov 1 popup" button in the profile menu); nothing is saved.
  function intro(preview) {
    if (preview !== true) {
      // Only for signed-in students, right after they log in, never for visitors.
      if (!window.currentUser) return;
      // A new account's tour goes first; the popup follows when it's done.
      if (window.knoxTour?.pending()) { addEventListener('knox-tour-done', () => setTimeout(intro, 600), { once: true }); return; }
      // Never on top of signing in or up: wait until that box is closed (a new
      // account then gets its tour first, and this popup after it).
      const auth = document.getElementById('authModal');
      // Same for the account loading screen and any other open box (e.g. "Welcome to Knox Plus!").
      if ((auth && getComputedStyle(auth).display !== 'none') || document.body.classList.contains('app-auth-pending') ||
          [...document.querySelectorAll('.modal-backdrop')].some(el => getComputedStyle(el).display !== 'none')) { setTimeout(intro, 1500); return; }
      if (!active() || today() > END) return; // not during the Dec 1–7 claim week
      const key = 'knoxFlameFestIntro2026.' + window.currentUser.uid; // once per account, not per browser
      try { if (!demo && localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
    }
    const startsToday = preview === true || today() === START;
    popup(`<div class="ff-pop-flame" aria-hidden="true">🔥</div><h2 id="ffPopTitle">Flame Fest ${startsToday ? 'starts today!' : 'is on!'}</h2>
      <p>All November, every day you study with Knox lights a flame on your calendar.</p>
      <ul class="ff-pop-list"><li>🎁 Hit each week’s goal for a reward</li><li>🛡️ Win Flame Shields that save your streak</li><li>👑 Light 20 flames for the grand prize${window.userTier === 'mega' ? ' — a Mega Knox week to gift a friend' : window.userTier === 'plus' ? ' — two free weeks of Mega Knox' : ' — a free week of Mega Knox'}</li></ul>`,
      [{ label: window.currentUser ? 'Open my calendar' : 'Sign in to join', run: () => window.currentUser ? open() : window.openAuthModal?.() }, { label: 'Later' }]);
  }
  // Each time someone signs in (or the page opens already signed in), try the
  // popup; it shows once per browser (see the key above) and skips visitors.
  let introTimer = 0;
  // A different account (or signing out) drops the last one's Flame Fest and
  // starts on the classic flame; the next streak read paints its own look.
  addEventListener('knox-auth-changed', () => { accountGeneration++; state = null; error = ''; loading = false; styleSeq++; close(); applyFlameStyle('classic'); });
  addEventListener('knox-auth-changed', () => { clearTimeout(introTimer); introTimer = setTimeout(intro, 1500); });
  // Load Flame Fest in the background after sign-in, so it opens instantly.
  addEventListener('knox-auth-changed', () => { if (window.currentUser && active()) setTimeout(() => { if (window.currentUser && !state && !loading) load().catch(() => {}); }, 3000); });
  if (window.currentUser) introTimer = setTimeout(intro, 1500); // signed in before this script loaded

  window.knoxFlameFest = { open, active, applyFlameStyle, close, studied, discordHint, previewIntro: () => intro(true) };
  // Flames with a fixed look on the page (e.g. the Discord card's Slime Flame) draw right away.
  applyFlameStyle();
})();
