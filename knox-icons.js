// knox-icons.js — Knox's own icons in place of Apple/system emoji.
//
// KI('flame') returns an inline SVG. KI.watch(root) swaps any known emoji
// in the page's text for its Knox icon as content appears (toasts, Flame
// Fest, gifts, flashcards, the calculator…), so every screen gets the same
// look without each module changing its strings. It never touches what
// people type: inputs, textareas, editable areas and the student's own
// messages are skipped, the 🦊 and 🍪 stay real emoji, and plain-text places (alerts, the tab title,
// copied answers) keep their emoji, and so does the AI's own writing.
(function () {
  if (window.KI) return;
  const SVG = (body, cls = '') => `<svg class="kk-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const FILL = (body, cls = '') => `<svg class="kk-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  const flame = (outer, inner, edge) => FILL(`<path d="M12 2c1 3.2 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.4 2.6-5.6.2 1.7 1 2.8 2.1 3.2C10.6 7.8 11 4.6 12 2Z" fill="${outer}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12.5c1.2 1.3 2.6 2.4 2.6 4.3a2.6 2.6 0 0 1-5.2 0c0-1.4.8-2.4 1.6-3 .1.6.4 1 .9 1.2.1-1 .1-1.7.1-2.5Z" fill="${inner}"/>`, 'kk-flame');

  const L = {
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5M22 10v6"/>',
    up: '<path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
    down: '<path d="M17 14V2M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L13 22a3.1 3.1 0 0 1-3-3.9Z"/>',
    doc: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5M9 13h6M9 17h4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
    math: '<path d="M4 20 20 4v16Z"/><path d="M20 14h-3M20 17h-2M14 20v-3M11 20v-2"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5-6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15v4M17 17h4M5 3v3M3.5 4.5h3"/>',
    grimace: '<circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A5 5 0 1 0 7.5 11.5c.7.8 1.2 1.5 1.4 2.5"/>',
    think: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    note: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M8 16H3v5"/>',
    brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    cards: '<rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11M10 11h7M10 15h5"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
    logs: '<path d="M3 17h18M5 13l14 8M19 13 5 21"/><path d="M12 3c1 2 3 3 3 6a3 3 0 0 1-6 0c0-1.5.7-2.3 1.4-3"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z"/>',
    apple: '<path d="M12 7c-1.5-1-5-1.4-6.6 1.5C3.6 11.8 6 20 9 20c1 0 1.8-.6 3-.6s2 .6 3 .6c3 0 5.4-8.2 3.6-11.5C17 5.6 13.5 6 12 7Z"/><path d="M12 7c0-2 1-4 3-4"/>',
    dna: '<path d="M2 15c6.7-6 13.3 0 20-6M9 22c1.8-7-3.5-13.4 1-20M15 2c-1.8 7 3.5 13.4-1 20"/><path d="m17 6-2.5-2.5M14 8l-1-1M7 18l2.5 2.5M3.5 14.5l.5.5M20 9l.5.5M6.5 12.5l1 1M16.5 10.5l1 1M10 16l1.5 1.5"/>',
    columns: '<path d="M3 21h18M5 18h14M6 18v-7M10 18v-7M14 18v-7M18 18v-7M3 11h18L12 4Z"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    inbox: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    outbox: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    paperclip: '<path d="m21.4 11-8.8 8.8a5.7 5.7 0 0 1-8-8l8.8-8.9a3.8 3.8 0 0 1 5.4 5.4l-8.9 8.8a1.9 1.9 0 0 1-2.7-2.7l8.1-8"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    pencil: '<path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 5 4 4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    calc: '<rect x="5" y="2" width="14" height="20" rx="4"/><path d="M9 7h6M9 12h.01M15 12h.01M9 17h.01M15 17h.01"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/>',
    ticket: '<path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 2 2 0 0 0-2.4-1.2A3.5 3.5 0 0 1 3.4 12 5 5 0 0 1 9 10Z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
    xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    frown: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };
  const F = {
    flame: flame('#FF7A1A', '#FFD23F', '#D9530B'),
    flamePurple: flame('#A855F7', '#E9C3FF', '#7C3AED'),
    flameBlue: flame('#2BA8F2', '#BDE8FF', '#0A78C2'),
    flameGold: flame('#F2B705', '#FFF1A8', '#B98500'),
    gem: FILL('<path d="M6.5 3h11l4.5 6-10 12L2 9Z" fill="#FFD45C" stroke="#E07800" stroke-width="2" stroke-linejoin="round"/><path d="M2 9h20M9.5 3 8 9l4 12 4-12-1.5-6" fill="none" stroke="#E07800" stroke-width="1.4" stroke-linejoin="round"/>', 'kk-gem'),
    bolt: FILL('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" fill="#FFD900" stroke="#B38600" stroke-width="1.8" stroke-linejoin="round"/>', 'kk-bolt'),
    shield: FILL('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" fill="#5CC8FA" stroke="#0A85C2" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 'kk-shield'),
    gift: FILL('<rect x="3" y="8" width="18" height="5" rx="1.5" fill="#FF8A2B" stroke="#CC5500" stroke-width="1.6"/><path d="M5 13h14v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" fill="#FF6B00" stroke="#CC5500" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v13" stroke="#FFD23F" stroke-width="2.4"/><path d="M12 8C10.5 5 8.8 3.5 7.5 3.5a2.2 2.2 0 0 0 0 4.5ZM12 8c1.5-3 3.2-4.5 4.5-4.5a2.2 2.2 0 0 1 0 4.5Z" fill="none" stroke="#CC5500" stroke-width="1.6" stroke-linejoin="round"/>', 'kk-gift'),
    crown: FILL('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5Z" fill="#FFD45C" stroke="#E07800" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="15" r="1.4" fill="#E07800"/>', 'kk-crown'),
    trophy: FILL('<path d="M7 3h10v6a5 5 0 0 1-10 0Z" fill="#FFD45C" stroke="#E07800" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6v3H9Z" fill="none" stroke="#E07800" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'kk-trophy'),
    star: FILL('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z" fill="#FFD23F" stroke="#E0A100" stroke-width="1.6" stroke-linejoin="round"/>', 'kk-star'),
    party: FILL('<path d="M3 21 8 7l9 9Z" fill="#FF8A2B" stroke="#CC5500" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3c0 2-1 3-1 3M19 9s1.2-1 3-1M17 4l-1.5 3M20 13l-3-1" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="20" cy="4" r="1.3" fill="#1CB0F6"/><circle cx="11" cy="3" r="1" fill="#58CC02"/><circle cx="21" cy="17" r="1" fill="#F2B705"/>', 'kk-party'),
  };

  // Emoji → icon name (a trailing variation selector is matched too).
  const MAP = {
    '🔥': 'flame', '💜': 'flamePurple', '💙': 'flameBlue', '👑': 'crown', '🟡': 'flameGold', '💎': 'gem', '⚡': 'bolt',
    '🛡': 'shield', '🎁': 'gift', '🎄': 'gift', '🏆': 'trophy', '🌟': 'star', '⭐': 'star', '🎉': 'party',
    '🎓': 'cap', '👍': 'up', '👎': 'down', '📄': 'doc', '📷': 'camera', '📸': 'camera',
    '📐': 'math', '🌿': 'leaf', '🍂': 'leaf', '🍁': 'leaf', '🌍': 'globe', '⚠': 'warn', '🚀': 'rocket',
    '💫': 'spark', '✨': 'spark', '😬': 'grimace', '💡': 'bulb', '🤔': 'think', '📝': 'note', '🔄': 'refresh',
    '🧠': 'brain', '🎯': 'target', '📇': 'cards', '🗂': 'cards', '🎥': 'video', '🧪': 'flask', '🪵': 'logs',
    '🦅': 'crown', '📚': 'book', '🍎': 'apple', '🧬': 'dna', '🏛': 'columns', '🫀': 'heart', '📥': 'inbox',
    '📤': 'outbox', '📊': 'chart', '📋': 'clip', '🖼': 'image', '📎': 'paperclip', '☁': 'cloud', '🗑': 'trash',
    '✏': 'pencil', '☀': 'sun', '🌙': 'moon', '🧮': 'calc', '💰': 'tag', '⏰': 'clock', '🔒': 'lock', '🆓': 'spark',
    '✍': 'pencil', '⌨': 'keyboard', '🎟': 'ticket', '🐾': 'paw', '💳': 'card', '❌': 'xcircle', '😕': 'frown',
  };
  // Line icons get a color of their own where there's no better one around.
  const TINT = { cap: '#7C3AED', leaf: '#C2571A', bulb: '#E0A100', camera: '#1CB0F6', doc: '#1CB0F6', note: '#7C3AED', target: '#FF4B4B', brain: '#EC4899', video: '#FF4B4B', cards: '#58CC02', calc: '#1CB0F6', rocket: '#FF6B00', spark: '#F2A900', warn: '#E0A100', moon: '#7C3AED', sun: '#F2A900', apple: '#E5484D', heart: '#E5484D', dna: '#58CC02', flask: '#14B8A6', logs: '#A0622D', clock: '#FF6B00', grimace: '#FF4B4B', pencil: '#7C3AED', xcircle: '#FF4B4B', frown: '#FF4B4B', paw: '#FF6B00', ticket: '#FF6B00', card: '#1CB0F6' };

  function KI(name, opts = {}) {
    if (F[name]) return F[name];
    const body = L[name]; if (!body) return '';
    const svg = SVG(body, 'kk-line');
    const tint = opts.tint === false ? null : (opts.tint || TINT[name]);
    return tint ? svg.replace('class="kk-ic kk-line"', `class="kk-ic kk-line" style="color:${tint}"`) : svg;
  }
  KI.has = ch => !!MAP[ch];
  const RE = new RegExp('(' + Object.keys(MAP).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'gu');
  const TEST = new RegExp(RE.source, 'u');

  // Swap emoji in an HTML string, outside tags and raw-text elements.
  KI.fill = function (html) {
    if (!html || !TEST.test(html)) return html;
    let raw = false;
    return String(html).replace(/(<\/?([a-zA-Z0-9-]+)[^>]*>)|([^<]+)/g, (m, tag, name, text) => {
      if (tag) { const n = name.toLowerCase(); if (/^(textarea|script|style|title|option)$/.test(n)) raw = tag[1] !== '/'; return tag; }
      return raw ? text : text.replace(RE, (e, ch) => KI(MAP[ch]));
    });
  };

  const SKIP = 'textarea,input,select,option,script,style,title,noscript,[contenteditable=""],[contenteditable="true"],.msg-user,.msg-user-bubble,.no-ki,svg';
  const OWN_UI = '.learn-key-title,.learn-help,.learn-recap-title,.learn-recap-buttons,.learn-actions,.learn-video,.learn-progress,.knox-response-heading';
  function swapText(node) {
    const t = node.data;
    if (!t || !TEST.test(t)) return;
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    // Knox's answers keep the AI's own emoji (it can use thousands; only
    // swapping a few would look broken). Knox's own buttons inside answers
    // still get icons.
    if (p.closest('.msg-knox-bubble') && !p.closest(OWN_UI)) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(RE, (e, ch) => KI(MAP[ch]));
    node.replaceWith(tpl.content);
  }
  function sweep(root) {
    if (root.nodeType === 3) return swapText(root);
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (TEST.test(n.data)) hits.push(n);
    hits.forEach(swapText);
  }
  KI.sweep = sweep;
  KI.watch = function (root = document.body) {
    sweep(root);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') swapText(m.target);
        else m.addedNodes.forEach(sweep);
      }
    }).observe(root, { childList: true, subtree: true, characterData: true });
  };
  window.KI = KI;

  const css = document.createElement('style');
  css.textContent = '.kk-ic{width:1.15em;height:1.15em;display:inline-block;vertical-align:-0.2em;flex-shrink:0}' +
    'img.kk-fox{border-radius:50%;object-fit:cover}';
  document.head.appendChild(css);
  const start = () => KI.watch(document.body);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
