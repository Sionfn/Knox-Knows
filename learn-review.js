(function () {
  let revision = 0, pending = null;
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
  function render(data, user, view, rev, open = false) {
    const {items,enabled}=data;
    const p = panel(); if (!p || !same(user.uid, view, rev)) return;
    p.replaceChildren(); p.hidden = false;
    document.getElementById('welcomeScreen')?.classList.add('has-learn-review');
    const details = document.createElement('details'); details.open = open;
    const summary = document.createElement('summary'); summary.textContent = 'Review from your lessons' + (items.length ? ' · ' + items.length + (items.length === 1 ? ' topic' : ' topics') : enabled ? '' : ' · off');
    const intro = document.createElement('p'); intro.className = 'lr-intro';
    intro.textContent = !enabled ? 'Review memory is off. Learn still works normally.' : items.length
      ? 'Try a fresh question on a skill you worked on before. Optional; starts a regular Learn lesson.'
      : 'Skills that need another try can appear here for later practice. Your lesson history stays separate.';
    const list = document.createElement('div'); list.className = 'lr-items';
    for (const item of [...items].sort((a,b) => a.dueAt-b.dueAt)) {
      const row = document.createElement('div'); row.className = 'lr-item';
      const copy = document.createElement('div'); copy.className = 'lr-copy';
      const title = document.createElement('strong'); title.textContent = item.label;
      const focus = document.createElement('p'); focus.textContent = item.focus;
      const when = document.createElement('small'); when.textContent = item.dueAt <= Date.now() ? 'Ready to revisit' : 'Suggested again ' + new Date(item.dueAt).toLocaleDateString(undefined, {month:'short',day:'numeric'});
      copy.append(title,focus,when);
      const actions = document.createElement('div'); actions.className = 'lr-actions';
      const review = document.createElement('button'); review.type = 'button'; review.className = 'lr-start'; review.textContent = 'Review'; review.setAttribute('aria-label','Review ' + item.label);
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
      actions.append(review,remove); row.append(copy,actions); list.append(row);
    }
    const status = document.createElement('p'); status.className = 'lr-status'; status.setAttribute('role','status');
    const toggle=document.createElement('button');toggle.type='button';toggle.className='lr-toggle';toggle.textContent=enabled?'Turn off review memory and clear topics':'Turn on review memory';
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
    try { render(await request(user),user,view,rev); }
    catch { if (same(user.uid,view,rev)) { const p=panel(); if(p) p.hidden=true; document.getElementById('welcomeScreen')?.classList.remove('has-learn-review'); } }
  }
  window.learnReviewUI = {
    refresh, hide,
    targetFor: (text,uid,sessionId) => pending?.uid === uid && pending.sessionId === sessionId && pending.text === text ? pending.id : undefined,
    used: (id,uid,sessionId) => { if(pending?.id===id && pending.uid===uid && pending.sessionId===sessionId) pending=null; },
  };
  window.addEventListener('knox-auth-changed', () => { hide(); if(window.currentUser && window._learnModeActive) refresh(); });
})();
