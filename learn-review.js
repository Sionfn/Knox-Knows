(function () {
  let revision = 0, pending = null;
  // Last answer per account: the panel shows at once when Learn opens, then
  // quietly updates when the server answers (no late pop-in).
  const cache = new Map();
  // Each topic wears an icon for its subject (knox-icons.js), checked in order.
  const SUBJECTS = [
    [/essay|\bthesis\b|writing|paragraph|grammar|sentence|punctuation|citation|spelling/i, 'pencil'],
    [/reading|novel|poem|poetry|story|character|theme|literature|shakespeare|author|vocab/i, 'book'],
    [/\b(dna|genes?|genetic|heredity|chromosome|cells?|mitosis)\b/i, 'dna'],
    [/circuit|electric|current|voltage|batter|bulb|magnet|energy|force|motion|physics|gravity|wave/i, 'bulb'],
    [/\bmaps?\b|continent|countr|climate|weather|water cycle|evapor|condens|precipit|geograph|earth|ocean|region/i, 'globe'],
    [/atom|molecule|chemical|reaction|element|compound|acid|chem|\bions?\b/i, 'flask'],
    [/planet|space|solar|\bstars?\b|orbit|galax/i, 'rocket'],
    [/plant|photosynth|ecosystem|biolog|animal|organism|food (chain|web)|habitat/i, 'leaf'],
    [/heart|human body|body system|digest|organs?\b|blood|muscle|lung|health|nutrition/i, 'heart'],
    [/\bwars?\b|history|revolution|empire|ancient|government|constitution|civil|president|amendment|treaty|colon/i, 'columns'],
    [/\bdata\b|statistic|mean|median|mode\b|survey|probab/i, 'chart'],
    [/fraction|denominator|numerator|equation|algebra|math|number|percent|ratio|decimal|geometr|angle|triangle|area|slope|integer|multipl|divi|exponent|calculus|derivative|graph/i, 'math'],
  ];
  const topicIcon = item => (SUBJECTS.find(([re]) => re.test(item.label + ' ' + item.focus)) || [, 'brain'])[1];
  // × hides the panel until a new topic shows up (per account, this device).
  const hideKey = uid => 'knoxReviewHidden.' + uid;
  const topicsSig = items => items.map(i => i.id).sort().join(',') || 'none';
  const hiddenFor = (uid, items) => { try { return localStorage.getItem(hideKey(uid)) === topicsSig(items); } catch { return false; } };
  const panel = () => document.getElementById('learnReviewPanel');
  const field = () => document.getElementById('appChatInput');
  function hide() {
    revision++; pending = null;
    const p = panel(); if (p) { p.hidden = true; p.replaceChildren(); }
    document.getElementById('welcomeScreen')?.classList.remove('has-learn-review');
  }
  function same(uid, view, rev) {
    return revision === rev && window.currentUser?.uid === uid && window._appViewVersion === view && window._learnModeActive;
  }
  async function request(user, body) {
    const token = await user.getIdToken();
    const response = await fetch('/api/me?route=learn-review', {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type':'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Review topics could not be loaded.');
    return {items:Array.isArray(data.items) ? data.items : [],enabled:data.enabled!==false};
  }
  // Knox's own icon (knox-icons.js), not the system emoji.
  function icon() {
    const tile = document.createElement('span'); tile.className = 'lr-icon'; tile.setAttribute('aria-hidden', 'true');
    tile.innerHTML = window.KI ? window.KI('refresh') : '';
    return tile;
  }
  // Same size as the real panel, so nothing jumps when the topics arrive.
  function placeholder(user, view, rev) {
    const p = panel(); if (!p || !same(user.uid, view, rev)) return;
    p.hidden = false; p.replaceChildren();
    document.getElementById('welcomeScreen')?.classList.add('has-learn-review');
    const details = document.createElement('details'); details.className = 'lr-loading';
    const summary = document.createElement('summary'); summary.tabIndex = -1;
    summary.append(icon(), Object.assign(document.createElement('span'), { textContent: 'Review from your lessons' }));
    details.append(summary); p.append(details);
  }
  // Hidden with ×: a small pill in the same spot brings the panel back (open).
  function peek(data, user, view, rev) {
    const p = panel(); if (!p) return;
    p.replaceChildren(); document.getElementById('welcomeScreen')?.classList.remove('has-learn-review');
    const n = data.items.length;
    if (!n) { p.hidden = true; return; }
    p.hidden = false;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lr-peek';
    b.setAttribute('aria-label', 'Show Review from your lessons');
    b.append(icon(), Object.assign(document.createElement('span'), { textContent: n + (n === 1 ? ' review topic' : ' review topics') }));
    b.onclick = () => {
      if (!same(user.uid, view, rev)) return;
      try { localStorage.removeItem(hideKey(user.uid)); } catch {}
      render(data, user, view, rev, true);
      panel()?.querySelector('summary')?.focus({ preventScroll: true });
    };
    p.append(b);
  }
  function render(data, user, view, rev, open = false) {
    cache.set(user.uid, data);
    const {items,enabled}=data;
    const p = panel(); if (!p || !same(user.uid, view, rev)) return;
    if (hiddenFor(user.uid, items)) { peek(data, user, view, rev); return; }
    p.replaceChildren(); p.hidden = false;
    document.getElementById('welcomeScreen')?.classList.add('has-learn-review');
    const details = document.createElement('details'); details.open = open;
    const summary = document.createElement('summary');
    const count = document.createElement('span'); count.className = 'lr-count';
    count.textContent = items.length ? items.length + (items.length === 1 ? ' topic' : ' topics') : enabled ? '' : 'Off';
    summary.append(icon(), Object.assign(document.createElement('span'), { className: 'lr-title', textContent: 'Review from your lessons' }));
    if (count.textContent) summary.append(count);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'lr-close';
    close.textContent = '×'; close.title = 'Make this smaller'; close.setAttribute('aria-label', 'Hide Review from your lessons');
    close.onclick = e => {
      e.preventDefault(); e.stopPropagation(); // don't open/close the card
      try { localStorage.setItem(hideKey(user.uid), topicsSig(items)); } catch {}
      peek(data, user, view, rev);
      p.querySelector('.lr-peek')?.focus({ preventScroll: true });
    };
    summary.append(close);
    const intro = document.createElement('p'); intro.className = 'lr-intro';
    intro.textContent = !enabled ? 'Review memory is off. Learn still works normally.' : items.length
      ? 'Skills that were tricky last time. Knox asks you a fresh question on one.'
      : 'Skills that need another try will show up here, so you can practice them later.';
    const list = document.createElement('div'); list.className = 'lr-items';
    for (const item of [...items].sort((a,b) => a.dueAt-b.dueAt)) {
      const row = document.createElement('div'); row.className = 'lr-item';
      const copy = document.createElement('div'); copy.className = 'lr-copy';
      const title = document.createElement('strong'); title.textContent = item.label;
      const focus = document.createElement('p'); focus.textContent = item.focus;
      const due = item.dueAt <= Date.now();
      const when = document.createElement('small'); when.className = due ? 'due' : '';
      when.textContent = due ? 'Ready now' : 'Next review ' + new Date(item.dueAt).toLocaleDateString(undefined, {month:'short',day:'numeric'});
      copy.append(title,focus,when);
      const badge = document.createElement('span'); badge.className = 'lr-item-icon'; badge.setAttribute('aria-hidden','true');
      badge.innerHTML = window.KI ? window.KI(topicIcon(item), { tint: false }) : '';
      const actions = document.createElement('div'); actions.className = 'lr-actions';
      const review = document.createElement('button'); review.type = 'button'; review.className = 'lr-start'; review.textContent = 'Review →'; review.setAttribute('aria-label','Review ' + item.label);
      review.onclick = () => {
        if (!same(user.uid,view,rev)) return;
        window.openLearnMode(); window._learnStyle = 'quiz';
        const text = 'Help me review ' + item.label + '. Start with one fresh application question, then adapt to my answer.';
        const input = field(); if (!input) return;
        input.value = text; input.dispatchEvent(new Event('input',{bubbles:true})); input.focus();
        pending = {uid:user.uid,sessionId:window._learnSessionId,id:item.id,text};
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'lr-remove'; remove.textContent = '×'; remove.setAttribute('aria-label','Remove ' + item.label + ' from review');
      remove.onclick = async () => {
        if (!same(user.uid,view,rev)) return;
        remove.disabled = true; review.disabled = true;
        try { render(await request(user,{remove:item.id}),user,view,rev,true); }
        catch {
          if (same(user.uid,view,rev)) { status.textContent = 'Could not remove this topic. Try again.'; remove.disabled=false; review.disabled=false; }
        }
      };
      actions.append(review); row.append(badge,copy,actions,remove); list.append(row);
    }
    const status = document.createElement('p'); status.className = 'lr-status'; status.setAttribute('role','status');
    const toggle=document.createElement('button');toggle.type='button';toggle.className='lr-toggle';toggle.innerHTML=(window.KI?window.KI(enabled?'xcircle':'refresh',{tint:false}):'')+'<span>'+(enabled?'Turn off review memory':'Turn on review memory')+'</span>';
    toggle.onclick=async()=>{
      if(!same(user.uid,view,rev))return;toggle.disabled=true;
      try{render(await request(user,{enabled:!enabled}),user,view,rev,true);}
      catch{if(same(user.uid,view,rev)){status.textContent='Could not update review memory. Try again.';toggle.disabled=false;}}
    };
    details.append(summary,intro,list,toggle,status); p.append(details);
  }
  async function refresh() {
    const user = window.currentUser, view = window._appViewVersion, rev = ++revision;
    if (!user || !window._learnModeActive) { hide(); return; }
    const known = cache.get(user.uid);
    if (known) render(known, user, view, rev); else { let hid = false; try { hid = !!localStorage.getItem(hideKey(user.uid)); } catch {} if (!hid) placeholder(user, view, rev); }
    const wasOpen = () => !!panel()?.querySelector('details[open]');
    try { const data = await request(user); render(data, user, view, rev, wasOpen()); }
    catch { if (same(user.uid,view,rev)) { const p=panel(); if(p) p.hidden=true; document.getElementById('welcomeScreen')?.classList.remove('has-learn-review'); } }
  }
  window.learnReviewUI = {
    refresh, hide,
    targetFor: (text,uid,sessionId) => pending?.uid === uid && pending.sessionId === sessionId && pending.text === text ? pending.id : undefined,
    used: (id,uid,sessionId) => { if(pending?.id===id && pending.uid===uid && pending.sessionId===sessionId) pending=null; },
  };
  window.addEventListener('knox-auth-changed', () => { hide(); if(window.currentUser && window._learnModeActive) refresh(); });
})();
