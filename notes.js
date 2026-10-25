// notes.js — the Binder: 📝 Notes and 🗂️ Flashcards in one place.
//
// The sidebar's Binder button (made by flashcards.js) opens the tab used last.
// A tab strip at the top of both panels switches between Notes (this file)
// and Flashcards (flashcards.js). Notes are saved to the account through
// /api/me?route=notes (api/_notes.js); each note has a subject, and the
// subject tabs work like a real binder's dividers.
//
//   window.openBinder(tab?) — 'notes' | 'flashcards' (default: the last one)
//   window.openNotes()      — the Notes tab
(function () {
  const TAB_KEY = 'knoxBinderTab';
  const SUBJECTS = ['Math', 'Science', 'Biology', 'Chemistry', 'Physics', 'History', 'English', 'Spanish', 'Other'];
  // Subject tab colors, picked from the subject's name so a subject keeps its color.
  const COLORS = ['orange', 'blue', 'green', 'purple', 'pink', 'teal'];
  const colorOf = s => { let h = 0; for (const c of String(s).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const panel = document.createElement('section');
  panel.id = 'notesPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Notes');
  const view = document.createElement('div'); view.className = 'nb-scroll';
  const toast = document.createElement('div'); toast.className = 'nb-toast'; toast.setAttribute('role', 'status');
  panel.append(view, toast);
  document.querySelector('#chatAndInput')?.append(panel);

  let notes = null, loadedFor = null, subject = 'All', editing = null, saveTimer = 0, saving = null, version = 0;

  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('show'), 3200); }

  // ── Server (api/_notes.js) ──
  async function api(body) {
    const user = window.currentUser;
    if (!user?.getIdToken) throw new Error('Sign in to save notes.');
    const r = await fetch('/api/me?route=notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Notes are busy right now. Please try again.');
    return data;
  }

  // ── Note text: only simple formatting is kept (no scripts, styles or links) ──
  const KEEP = { H2: 1, H3: 1, P: 1, DIV: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1 };
  function cleanHtml(html) {
    const box = document.createElement('div'); box.innerHTML = html;
    (function walk(node) {
      for (const el of [...node.children]) {
        walk(el);
        if (!KEEP[el.tagName]) { el.replaceWith(...el.childNodes); continue; }
        const todo = el.tagName === 'UL' && el.classList.contains('nb-todo');
        const checked = el.tagName === 'LI' && el.dataset.checked === 'true';
        for (const a of [...el.attributes]) el.removeAttribute(a.name);
        if (todo) el.className = 'nb-todo';
        if (checked) el.dataset.checked = 'true';
      }
    })(box);
    return box.innerHTML;
  }
  const textOf = html => { const box = document.createElement('div'); box.innerHTML = html.replace(/<\/?(p|div|li|ul|ol|h2|h3)\b[^>]*>/gi, m => /^<\/|^<(ul|ol)/i.test(m) ? '\n' : '\n' + m).replace(/<br\s*\/?>/gi, '\n'); return box.textContent.replace(/\n{3,}/g, '\n\n').trim(); };

  // ── Binder tabs (on both panels) ──
  function strip(active) {
    const el = document.createElement('div');
    el.className = 'binder-tabs'; el.setAttribute('role', 'tablist'); el.setAttribute('aria-label', 'Binder');
    el.innerHTML = `<span class="binder-label" aria-hidden="true">📒 Binder</span>
      <button type="button" role="tab" data-binder="notes" aria-selected="${active === 'notes'}"><span aria-hidden="true">📝</span> Notes</button>
      <button type="button" role="tab" data-binder="flashcards" aria-selected="${active === 'flashcards'}"><span aria-hidden="true">🗂️</span> Flashcards</button>`;
    el.addEventListener('click', e => { const b = e.target.closest('[data-binder]'); if (b) openBinder(b.dataset.binder); });
    return el;
  }
  panel.prepend(strip('notes'));
  // Flashcards' panel gets the same strip once it exists.
  (function addToFlashcards(tries = 0) {
    const fc = document.getElementById('flashcardsPanel');
    if (fc && !fc.querySelector('.binder-tabs')) { fc.prepend(strip('flashcards')); return; }
    if (!fc && tries < 100) setTimeout(() => addToFlashcards(tries + 1), 100);
  })();

  function setNavActive() {
    document.querySelectorAll('.sidebar-quicknav-link').forEach(b => b.classList.toggle('sidebar-nav-active', b.classList.contains('fc-nav')));
  }

  async function openBinder(tab) {
    let pick = tab;
    if (!pick) { try { pick = localStorage.getItem(TAB_KEY); } catch {} }
    if (pick !== 'flashcards') pick = 'notes';
    try { localStorage.setItem(TAB_KEY, pick); } catch {}
    if (pick === 'flashcards') {
      if (!panel.hidden && !(await leaveEditor())) return;
      closeNotes();
      await window.openFlashcards?.();
      return;
    }
    if (document.body.classList.contains('knox-flashcards')) {
      if (window.closeFlashcards && !(await window.closeFlashcards())) return; // unsaved deck: they chose to stay
    }
    openNotes();
  }

  function openNotes() {
    window.closeCalc?.();
    document.body.classList.add('knox-notes');
    panel.hidden = false;
    setNavActive();
    window.closeMobileHistory?.();
    if (loadedFor !== (window.currentUser?.uid || null)) { notes = null; editing = null; }
    if (editing) editorView(); else home();
  }
  function closeNotes() {
    flushSave();
    document.body.classList.remove('knox-notes');
    panel.hidden = true;
  }
  window.openBinder = openBinder;
  window.openNotes = () => openBinder('notes');
  window.closeNotes = closeNotes;

  // Leaving Notes from the sidebar (another section, a chat, New chat) closes it.
  document.addEventListener('click', e => {
    if (panel.hidden) return;
    const nav = e.target.closest('.sidebar-quicknav-link:not(.fc-nav), .sidebar-new-btn, .sidebar-history-item');
    if (nav) closeNotes();
  }, true);
  // Signing in or out: start over with that account's notes.
  window.addEventListener('knox-auth-changed', () => { notes = null; editing = null; loadedFor = null; if (!panel.hidden) home(); });

  // ── Home: subject tabs + note cards ──
  async function home() {
    editing = null;
    const user = window.currentUser;
    if (!user) {
      view.innerHTML = `<div class="nb-wrap nb-center"><div class="nb-empty">
        <div class="nb-empty-art" aria-hidden="true">📒</div>
        <h1 class="nb-title">Your <span>Binder</span></h1>
        <p class="nb-sub">Keep your class notes and flashcards together, sorted by subject. Sign in to start your first note — it saves to your account, on every device.</p>
        <button type="button" class="fc-btn primary" data-act="signin">Sign in to take notes</button></div></div>`;
      view.querySelector('[data-act="signin"]').onclick = () => window.openAuthModal?.('signup');
      return;
    }
    if (!notes) {
      view.innerHTML = `<div class="nb-wrap"><p class="nb-loading">Opening your notes…</p></div>`;
      const v = ++version;
      try { const d = await api({ action: 'list' }); if (v !== version || window.currentUser?.uid !== user.uid) return; notes = d.notes; loadedFor = user.uid; }
      catch (err) { if (v !== version) return; view.innerHTML = `<div class="nb-wrap"><p class="nb-loading">${esc(err.message)} <button type="button" class="fc-btn small" data-act="retry">Try again</button></p></div>`; view.querySelector('[data-act="retry"]').onclick = home; return; }
    }
    const subjects = [...new Set(notes.map(n => n.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (subject !== 'All' && !subjects.includes(subject)) subject = 'All';
    const shown = subject === 'All' ? notes : notes.filter(n => n.subject === subject);
    const tab = (s, count) => `<button type="button" class="nb-subject nb-${s === 'All' ? 'all' : colorOf(s)}${s === subject ? ' on' : ''}" data-subject="${esc(s)}" aria-pressed="${s === subject}">${esc(s)} <span class="nb-count">${count}</span></button>`;
    const card = n => `<button type="button" class="nb-card nb-${n.subject ? colorOf(n.subject) : 'none'}" data-open="${esc(n.id)}">
        ${n.subject ? `<span class="nb-card-subject">${esc(n.subject)}</span>` : ''}
        <b class="nb-card-title">${esc(n.title || 'Untitled note')}</b>
        <span class="nb-card-snippet">${esc(n.snippet || 'Empty note')}</span>
        <span class="nb-card-date">${new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></button>`;
    view.innerHTML = `<div class="nb-wrap">
      <header class="nb-head"><h1 class="nb-title" tabindex="-1">Your <span>Notes</span></h1>
        <button type="button" class="fc-btn primary" data-act="new">+ New note</button></header>
      ${notes.length ? `<div class="nb-subjects" role="group" aria-label="Subjects">${tab('All', notes.length)}${subjects.map(s => tab(s, notes.filter(n => n.subject === s).length)).join('')}</div>
      <div class="nb-grid">${shown.map(card).join('')}</div>`
      : `<div class="nb-empty"><div class="nb-empty-art" aria-hidden="true">📝</div><h2>No notes yet</h2><p class="nb-sub">Write your class notes here, give each one a subject, and turn them into flashcards with one tap.</p></div>`}
    </div>`;
    view.querySelector('[data-act="new"]').onclick = () => { editing = { id: null, title: '', subject: subject === 'All' ? '' : subject, html: '' }; editorView(); };
    view.querySelectorAll('[data-subject]').forEach(b => b.onclick = () => { subject = b.dataset.subject; home(); });
    view.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openNote(b.dataset.open));
  }

  async function openNote(id) {
    view.innerHTML = `<div class="nb-wrap"><p class="nb-loading">Opening…</p></div>`;
    const v = ++version;
    try { const d = await api({ action: 'get', id }); if (v !== version) return; editing = d.note; editorView(); }
    catch (err) { say(err.message); home(); }
  }

  // ── Editor ──
  function editorView() {
    const n = editing;
    const list = [...new Set([...SUBJECTS, ...(notes || []).map(x => x.subject).filter(Boolean)])];
    view.innerHTML = `<div class="nb-wrap nb-editor">
      <div class="nb-editor-top">
        <button type="button" class="fc-btn ghost" data-act="back">← Notes</button>
        <span class="nb-status" aria-live="polite"></span>
      </div>
      <input class="nb-note-title" maxlength="120" placeholder="Note title" aria-label="Note title" value="${esc(n.title)}">
      <label class="nb-subject-pick"><span>Subject</span><input list="nbSubjects" maxlength="30" placeholder="Pick or type a subject" value="${esc(n.subject)}" aria-label="Subject"><datalist id="nbSubjects">${list.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <div class="nb-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" data-cmd="h2" title="Heading" aria-label="Heading">H</button>
        <button type="button" data-cmd="bold" title="Bold" aria-label="Bold"><b>B</b></button>
        <button type="button" data-cmd="italic" title="Italic" aria-label="Italic"><i>I</i></button>
        <button type="button" data-cmd="underline" title="Underline" aria-label="Underline"><u>U</u></button>
        <button type="button" data-cmd="ul" title="Bullet list" aria-label="Bullet list">• List</button>
        <button type="button" data-cmd="ol" title="Numbered list" aria-label="Numbered list">1. List</button>
        <button type="button" data-cmd="todo" title="Checklist" aria-label="Checklist">☑ Checklist</button>
      </div>
      <div class="nb-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" data-placeholder="Start typing your notes…">${cleanHtml(n.html)}</div>
      <div class="nb-actions">
        <button type="button" class="fc-btn primary blue" data-act="cards">🗂️ Make flashcards</button>
        <button type="button" class="fc-btn" data-act="ask">💬 Ask Knox about this</button>
        <button type="button" class="fc-btn ghost nb-delete" data-act="delete">Delete note</button>
      </div>
    </div>`;
    const title = view.querySelector('.nb-note-title'), subj = view.querySelector('.nb-subject-pick input'), body = view.querySelector('.nb-body');
    const changed = () => { n.title = title.value; n.subject = subj.value; n.html = body.innerHTML; queueSave(); };
    title.addEventListener('input', changed); subj.addEventListener('input', changed); body.addEventListener('input', changed);
    // Paste as plain text, so copied web pages don't bring their styling.
    body.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    // A checklist box toggles when its item is clicked near the box.
    body.addEventListener('click', e => {
      const li = e.target.closest('ul.nb-todo > li');
      if (li && e.offsetX < 26) { if (li.dataset.checked === 'true') delete li.dataset.checked; else li.dataset.checked = 'true'; changed(); }
    });
    view.querySelector('.nb-toolbar').addEventListener('mousedown', e => e.preventDefault()); // keep the text selected
    view.querySelector('.nb-toolbar').addEventListener('click', e => {
      const cmd = e.target.closest('[data-cmd]')?.dataset.cmd; if (!cmd) return;
      body.focus();
      if (cmd === 'h2') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'h2' ? 'p' : 'h2');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else if (cmd === 'todo') {
        document.execCommand('insertUnorderedList');
        const sel = getSelection(); const ul = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('ul');
        if (ul && body.contains(ul)) ul.classList.add('nb-todo');
      } else document.execCommand(cmd);
      changed();
    });
    view.querySelector('[data-act="back"]').onclick = async () => { await flushSave(); editing = null; home(); };
    view.querySelector('[data-act="delete"]').onclick = deleteNote;
    view.querySelector('[data-act="cards"]').onclick = makeCards;
    view.querySelector('[data-act="ask"]').onclick = askKnox;
    if (!n.id && !n.title) title.focus(); else body.focus();
    status(n.id ? 'Saved' : '');
  }
  function status(t) { const el = view.querySelector('.nb-status'); if (el) el.textContent = t; }

  // Saves a moment after typing stops (and right away when leaving the note).
  function queueSave() { status('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); }
  async function flushSave() { if (saveTimer) { clearTimeout(saveTimer); await save(); } else if (saving) await saving; }
  async function leaveEditor() { await flushSave(); return true; }
  async function save() {
    saveTimer = 0;
    const n = editing; if (!n) return;
    if (!n.id && !n.title.trim() && !textOf(n.html)) { status(''); return; } // an empty new note isn't saved
    if (saving) { await saving; if (saveTimer) return; }
    const html = cleanHtml(n.html);
    saving = (async () => {
      try {
        const d = await api({ action: 'save', id: n.id, title: n.title, subject: n.subject, html });
        n.id = d.note.id; n.updatedAt = d.note.updatedAt;
        const meta = { id: n.id, title: n.title.trim() || 'Untitled note', subject: n.subject.trim(), snippet: textOf(html).replace(/\s+/g, ' ').slice(0, 160), updatedAt: n.updatedAt };
        if (notes) notes = [meta, ...notes.filter(x => x.id !== n.id)];
        if (editing === n) status('Saved');
      } catch (err) { if (editing === n) status('Not saved — ' + err.message); }
      finally { saving = null; }
    })();
    await saving;
  }

  async function deleteNote() {
    const n = editing;
    if (!confirm('Delete this note? This can’t be undone.')) return;
    clearTimeout(saveTimer); saveTimer = 0;
    if (n.id) {
      try { await api({ action: 'delete', id: n.id }); } catch (err) { say(err.message); return; }
      if (notes) notes = notes.filter(x => x.id !== n.id);
    }
    editing = null; say('Note deleted.'); home();
  }

  // Make with Knox, filled in with this note.
  async function makeCards() {
    const text = textOf(editing.html);
    if (text.length < 20) { say('Write a few lines first, then Knox can make flashcards from them.'); return; }
    await flushSave();
    const request = `Make flashcards from my ${editing.subject ? editing.subject + ' ' : ''}notes "${editing.title.trim() || 'Untitled note'}":\n\n${text}`;
    try { localStorage.setItem(TAB_KEY, 'flashcards'); } catch {}
    closeNotes();
    if (!(await window.flashcardsMake?.(request))) openNotes();
  }

  // Ask Knox with the note attached, like an uploaded text file.
  async function askKnox() {
    const text = textOf(editing.html);
    if (!text) { say('This note is empty.'); return; }
    await flushSave();
    const name = (editing.title.trim() || 'My notes').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60) + '.txt';
    // Go to Ask Knox the way the sidebar does (that also closes Notes), then attach.
    const ask = document.querySelector('.sidebar-body .sidebar-quicknav-link[data-nav="chat"]');
    if (ask) ask.click(); else closeNotes();
    await new Promise(r => setTimeout(r, 150));
    window.handleAttachment?.(new File([text], name, { type: 'text/plain' }));
    const input = document.getElementById('appChatInput');
    if (input) { input.value = 'Help me study these notes.'; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
  }
  // /app?open=notes after a refresh (app.html asks before this file has loaded).
  if (window.__knoxOpenNotesWhenReady) { window.__knoxOpenNotesWhenReady = false; openBinder('notes'); }
})();
