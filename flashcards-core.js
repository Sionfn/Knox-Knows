export const DAY = 86400000;
// Card pictures: freely licensed Wikimedia images (added by Make with Knox)
// or the student's own photo, shrunk and stored inline. Anything else is dropped.
const IMAGE_URL = /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^\s"'<>]+$/;
const IMAGE_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export function cleanImage(card) {
  const url = typeof card?.image === 'string' ? card.image : '';
  if (!url || url.length > 200000 || !(IMAGE_URL.test(url) || IMAGE_DATA.test(url))) return {};
  const credit = typeof card.imageCredit === 'string' ? card.imageCredit.trim().slice(0, 200) : '';
  return credit ? { image: url, imageCredit: credit } : { image: url };
}
export function validateDeck(value) {
  if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) throw Error('Use a deck title of 1–100 characters.');
  if (!Array.isArray(value.cards) || !value.cards.length || value.cards.length > 300) throw Error('A deck needs 1–300 cards.');
  return { title:value.title.trim(), cards:value.cards.map(c => {
    if (!c || typeof c.front !== 'string' || typeof c.back !== 'string' || !c.front.trim() || !c.back.trim() || c.front.length > 2000 || c.back.length > 4000) throw Error('Each card needs a question (up to 2,000 characters) and answer (up to 4,000).');
    return {front:c.front.trim(),back:c.back.trim(),...cleanImage(c),due:0,interval:0,reviews:0};
  }) };
}
export function parseLines(text) {
  return text.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{
    const split=line.indexOf('\t');
    if(split<1) throw Error(`Line ${i+1}: separate the question and answer with a Tab.`);
    return {front:line.slice(0,split),back:line.slice(split+1)};
  });
}
export function schedule(card, grade, now=Date.now()) {
  if(!['again','good','easy'].includes(grade)) throw Error('Invalid review grade');
  const prior=Math.max(0,Number(card.interval)||0);
  const interval=grade==='again'?0:grade==='easy'?Math.max(3,Math.round(prior*2.5)):Math.max(1,Math.round(prior*2));
  return {...card,interval,due:now+(interval?interval*DAY:60000),reviews:(Number(card.reviews)||0)+1};
}
export function studyQueue(cards, dueOnly=true, now=Date.now(), random=Math.random) {
  const q=cards.map((_,i)=>i).filter(i=>!dueOnly || !cards[i].due || cards[i].due<=now);
  for(let i=q.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[q[i],q[j]]=[q[j],q[i]];}
  return q;
}
// Spreadsheet / list import (.csv, .tsv, .txt): one card per row, question
// then answer. Tabs win if present (Google Sheets, Excel and Quizlet copy or
// export with tabs); otherwise comma-separated with "quoted, values".
export function parseTable(text) {
  const rows = [];
  const src = String(text || '').replace(/^﻿/, '');
  if (src.includes('\t')) {
    for (const line of src.split(/\r?\n/)) if (line.trim()) rows.push(line.split('\t'));
  } else {
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; }
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    row.push(cell); if (row.some(c => c.trim())) rows.push(row);
  }
  return rowsToCards(rows);
}
// Rows from a spreadsheet (CSV, Excel): question in column 1, answer after.
export function rowsToCards(rows) {
  rows = rows.filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim()));
  const header = /^(front|question|questions|term|terms|word|words|prompt|q|vocab|vocabulary)$/i;
  if (rows.length && header.test(String(rows[0][0] ?? '').trim())) rows.shift();
  const cards = rows
    .map(r => ({ front: String(r[0] ?? '').trim(), back: r.slice(1).map(c => String(c ?? '').trim()).filter(Boolean).join(', ') }))
    .filter(c => c.front && c.back);
  if (!cards.length) throw Error('Knox couldn’t find any cards. Put the question in the first column and the answer in the second.');
  if (cards.length > 300) throw Error('That file has more than 300 cards. Split it into smaller decks.');
  return cards;
}
// Spreadsheet export: two columns (Front, Back) that Sheets, Excel and Quizlet open.
export function toCsv(decks) {
  const q = v => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const lines = ['Front,Back' + (decks.length > 1 ? ',Deck' : '')];
  for (const d of decks) for (const c of d.cards) lines.push([q(c.front), q(c.back), ...(decks.length > 1 ? [q(d.title)] : [])].join(','));
  return lines.join('\r\n');
}

// A plain .txt/.md file: a card list if most lines look like one
// ("term<Tab>definition", "term - definition", "term: definition"),
// otherwise null — it's notes, for Make with Knox to turn into cards.
export function parseList(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  if (src.includes('\t')) return parseTable(src);
  const lines = src.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const cards = [];
  for (const line of lines) {
    const m = line.match(/^(.{1,200}?)\s+[-–—=]\s+(.+)$/) || line.match(/^([^:]{1,120}):\s+(.+)$/);
    if (m) cards.push({ front: m[1].trim(), back: m[2].trim() });
  }
  if (lines.length < 2 || cards.length < Math.max(2, lines.length * 0.6)) return null;
  if (cards.length > 300) throw Error('That file has more than 300 cards. Split it into smaller decks.');
  return cards;
}
// Pasted cards (Import's paste box, the editor's paste box): one card per
// line, split at a Tab (Quizlet, Sheets, Excel), " - " or ": ".
export function parsePasted(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw Error('Paste some cards first: one per line, question then answer.');
  const cards = lines.map((line, i) => {
    const tab = line.indexOf('\t');
    if (tab > 0) return { front: line.slice(0, tab).trim(), back: line.slice(tab + 1).replace(/\t/g, ' ').trim() };
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    const m = clean.match(/^(.{1,200}?)\s+[-–—=]\s+(.+)$/) || clean.match(/^([^:]{1,120}):\s+(.+)$/);
    if (!m) throw Error(`Line ${i + 1} needs a question and an answer — separate them with a Tab, “ - ” or “: ”.`);
    return { front: m[1].trim(), back: m[2].trim() };
  }).filter(c => c.front && c.back);
  if (!cards.length) throw Error('Knox couldn’t find any cards. Put the question first, then the answer.');
  if (cards.length > 300) throw Error('That’s more than 300 cards. Split it into smaller decks.');
  return cards;
}
// Tab-separated text Quizlet can import (Create → Import → paste).
export function toQuizlet(decks) {
  const one = s => String(s).replace(/\s*[\r\n\t]+\s*/g, ' ').trim();
  return decks.flatMap(d => d.cards.map(c => one(c.front) + '\t' + one(c.back))).join('\n');
}
