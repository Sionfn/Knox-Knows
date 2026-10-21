// support-widget.js — Knox Support: the round chat button beside the message
// box and the panel it opens (Home · Messages · Help).
//   Home      greeting, "Send us a message", help search, top questions, links
//   Messages  the student's conversations with Knox Support / the Knox team
//   Help      searchable answers (moved here from the old Help & support modal)
// Conversations are stored server-side (api/_support.js via /api/me?route=support).
// Knox Support answers account questions; refunds and anything it can't solve
// go to the Knox team, who reply from /admin — replies show up here with a badge.
(function () {
  'use strict';
  const API = '/api/me?route=support';
  const HELP = [
    ['Can I get a refund?', 'You can get a full refund within 7 days of your first payment on a monthly plan, or 14 days on a yearly plan. Bought before November 1, 2026? You keep the 30-day window you signed up with. Send us a message and Knox Support will check your account — see our <a href="/refund" target="_blank">Refund Policy</a>.', 'refund money back'],
    ['How do I cancel my plan?', 'Tap your profile → <b>Account &amp; Plan</b> → <b>Manage Billing</b>, then cancel there. You keep your plan until the end of the time you paid for.', 'cancel subscription stop billing unsubscribe'],
    ['Will I be charged after the Mega Knox free trial?', 'Yes, unless you cancel before it ends. The 3-day trial on Mega Knox monthly is for first-time subscribers; after it, $12.99/month starts automatically. Cancel anytime from <b>Account &amp; Plan → Manage Billing</b>.', 'trial charge billing'],
    ['I paid but my plan isn’t showing.', 'Make sure you’re signed in with the same email you used to pay, then refresh the page. Plans from a gift code show after you redeem it. Still missing? Send us a message and we’ll fix it.', 'plan missing not showing paid wrong account'],
    ['How do I move from Knox Plus to Mega Knox?', 'Tap your profile → <b>Account &amp; Plan</b> → <b>Upgrade to Mega Knox</b>, or open <a href="/about#pricing" target="_blank">Plans</a>.', 'upgrade switch plan plus mega'],
    ['How do I redeem a gift code?', 'Tap your profile → <b>Redeem a code</b>, or go to <a href="/redeem" target="_blank">knoxknowsapp.com/redeem</a>. Gift codes never renew and you’re never charged for them.', 'gift code redeem'],
    ['How do I give Knox as a gift?', 'Tap your profile → <b>Give a gift</b>. Pick Knox Plus or Mega Knox for 1, 3 or 12 months — it’s a one-time payment and the code arrives by email.', 'gift buy present'],
    ['How many questions do I get on the free plan?', 'You start with 10 questions, and 5 more come back every day (you can save up to 20). A photo or file counts as 2. Knox Plus and Mega Knox are unlimited.', 'free questions limit credits'],
    ['How does Learn mode work?', 'Learn teaches you step by step instead of handing over the answer: a small piece at a time, with tap-to-answer questions, hints, and a recap at the end. Learn is free with a Knox account.', 'learn mode lesson teach'],
    ['How do I connect the Knox Discord?', 'Join from the Discord card in the sidebar, then type <b>/link</b> in the server to connect your Knox account — Knox Plus and Mega Knox members get their perks there automatically. Use <b>/ask</b> to ask Knox.', 'discord link server role'],
    ['How do I get the Chrome extension?', 'Get <a href="https://chromewebstore.google.com/detail/knox-knows-%E2%80%94-ai-homework/pjhciemclfgmgfapnecoageieniegfnp" target="_blank" rel="noopener">Knox Knows for Chrome</a>, then sign in with the same account to ask Knox from any website.', 'chrome extension browser'],
    ['What is Flame Fest?', 'All November, every day you study lights a flame on your calendar. Hit each week’s goal for rewards and light 20 flames for a free week of Mega Knox. Open it from your 🔥 streak.', 'flame fest streak november rewards'],
    ['Does Knox save my chats?', 'Yes — when you’re signed in, your chats are saved in Recent chats on any device.', 'history chats saved'],
    ['What if Knox gets something wrong?', 'Knox is AI and can make mistakes, so check important answers. Tap 👎 under a reply to tell us — it helps Knox get better.', 'wrong mistake incorrect report'],
    ['How do I delete my account?', 'Tap your profile → <b>Account &amp; Plan</b> → <b>Delete my account</b>. We’ll confirm it’s you and delete your account and data.', 'delete account remove data privacy'],
  ];
  const STARTERS = [
    ['💸', 'Can I get a refund?'],
    ['✋', 'How do I cancel my plan?'],
    ['🔎', 'My plan isn’t showing'],
    ['🙋', 'Talk to a person', 'human'],
  ];
  const ICON = {
    chat: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M5 3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-1v3.5L13.5 18H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M7.5 11.5q4.5 3.5 9 0" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8.5 15.5q3.5 2.5 7 0" stroke-linecap="round"/></svg>',
    msgs: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9h8M8 12.5h5"/></svg>',
    help: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };
  const LOGO = '<img src="/knox-logo-square.jpg" alt="" draggable="false">';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = s => esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,!?)]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>');
  const plain = html => String(html).replace(/<[^>]+>/g, ' ');
  const ago = ms => {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + 'd';
    return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ── State ──
  const st = { open: false, tab: 'home', chats: null, chat: null, view: 'list', busy: false, action: null, helpQ: '', helpOpen: -1, error: '' };
  const user = () => window.currentUser || null;
  const firstName = () => {
    const u = user();
    const n = (u?.displayName || '').trim().split(/\s+/)[0] || (u?.email || '').split('@')[0].split(/[._\d]/)[0];
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
  };

  async function call(body) {
    const u = user();
    if (!u?.getIdToken) throw new Error('Sign in to message the Knox team.');
    const r = await fetch(API, { method: 'POST', headers: { Authorization: 'Bearer ' + await u.getIdToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  // ── DOM ──
  const launcher = document.createElement('button');
  launcher.id = 'ksLauncher';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Help & messages');
  launcher.innerHTML = `<span class="ks-l-icon ks-l-chat">${ICON.chat}</span><span class="ks-l-icon ks-l-down">${ICON.down}</span><span class="ks-badge" hidden></span>`;
  const panel = document.createElement('section');
  panel.id = 'ksPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Knox Support');
  panel.hidden = true;
  panel.innerHTML = `<div class="ks-body" id="ksBody"></div>
    <nav class="ks-nav" aria-label="Support">
      <button type="button" data-tab="home">${ICON.home}<span>Home</span></button>
      <button type="button" data-tab="messages">${ICON.msgs}<span>Messages</span><i class="ks-dot" hidden></i></button>
      <button type="button" data-tab="help">${ICON.help}<span>Help</span></button>
    </nav>`;
  (document.getElementById('inputOuter') || document.body).appendChild(launcher);
  document.body.appendChild(panel);
  const body = panel.querySelector('#ksBody');

  function unreadCount() { return (st.chats || []).reduce((n, c) => n + (c.unread || 0), 0); }
  function syncBadge() {
    const n = unreadCount(), b = launcher.querySelector('.ks-badge');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
    panel.querySelector('.ks-dot').hidden = !n;
  }

  // ── Views ──
  function homeView() {
    const name = firstName(), recent = (st.chats || [])[0];
    const top = HELP.slice(0, 4).map((h, i) => `<button type="button" class="ks-row" data-help="${i}"><span>${esc(h[0])}</span>${ICON.arrow}</button>`).join('');
    return `<div class="ks-hero">
        <div class="ks-hero-top">${LOGO}<button type="button" class="ks-x" data-close aria-label="Close">${ICON.close}</button></div>
        <p class="ks-hi">Hi ${name ? esc(name) : 'there'} 👋</p>
        <h2 class="ks-how">How can we help?</h2>
      </div>
      <div class="ks-cards">
        ${recent ? `<button type="button" class="ks-card ks-recent" data-chat="${esc(recent.id)}">
            <span class="ks-card-label">Recent message</span>
            <span class="ks-recent-row">${LOGO}<span class="ks-recent-text"><b>${esc(recent.last?.from === 'user' ? 'You' : recent.last?.from === 'team' ? 'Knox team' : 'Knox Support')}</b><span>${esc(recent.last?.text || recent.title)}</span></span>${recent.unread ? '<i class="ks-pill-dot"></i>' : ''}</span>
          </button>` : ''}
        <button type="button" class="ks-card ks-ask" data-new>
          <span><b>Send us a message</b><span>Knox Support and the Knox team can help</span></span>
          <span class="ks-ask-go">${ICON.send}</span>
        </button>
        <div class="ks-card ks-search-card">
          <button type="button" class="ks-search-btn" data-tab="help"><span>Search for help</span>${ICON.search}</button>
          ${top}
        </div>
        <a class="ks-card ks-link" href="https://chromewebstore.google.com/detail/knox-knows-%E2%80%94-ai-homework/pjhciemclfgmgfapnecoageieniegfnp" target="_blank" rel="noopener"><span><b>Get Knox for Chrome</b><span>Ask Knox from any website</span></span>${ICON.out}</a>
        <a class="ks-card ks-link" href="/refund" target="_blank"><span><b>Refund Policy</b><span>7 days monthly · 14 days yearly</span></span>${ICON.out}</a>
      </div>`;
  }

  function messagesListView() {
    const head = `<header class="ks-head"><h2>Messages</h2><button type="button" class="ks-x" data-close aria-label="Close">${ICON.close}</button></header>`;
    if (!user()) {
      return head + `<div class="ks-empty">${LOGO}<b>Sign in to message us</b><span>Knox Support can check your plan, billing and refunds once you're signed in.</span>
        <button type="button" class="ks-btn" data-signin>Sign in</button>
        <span class="ks-small">Or email <a href="mailto:support@knoxknowsapp.com">support@knoxknowsapp.com</a></span></div>`;
    }
    if (st.chats === null) return head + '<div class="ks-loading"><i></i><i></i><i></i></div>';
    const list = st.chats.map(c => `<button type="button" class="ks-conv${c.unread ? ' unread' : ''}" data-chat="${esc(c.id)}">
        ${LOGO}
        <span class="ks-conv-main"><span class="ks-conv-top"><b>${esc(c.title || 'Conversation')}</b><time>${ago(c.updatedAt)}</time></span>
          <span class="ks-conv-last">${esc(c.last ? (c.last.from === 'user' ? 'You: ' : c.last.from === 'team' ? 'Knox team: ' : '') + c.last.text : '')}</span>
          ${c.status === 'waiting' ? '<span class="ks-tag wait">With the Knox team</span>' : c.status === 'replied' ? '<span class="ks-tag replied">Knox team replied</span>' : c.status === 'closed' ? '<span class="ks-tag">Solved</span>' : ''}
        </span>${c.unread ? '<i class="ks-pill-dot"></i>' : ''}</button>`).join('');
    return head + (st.chats.length ? `<div class="ks-convs">${list}</div>` : `<div class="ks-empty">${LOGO}<b>No messages yet</b><span>Questions about your plan, billing or a refund? We're here.</span></div>`) +
      `<div class="ks-foot"><button type="button" class="ks-btn" data-new>Send us a message ${ICON.send}</button></div>`;
  }

  function msgHtml(m) {
    if (m.note) return `<div class="ks-note">${linkify(m.text)}</div>`;
    if (m.from === 'user') return `<div class="ks-msg me"><div class="ks-bubble">${linkify(m.text)}</div></div>`;
    const who = m.from === 'team' ? 'Knox team' : 'Knox Support';
    return `<div class="ks-msg them${m.from === 'team' ? ' team' : ''}">${LOGO}<div><span class="ks-who">${who}${m.from === 'team' ? ' <i>Person</i>' : ''}</span><div class="ks-bubble">${linkify(m.text)}</div></div></div>`;
  }

  function chatView() {
    const c = st.chat, msgs = c?.messages || [];
    const withTeam = c && (c.status === 'waiting' || c.status === 'replied');
    const greet = `<div class="ks-msg them">${LOGO}<div><span class="ks-who">Knox Support</span><div class="ks-bubble">Hi${firstName() ? ' ' + esc(firstName()) : ''}! I'm Knox Support 🦊 I can help with your plan, billing, refunds, gift codes and more. What's up?</div></div></div>`;
    const starters = !msgs.length ? `<div class="ks-starters">${STARTERS.map(([e, t, k]) => `<button type="button" data-starter="${esc(t)}"${k ? ` data-kind="${k}"` : ''}><span aria-hidden="true">${e}</span>${esc(t)}</button>`).join('')}</div>` : '';
    const act = st.action && !withTeam ? `<div class="ks-action"><b>${st.action === 'refund' ? 'Send your refund request to the Knox team?' : 'Send this to the Knox team?'}</b><span>A person reads it and replies here and by email.</span>
        <div><button type="button" class="ks-btn" data-handoff="${st.action}">${st.action === 'refund' ? 'Send refund request' : 'Send to the Knox team'}</button><button type="button" class="ks-btn ghost" data-dismiss>Not now</button></div></div>` : '';
    const typing = st.busy ? `<div class="ks-msg them">${LOGO}<div><div class="ks-bubble ks-typing"><i></i><i></i><i></i></div></div></div>` : '';
    return `<header class="ks-head chat">
        <button type="button" class="ks-x" data-back aria-label="Back">${ICON.back}</button>
        <span class="ks-head-who">${LOGO}<span><b>Knox Support</b><span>${withTeam ? 'The Knox team will reply here' : 'The Knox team can step in'}</span></span></span>
        <button type="button" class="ks-x" data-close aria-label="Close">${ICON.close}</button>
      </header>
      <div class="ks-thread" id="ksThread">${greet}${msgs.map(msgHtml).join('')}${typing}${act}${starters}
        ${st.error ? `<div class="ks-err">${esc(st.error)}</div>` : ''}</div>
      ${c && !withTeam && msgs.length && !st.action ? `<button type="button" class="ks-person" data-handoff="human">🙋 Talk to the Knox team</button>` : ''}
      <form class="ks-compose" id="ksCompose">
        <textarea id="ksInput" rows="1" maxlength="1500" placeholder="${withTeam ? 'Message the Knox team…' : 'Ask a question…'}" aria-label="Message"></textarea>
        <button type="submit" aria-label="Send"${st.busy ? ' disabled' : ''}>${ICON.send}</button>
      </form>`;
  }

  function helpView() {
    const words = st.helpQ.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = HELP.map((h, i) => [h, i]).filter(([[t, b, tags]]) => { const x = (t + ' ' + plain(b) + ' ' + tags).toLowerCase(); return words.every(w => x.includes(w)); });
    return `<header class="ks-head"><h2>Help</h2><button type="button" class="ks-x" data-close aria-label="Close">${ICON.close}</button></header>
      <div class="ks-help">
        <label class="ks-search">${ICON.search}<input type="search" id="ksHelpSearch" placeholder="Search for help" value="${esc(st.helpQ)}" autocomplete="off" aria-label="Search help"></label>
        <div class="ks-articles">${hits.map(([[t, b], i]) => `<details class="ks-article"${st.helpOpen === i || (words.length && hits.length <= 2) ? ' open' : ''} data-i="${i}"><summary>${esc(t)}</summary><p>${b}</p></details>`).join('') || '<p class="ks-small">No answers match that — send us a message and we’ll help.</p>'}</div>
        <div class="ks-still"><span><b>Still need help?</b><span>Knox Support can check your account.</span></span><button type="button" class="ks-btn" data-new>Message us</button></div>
      </div>`;
  }

  function render() {
    panel.querySelectorAll('.ks-nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
    panel.classList.toggle('in-chat', st.tab === 'messages' && st.view === 'chat');
    panel.dataset.tab = st.tab;
    // Keep a half-typed message when the view refreshes (new replies arriving).
    const old = body.querySelector('#ksInput'), draft = old?.value || '', hadFocus = old && document.activeElement === old;
    body.innerHTML = st.tab === 'home' ? homeView() : st.tab === 'help' ? helpView() : st.view === 'chat' ? chatView() : messagesListView();
    syncBadge();
    if (st.tab === 'messages' && st.view === 'chat') {
      const t = body.querySelector('#ksThread'); t.scrollTop = t.scrollHeight;
      const input = body.querySelector('#ksInput');
      if (input && draft) { input.value = draft; input.dispatchEvent(new Event('input', { bubbles: true })); }
      if (input && (hadFocus || window.matchMedia('(pointer:fine)').matches)) input.focus({ preventScroll: true });
    }
    if (st.tab === 'help') {
      const s = body.querySelector('#ksHelpSearch');
      s.addEventListener('input', () => { st.helpQ = s.value; const pos = s.selectionStart; render(); const n = body.querySelector('#ksHelpSearch'); n.focus(); n.setSelectionRange(pos, pos); });
      const open = body.querySelector('.ks-article[open]'); if (open && st.helpOpen >= 0) open.scrollIntoView({ block: 'nearest' });
    }
  }

  async function loadChats() {
    if (!user()) { st.chats = []; syncBadge(); return; }
    try { st.chats = (await call({ action: 'list' })).chats || []; } catch { if (st.chats === null) st.chats = []; }
    if (st.open && (st.tab === 'home' || (st.tab === 'messages' && st.view === 'list'))) render(); else syncBadge();
  }

  async function openChat(id) {
    st.tab = 'messages'; st.view = 'chat'; st.action = null; st.error = '';
    st.chat = (st.chats || []).find(c => c.id === id) ? { id, messages: [], status: 'open' } : null;
    render();
    try {
      st.chat = (await call({ action: 'get', id })).chat;
      const s = (st.chats || []).find(c => c.id === id); if (s) s.unread = 0;
    } catch (e) { st.error = e.message; }
    render();
  }

  function newChat() {
    st.tab = 'messages';
    if (!user()) { st.view = 'list'; render(); return; }
    st.view = 'chat'; st.chat = null; st.action = null; st.error = ''; render();
  }

  async function say(text, kind) {
    text = text.trim();
    if (!text || st.busy) return;
    const input = body.querySelector('#ksInput'); if (input) input.value = '';
    st.error = ''; st.action = null; st.busy = true;
    const c = st.chat || { id: null, messages: [], status: 'open' };
    st.chat = { ...c, messages: [...c.messages, { from: 'user', text, at: Date.now() }] };
    render();
    try {
      const r = await call({ action: 'say', id: c.id, text });
      st.chat = r.chat; st.action = r.action || null;
      if (kind === 'human') { st.busy = false; return handoff('human'); }
    } catch (e) { st.error = e.message; st.chat = c.id ? c : (c.messages.length ? c : null); }
    st.busy = false;
    render();
    loadChats();
  }

  async function handoff(kind) {
    if (!st.chat?.id || st.busy) return;
    st.busy = true; st.action = null; render();
    try { st.chat = (await call({ action: 'handoff', id: st.chat.id, kind })).chat; }
    catch (e) { st.error = e.message; }
    st.busy = false; render(); loadChats();
  }

  // ── Open / close ──
  function open(tab) {
    st.open = true;
    if (tab) { st.tab = tab; if (tab === 'messages') st.view = 'list'; }
    panel.hidden = false;
    document.documentElement.classList.add('ks-open');
    requestAnimationFrame(() => panel.classList.add('show'));
    launcher.classList.add('open');
    render();
    loadChats();
  }
  function close() {
    st.open = false;
    panel.classList.remove('show');
    launcher.classList.remove('open');
    document.documentElement.classList.remove('ks-open');
    setTimeout(() => { if (!st.open) panel.hidden = true; }, 180);
  }
  window.openSupport = open;
  window.closeSupport = close;
  window.openHelp = () => open('help');   // profile menu → Help & support
  launcher.addEventListener('click', () => (st.open ? close() : open()));

  panel.addEventListener('click', e => {
    const t = e.target.closest('button, a, summary');
    if (!t) return;
    if (t.matches('summary')) { const d = t.parentElement; st.helpOpen = d.open ? -1 : +d.dataset.i; return; }
    if (t.dataset.tab) { st.tab = t.dataset.tab; if (st.tab === 'messages' && st.view === 'chat' && !st.chat) st.view = 'list'; render(); if (st.tab !== 'help') loadChats(); return; }
    if (t.hasAttribute('data-close')) return close();
    if (t.hasAttribute('data-back')) { st.view = 'list'; st.chat = null; st.action = null; render(); return loadChats(); }
    if (t.hasAttribute('data-new')) return newChat();
    if (t.dataset.chat) return openChat(t.dataset.chat);
    if (t.dataset.help) { st.tab = 'help'; st.helpQ = ''; st.helpOpen = +t.dataset.help; return render(); }
    if (t.dataset.starter) return say(t.dataset.starter, t.dataset.kind);
    if (t.dataset.handoff) return handoff(t.dataset.handoff);
    if (t.hasAttribute('data-dismiss')) { st.action = null; return render(); }
    if (t.hasAttribute('data-signin')) { close(); window.openAuthModal?.('signin'); }
  });
  panel.addEventListener('submit', e => {
    e.preventDefault();
    const i = body.querySelector('#ksInput');
    if (i) say(i.value);
  });
  panel.addEventListener('keydown', e => {
    if (e.target.id === 'ksInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); say(e.target.value); }
  });
  panel.addEventListener('input', e => {
    if (e.target.id !== 'ksInput') return;
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.open && !document.querySelector('.modal-backdrop[style*="flex"]')) close(); });

  // Signed in / out: refresh the badge; a reply from the Knox team shows up
  // within a few minutes while Knox is open.
  window.addEventListener('knox-auth-changed', () => { st.chats = null; st.chat = null; st.view = 'list'; loadChats(); });
  // Live updates: an open conversation checks every 5 seconds, the open panel
  // every 15, and the badge every 45 while Knox is on screen.
  let ticks = 0;
  async function refreshChat() {
    const id = st.chat?.id;
    try {
      const c = (await call({ action: 'get', id })).chat;
      if (st.chat?.id !== id || st.busy) return;
      if (c.messages.length !== st.chat.messages.length || c.status !== st.chat.status) { st.chat = c; render(); }
    } catch {}
  }
  setInterval(() => {
    ticks++;
    if (!user() || document.visibilityState !== 'visible' || st.busy) return;
    if (st.open && st.tab === 'messages' && st.view === 'chat') { if (st.chat?.id) refreshChat(); }
    else if (st.open ? ticks % 3 === 0 : ticks % 9 === 0) loadChats();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !user()) return;
    if (st.open && st.view === 'chat' && st.chat?.id) refreshChat(); else loadChats();
  });
  if (user()) loadChats();

  // /app?open=help or ?open=messages (landing footer, reply emails).
  const want = new URLSearchParams(location.search).get('open');
  if (want === 'help') setTimeout(() => open('help'), 600);
  if (want === 'messages') {
    let tries = 0;
    const wait = setInterval(() => {
      if ((document.body.classList.contains('app-auth-pending') || !window.currentUser) && ++tries < 40) return;
      clearInterval(wait); open('messages');
    }, 200);
  }
})();
