// bags.js — Knox blind bags, Series 1 "Knox's Christmas" (December 2026).
//
// 12 figures: Elf, Snowman, Reindeer, Gingerbread, Hot Cocoa and Ugly Sweater
// Knox (common), Ice Skater, Caroler and Snowball Knox (rare), Santa and
// Nutcracker Knox (epic) and ✨ Golden Knox (secret). Bags are earned, never
// sold: one behind every Advent Calendar door and one for every 10 questions
// asked in December (up to 3 a day). 3 duplicates trade in for a new bag.
// Collect all 12 for 30 days of Mega Knox (or a Mega month to gift), the
// Collector badge and the Golden Flame. The server (api/flame-fest.js,
// ?event=bags) keeps the bags and picks every figure.
//
//   window.knoxBags.open()   — the bag screen (Advent Calendar, Your flame)
//   ?advent=demo / preview   — a pretend collection, nothing is saved
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ki = html => window.KI?.fill ? window.KI.fill(html) : html;
  const preview = /preview|localhost|127\.0\.0\.1/.test(location.hostname);
  let demo = /[?&]advent=demo/.test(location.search) || (preview && new Date() < new Date('2026-12-01T00:00:00'));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SERIES = [
    ['elf', 'Elf Knox', 'common'], ['snowman', 'Snowman Knox', 'common'], ['reindeer', 'Reindeer Knox', 'common'],
    ['gingerbread', 'Gingerbread Knox', 'common'], ['cocoa', 'Hot Cocoa Knox', 'common'], ['sweater', 'Ugly Sweater Knox', 'common'],
    ['skater', 'Ice Skater Knox', 'rare'], ['caroler', 'Caroler Knox', 'rare'], ['snowball', 'Snowball Knox', 'rare'],
    ['santa', 'Santa Knox', 'epic'], ['nutcracker', 'Nutcracker Knox', 'epic'], ['golden', 'Golden Knox', 'secret'],
  ].map(([id, name, rarity]) => ({ id, name, rarity }));
  const RARITY = { common: 'Common', rare: 'Rare', epic: 'Epic', secret: 'Secret' };

  // ── Figure art: one Knox base, dressed up for each figure ──────────────
  // Flat Knox shapes with a darker outline. viewBox 0 0 120 130.
  function fox({ fur = '#FF8A3D', edge = '#CC5500', belly = '#FFFFFF', inner = '#7A3B12' } = {}) {
    return `<path d="M88 104c18-2 26-16 22-30-8 8-16 10-24 8" fill="${fur}" stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"/><path d="M104 80c4 6 6 12 6-6-3 3-5 5-6 6Z" fill="${belly}"/>
      <ellipse cx="60" cy="102" rx="29" ry="25" fill="${fur}" stroke="${edge}" stroke-width="2.5"/><ellipse cx="60" cy="108" rx="15" ry="16" fill="${belly}"/>
      <path d="M30 44 24 12 52 32Z M90 44 96 12 68 32Z" fill="${fur}" stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"/><path d="M33 36 30 20 45 32Z M87 36 90 20 75 32Z" fill="${inner}"/>
      <ellipse cx="60" cy="56" rx="35" ry="29" fill="${fur}" stroke="${edge}" stroke-width="2.5"/>
      <path d="M32 62c8 14 18 20 28 20s20-6 28-20c-8 4-18 2-28 2s-20 2-28-2Z" fill="${belly}"/>
      <circle cx="47" cy="54" r="4.3" fill="#3C3C3C"/><circle cx="73" cy="54" r="4.3" fill="#3C3C3C"/><circle cx="48.4" cy="52.6" r="1.4" fill="#fff"/><circle cx="74.4" cy="52.6" r="1.4" fill="#fff"/>
      <ellipse cx="60" cy="66" rx="4.6" ry="3.4" fill="#3C3C3C"/><path d="M54 71c3 3 9 3 12 0" fill="none" stroke="#3C3C3C" stroke-width="2" stroke-linecap="round"/>`;
  }
  const S = (body, extra = '') => `<svg class="kb-fig" viewBox="0 0 120 130" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
  const FIG = {
    elf: () => S(fox() + `<path d="M26 34c10-26 54-28 66-6l-6 6C76 20 44 20 34 38Z" fill="#1FA45A" stroke="#157A41" stroke-width="2.5" stroke-linejoin="round"/><path d="M84 30c10-4 18 2 20 10" fill="none" stroke="#1FA45A" stroke-width="7" stroke-linecap="round"/><circle cx="104" cy="42" r="5" fill="#FFC800" stroke="#D9A300" stroke-width="2"/><path d="M26 36c12-6 56-8 66-2" fill="none" stroke="#E5383B" stroke-width="7" stroke-linecap="round"/><path d="M38 86h44l-4 10H42Z" fill="#1FA45A" stroke="#157A41" stroke-width="2"/><path d="M46 90l4 4 4-4 4 4 4-4 4 4 4-4 4 4" fill="none" stroke="#FFC800" stroke-width="2"/>`),
    snowman: () => S(`<circle cx="60" cy="104" r="26" fill="#fff" stroke="#C9D9E6" stroke-width="3"/><circle cx="60" cy="98" r="3" fill="#3C3C3C"/><circle cx="60" cy="110" r="3" fill="#3C3C3C"/>` + fox().replace(/<ellipse cx="60" cy="102"[^>]*\/><ellipse cx="60" cy="108"[^>]*\/>/, '') + `<path d="M36 80c14 6 34 6 48 0l3 7c-16 7-38 7-54 0Z" fill="#E5383B" stroke="#B3202A" stroke-width="2" stroke-linejoin="round"/><rect x="38" y="20" width="44" height="8" rx="3" fill="#3C3C3C"/><rect x="45" y="2" width="30" height="20" rx="3" fill="#3C3C3C"/><rect x="45" y="14" width="30" height="5" fill="#E5383B"/>`),
    reindeer: () => S(`<path d="M36 34C26 20 22 10 28 4M28 18c-6-2-10-6-10-10M84 34c10-14 14-24 8-30M92 18c6-2 10-6 10-10" fill="none" stroke="#8A5A2B" stroke-width="5" stroke-linecap="round"/>` + fox({ fur: '#C98446', edge: '#8A5A2B', inner: '#5C3A1C' }) + `<circle cx="60" cy="66" r="6.5" fill="#E5383B" stroke="#B3202A" stroke-width="2"/>`),
    gingerbread: () => S(fox({ fur: '#C17A3A', edge: '#7A4A27', belly: '#C17A3A', inner: '#7A4A27' }) + `<path d="M34 50c4-4 8-4 12 0M74 50c4-4 8-4 12 0M36 78c8 10 40 10 48 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="60" cy="96" r="4" fill="#E5383B"/><circle cx="60" cy="108" r="4" fill="#1FA45A"/><circle cx="60" cy="120" r="3.5" fill="#1CB0F6"/><path d="M34 100c4 3 4 7 0 10M86 100c-4 3-4 7 0 10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`),
    cocoa: () => S(fox() + `<path d="M40 92h30v16a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5"/><path d="M70 96c8 0 8 10 0 10" fill="none" stroke="#B3202A" stroke-width="3"/><rect x="42" y="88" width="26" height="6" rx="3" fill="#8A5A2B"/><rect x="47" y="84" width="7" height="6" rx="2" fill="#fff" stroke="#E6DCD8"/><rect x="56" y="85" width="7" height="6" rx="2" fill="#fff" stroke="#E6DCD8"/><path d="M48 80c-3-5 3-7 0-12M58 80c-3-5 3-7 0-12" fill="none" stroke="#C9D9E6" stroke-width="2.5" stroke-linecap="round"/>`),
    sweater: () => S(fox() + `<path d="M31 96c4-12 16-16 29-16s25 4 29 16v14c-6 10-52 10-58 0Z" fill="#1FA45A" stroke="#157A41" stroke-width="2.5" stroke-linejoin="round"/><path d="M34 98l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 4 4" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M60 104l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6Z" fill="#FFC800" stroke="#D9A300" stroke-width="1.5"/><path d="M34 112h52" stroke="#E5383B" stroke-width="4"/>`),
    skater: () => S(fox() + `<path d="M34 80c14 6 38 6 52 0l2 7c-18 7-38 7-56 0Z" fill="#1CB0F6" stroke="#0A85C2" stroke-width="2" stroke-linejoin="round"/><path d="M80 84l6 22" stroke="#1CB0F6" stroke-width="8" stroke-linecap="round"/><path d="M40 118h18v-8c-6 0-12-2-18-6Z M64 118h18v-14c-6 4-12 6-18 6Z" fill="#fff" stroke="#9FB4CC" stroke-width="2"/><path d="M36 124h26M60 124h26" stroke="#7C8DA3" stroke-width="3" stroke-linecap="round"/>`),
    caroler: () => S(fox() + `<path d="M34 80c14 6 38 6 52 0l2 7c-18 7-38 7-56 0Z" fill="#E5383B" stroke="#B3202A" stroke-width="2" stroke-linejoin="round"/><rect x="42" y="92" width="36" height="24" rx="3" fill="#1FA45A" stroke="#157A41" stroke-width="2.5"/><path d="M60 92v24" stroke="#157A41" stroke-width="2"/><path d="M90 28v-14l10-3v14" fill="none" stroke="#3C3C3C" stroke-width="2.5"/><circle cx="87" cy="28" r="3.5" fill="#3C3C3C"/><circle cx="97" cy="25" r="3.5" fill="#3C3C3C"/><path d="M22 24V12" stroke="#3C3C3C" stroke-width="2.5"/><circle cx="19" cy="24" r="3.5" fill="#3C3C3C"/>`),
    snowball: () => S(fox() + `<path d="M28 34c4-20 60-20 64 0Z" fill="#7C3AED" stroke="#5B21B6" stroke-width="2.5" stroke-linejoin="round"/><path d="M26 34h68" stroke="#CE82FF" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="10" r="7" fill="#fff" stroke="#E6DCD8" stroke-width="2"/><circle cx="92" cy="98" r="13" fill="#fff" stroke="#C9D9E6" stroke-width="3"/><path d="M86 94l4 2M94 100l3-3" stroke="#C9D9E6" stroke-width="2" stroke-linecap="round"/>`),
    santa: () => S(fox() + `<path d="M28 36c6-24 52-30 66-8l6 18-8 2c-4-10-10-16-16-16-14 0-34 2-42 4Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5" stroke-linejoin="round"/><circle cx="98" cy="48" r="6" fill="#fff" stroke="#E6DCD8" stroke-width="2"/><rect x="24" y="32" width="70" height="10" rx="5" fill="#fff" stroke="#E6DCD8" stroke-width="2"/><path d="M34 70c4 18 14 26 26 26s22-8 26-26c-6 8-14 8-26 8s-20 0-26-8Z" fill="#fff" stroke="#E6DCD8" stroke-width="2"/><path d="M34 98c6-4 46-4 52 0v14c-6 8-46 8-52 0Z" fill="#E5383B" stroke="#B3202A" stroke-width="2.5"/><rect x="32" y="104" width="56" height="6" fill="#3C3C3C"/><rect x="55" y="102" width="10" height="10" rx="2" fill="#FFC800" stroke="#D9A300" stroke-width="1.5"/>`),
    nutcracker: () => S(fox() + `<path d="M36 34V8h48v26Z" fill="#3C3C3C"/><rect x="34" y="28" width="52" height="8" rx="3" fill="#FFC800" stroke="#D9A300" stroke-width="2"/><path d="M42 10h36M42 18h36" stroke="#E5383B" stroke-width="3"/><path d="M76 4c4-6 10-4 8 2" fill="#1FA45A"/><path d="M32 96c4-10 16-14 28-14s24 4 28 14v12c-6 10-50 10-56 0Z" fill="#1CB0F6" stroke="#0A85C2" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 84v30" stroke="#FFC800" stroke-width="3"/><circle cx="54" cy="94" r="2.5" fill="#FFC800"/><circle cx="66" cy="94" r="2.5" fill="#FFC800"/><circle cx="54" cy="104" r="2.5" fill="#FFC800"/><circle cx="66" cy="104" r="2.5" fill="#FFC800"/><path d="M40 74h40" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`),
    golden: () => S(fox({ fur: '#FFC800', edge: '#B98500', belly: '#FFF4CC', inner: '#B98500' }) + `<path d="M60 2l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#FFF4CC" stroke="#D9A300" stroke-width="2" stroke-linejoin="round"/><path d="M20 70l3-6 3 6-3 6Z M100 86l3-6 3 6-3 6Z M96 22l2-4 2 4-2 4Z" fill="#FFE38A"/>`),
  };
  const figure = id => (FIG[id] || FIG.elf)();
  // The bag: a Knox-orange foil bag with a crimped top, Knox's face and a "?".
  const BAG = `<svg class="kb-bag-art" viewBox="0 0 160 200" aria-hidden="true" focusable="false">
    <g class="kb-bag-top"><path d="M24 30 32 18 40 30 48 18 56 30 64 18 72 30 80 18 88 30 96 18 104 30 112 18 120 30 128 18 136 30V44H24Z" fill="#FF6B00" stroke="#CC5500" stroke-width="3" stroke-linejoin="round"/><path d="M24 40h112" stroke="#CC5500" stroke-width="2" stroke-dasharray="5 5"/></g>
    <g class="kb-bag-body"><path d="M24 44h112l8 140a10 10 0 0 1-10 11H26a10 10 0 0 1-10-11Z" fill="#FF6B00" stroke="#CC5500" stroke-width="3" stroke-linejoin="round"/>
      <path d="M36 52l-4 120" stroke="#FFB27A" stroke-width="8" stroke-linecap="round" opacity=".7"/>
      <rect x="34" y="150" width="92" height="30" rx="10" fill="#FFF8F0" stroke="#CC5500" stroke-width="2.5"/>
      <text x="80" y="170" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="12.5" letter-spacing=".5" fill="#CC5500">KNOX KNOWS</text>
      <g transform="translate(40 62) scale(.66)">${fox().replace(/<path d="M88 104[^/]*\/><path d="M104 80[^/]*\/>/, '').replace(/<ellipse cx="60" cy="102"[^>]*\/><ellipse cx="60" cy="108"[^>]*\/>/, '')}</g>
      <circle cx="124" cy="64" r="15" fill="#FFC800" stroke="#D9A300" stroke-width="3"/><text x="124" y="71" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="20" fill="#7A5400">?</text>
      <path d="M30 128c10-6 16 0 24-6M106 132c8-6 14 0 22-6" fill="none" stroke="#FFE0C2" stroke-width="3" stroke-linecap="round"/></g>
  </svg>`;

  // ── Data ────────────────────────────────────────────────────────────────
  let state = null, error = '', busy = false;
  // Testing: the preview's demo has unlimited bags (∞), so every figure and animation can be tried.
  const demoState = () => ({ demo: true, unlimited: true, unopened: 99, got: { elf: 1, snowman: 2, reindeer: 1, cocoa: 3, skater: 1 }, dupes: 3, complete: false, claimed: false, giftCode: '', questions: 6 });
  async function api(method, body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Sign in to open blind bags.');
    const token = await user.getIdToken();
    const test = (() => { try { return sessionStorage.getItem('knoxFlameTest') === '1'; } catch (e) { return false; } })();
    const r = await fetch('/api/flame-fest' + (method === 'GET' ? '?event=bags' : ''), { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(test ? { 'X-Knox-Flame-Test': '1' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Blind bags are busy right now. Please try again.');
    return j;
  }
  async function load() {
    if (demo) { state = state || demoState(); return; }
    try { state = await api('GET'); error = ''; } catch (e) { error = e.message; }
  }
  // The odds per bag (the server's RARITY_ODDS): Golden Knox is 1 in 100.
  // Within a rarity, one you're missing comes before a duplicate.
  const ODDS = { common: 64, rare: 25, epic: 10, secret: 1 };
  // Demo opening: the same rules as the server.
  function demoPick(got) {
    let r = Math.random() * 100, rarity = 'common';
    for (const [k, pct] of Object.entries(ODDS)) { r -= pct; if (r < 0) { rarity = k; break; } }
    const pool = SERIES.filter(c => c.rarity === rarity), missing = pool.filter(c => !got[c.id]);
    const from = missing.length ? missing : pool;
    return from[Math.floor(Math.random() * from.length)];
  }
  const oddsHtml = () => `<div class="kb-odds" aria-label="Odds per bag"><b>Odds per bag</b>${['common', 'rare', 'epic', 'secret'].map(k => `<span class="kb-odd r-${k}">${RARITY[k]} <em>${k === 'secret' ? '1 in 100' : ODDS[k] + '%'}</em></span>`).join('')}<small>Within each rarity, you always get one you’re missing before a duplicate.</small></div>`;

  // ── The screen ──────────────────────────────────────────────────────────
  let wrap = null, lastFocus = null;
  function render() {
    if (!wrap) return;
    const card = wrap.querySelector('.kb-card');
    if (!state) { card.innerHTML = head() + `<p class="kb-note">${error ? esc(error) : 'Opening your collection…'}</p>`; return; }
    const owned = SERIES.filter(c => state.got[c.id]).length;
    card.innerHTML = ki(head() +
      `<div class="kb-stage">
        <div class="kb-bag${state.unopened ? '' : ' is-empty'}">${BAG}${state.unlimited ? '<span class="kb-count">∞</span>' : state.unopened > 1 ? `<span class="kb-count">×${state.unopened}</span>` : ''}</div>
        <div class="kb-stage-copy">
          <b>${state.unlimited ? 'Unlimited test bags!' : state.unopened ? `You have ${state.unopened} bag${state.unopened === 1 ? '' : 's'}!` : 'No bags right now'}</b>
          <span>${state.unopened ? 'Tear one open to find out who’s inside.' : `Earn them behind Advent Calendar doors and for every 10 questions you ask (${state.questions || 0}/10 toward the next).`}</span>
          <button type="button" class="kb-btn" data-open${state.unopened ? '' : ' disabled'}>🛍️ Open a bag</button>
        </div>
      </div>
      <div class="kb-meta"><span><b>${owned}</b> of 12 collected</span>${state.dupes >= 3 ? '<button type="button" class="kb-trade" data-trade>Trade 3 duplicates for a bag</button>' : `<span>${state.dupes} duplicate${state.dupes === 1 ? '' : 's'} · 3 trade in for a bag</span>`}</div>
      ${reward(owned)}
      ${oddsHtml()}
      <div class="kb-grid">${SERIES.map(slot).join('')}</div>
      <p class="kb-note">Collect all 12 for 30 days of Mega Knox (a Mega month to gift if you have it), the Collector badge and the Golden Flame. Bags are always earned, never sold.${state.demo ? ' <b>Demo:</b> nothing is saved.' : ''}</p>`);
  }
  const head = () => `<button type="button" class="kb-x" data-close aria-label="Close">✕</button><div class="kb-head"><span class="kb-badge">🛍️ Blind bags · Series 1</span><h2 id="kbTitle">Knox’s <span>Christmas</span></h2><p>12 figures to collect, including a secret one.</p></div>`;
  function slot(c) {
    const n = state.got[c.id] || 0;
    return n ? `<div class="kb-slot r-${c.rarity}" title="${esc(c.name)}"><div class="kb-slot-art">${figure(c.id)}</div><b>${esc(c.name)}</b><small>${RARITY[c.rarity]}${n > 1 ? ` · ×${n}` : ''}</small></div>`
      : `<div class="kb-slot is-missing" title="Not found yet"><div class="kb-slot-art">${c.rarity === 'secret' ? '<span class="kb-secret">?</span>' : figure(c.id)}</div><b>???</b><small>${c.rarity === 'secret' ? 'Secret' : RARITY[c.rarity]}</small></div>`;
  }
  function reward(owned) {
    if (state.claimed) return `<div class="kb-reward done">🏆 <span>Collection complete! ${state.giftCode ? `Your Mega month to gift: <a href="/redeem?code=${esc(state.giftCode)}" target="_blank" rel="noopener">knoxknowsapp.com/redeem?code=${esc(state.giftCode)}</a>` : '30 days of Mega Knox, the Collector badge and the Golden Flame are yours.'}</span></div>`;
    if (state.complete) return `<div class="kb-reward">🏆 <span><b>You collected all 12!</b> Claim your collector reward.</span><button type="button" class="kb-btn" data-claim>Claim</button></div>`;
    return `<div class="kb-progress" role="progressbar" aria-valuemin="0" aria-valuemax="12" aria-valuenow="${owned}" aria-label="Collection progress"><span style="width:${owned / 12 * 100}%"></span></div>`;
  }

  // Opening: the bag shakes, the top tears off, and the figure pops out with a
  // burst in its rarity color, marked NEW! or Duplicate.
  async function openBag() {
    if (busy || !state?.unopened) return;
    busy = true;
    // The full experience: the 3D bag you swipe open (bags3d.js). Without WebGL
    // or with reduced motion, the simple opening below.
    if (window.knoxBagStage?.supported()) {
      // Called only once the bag is torn (closing before that keeps the bag).
      const pick = async () => {
        let got;
        if (demo) {
          const fig = demoPick(state.got), isNew = !state.got[fig.id];
          state.got[fig.id] = (state.got[fig.id] || 0) + 1; if (!state.unlimited) state.unopened--; state.dupes += isNew ? 0 : 1;
          state.complete = SERIES.every(c => state.got[c.id]);
          got = { figure: fig.id, isNew };
        } else { const res = await api('POST', { bags: 'open' }); state = res; got = res; }
        const c = SERIES.find(x => x.id === got.figure);
        return { figure: c.id, isNew: got.isNew, rarity: c.rarity, name: esc(c.name), art: figure(c.id), more: state.unopened > 0 };
      };
      try {
        await window.knoxBagStage.play({ result: pick, onReveal: (how, err) => {
          busy = false; render();
          if (err) toast(err.message);
          if (how === 'again') setTimeout(openBag, 80); else wrap?.querySelector('[data-open], .kb-x')?.focus();
        } });
        return;
      } catch (e) { /* 3D couldn't start: fall back to the simple opening */ }
    }
    const bag = wrap.querySelector('.kb-bag');
    bag.classList.add('is-shaking');
    let got;
    try {
      if (demo) {
        const fig = demoPick(state.got), isNew = !state.got[fig.id];
        state.got[fig.id] = (state.got[fig.id] || 0) + 1; if (!state.unlimited) state.unopened--; state.dupes += isNew ? 0 : 1;
        state.complete = SERIES.every(c => state.got[c.id]);
        got = { figure: fig.id, isNew };
      } else { const res = await api('POST', { bags: 'open' }); got = res; state = res; }
    } catch (e) { bag.classList.remove('is-shaking'); busy = false; toast(e.message); return; }
    await wait(reduce() ? 0 : 700);
    bag.classList.remove('is-shaking'); bag.classList.add('is-torn');
    await wait(reduce() ? 0 : 450);
    reveal(SERIES.find(c => c.id === got.figure), got.isNew);
    busy = false;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function reveal(c, isNew) {
    const pop = document.createElement('div');
    pop.className = 'kb-reveal r-' + c.rarity;
    pop.innerHTML = ki(`<div class="kb-reveal-card" role="dialog" aria-modal="true" aria-labelledby="kbRevealName">
      <div class="kb-burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join('')}</div>
      <span class="kb-tag ${isNew ? 'new' : 'dup'}">${isNew ? 'NEW!' : 'Duplicate'}</span>
      <div class="kb-reveal-art">${figure(c.id)}</div>
      <span class="kb-rarity">${RARITY[c.rarity]}</span>
      <h3 id="kbRevealName">${esc(c.name)}</h3>
      <p>${isNew ? (c.rarity === 'secret' ? 'The secret figure! You found Golden Knox.' : 'Added to your collection.') : 'You already have this one. 3 duplicates trade in for a new bag.'}</p>
      <button type="button" class="kb-btn" data-done>${state.unopened ? 'Open another' : 'Yay!'}</button>
    </div>`);
    const done = again => { pop.remove(); render(); if (again && state.unopened) openBag(); else wrap?.querySelector('[data-open], .kb-x')?.focus(); };
    pop.addEventListener('click', e => { if (e.target.closest('[data-done]')) done(true); else if (e.target === pop) done(false); });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    wrap.append(pop);
    pop.querySelector('[data-done]').focus();
  }
  async function trade() {
    if (busy) return; busy = true;
    try {
      if (demo) { let left = 3; for (const c of [...SERIES].reverse()) while (left && state.got[c.id] > 1) { state.got[c.id]--; left--; } state.dupes -= 3; state.unopened++; }
      else state = await api('POST', { bags: 'trade' });
      render(); toast('Traded 3 duplicates for a new bag! 🛍️');
    } catch (e) { toast(e.message); }
    busy = false;
  }
  async function claim() {
    if (busy) return; busy = true;
    try {
      if (demo) { state.claimed = true; } else { state = await api('POST', { bags: 'claim' }); window.knoxRefreshPlan?.(); window.loadStreak?.(window.currentUser?.uid); }
      render(); toast('🏆 Collector reward claimed!');
    } catch (e) { toast(e.message); }
    busy = false;
  }
  function toast(t) {
    const n = wrap?.querySelector('.kb-note'); if (!n) return;
    n.textContent = t; n.classList.add('kb-flash'); setTimeout(() => n.classList.remove('kb-flash'), 1400);
  }
  async function open() {
    if (!window.currentUser && !demo) { window.openAuthModal?.('signup'); return; }
    if (wrap) return;
    lastFocus = document.activeElement;
    wrap = document.createElement('div');
    wrap.className = 'kb-wrap';
    wrap.innerHTML = '<div class="kb-card" role="dialog" aria-modal="true" aria-labelledby="kbTitle"></div>';
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-open]') || e.target.closest('.kb-bag:not(.is-empty)')) { openBag(); return; }
      if (e.target.closest('[data-trade]')) { trade(); return; }
      if (e.target.closest('[data-claim]')) claim();
    });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.querySelector('.kb-reveal')) close(); });
    document.body.append(wrap);
    window.knoxBagStage?.preload?.(); // get the 3D bag ready while the collection loads
    render(); await load(); render();
    wrap?.querySelector('[data-open]:not([disabled]), .kb-x')?.focus();
  }
  function close() { if (!wrap) return; wrap.remove(); wrap = null; lastFocus?.focus?.(); }
  addEventListener('knox-auth-changed', () => { state = null; close(); });
  window.knoxBags = { open, close, figure, series: SERIES };
})();
