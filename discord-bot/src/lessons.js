// A lesson is one /ask plus the replies to it, so Knox remembers what it asked.
// Saved to a JSON file next to the daily counts; old lessons are dropped.
import { randomUUID } from 'node:crypto';
import { loadJson, saveJson } from './store.js';

export const MAX_REPLIES = 20; // free members (same Learn lengths as the website)
// Paid members get the same lesson length as Learn mode on the website.
export const REPLIES_BY_TIER = { free: MAX_REPLIES, plus: 30, mega: 50 };
const LESSON_HOURS = 2;

export class Lessons {
  constructor({ dataFile }) {
    this.file = dataFile.replace(/(\.json)?$/, '-lessons.json');
    this.lessons = loadJson(this.file) || {};
    this.busy = new Set(); // lessons Knox is answering right now
    this.prune();
  }

  // photo: { url, contentType } for a photo question, so replies can show it to Knox again.
  // mode: 'learn' (/learn, a guided lesson) or 'answer' (/ask, Ask Knox with follow-ups).
  start(ownerId, question, answer, photo = null, maxReplies = MAX_REPLIES, mode = 'learn') {
    this.prune();
    const id = randomUUID();
    this.lessons[id] = {
      ownerId, startedAt: Date.now(), replies: 0, photo, maxReplies, mode,
      history: [{ role: 'user', content: question }, { role: 'assistant', content: answer }],
    };
    saveJson(this.file, this.lessons);
    return id;
  }

  // The lesson if it's still open, or null once it's expired or gone.
  get(id) {
    const lesson = this.lessons[id];
    if (!lesson || Date.now() - lesson.startedAt > LESSON_HOURS * 3600_000) return null;
    return lesson;
  }

  end(id) {
    delete this.lessons[id];
    saveJson(this.file, this.lessons);
  }

  addReply(id, reply, answer) {
    const lesson = this.lessons[id];
    lesson.replies++;
    lesson.history.push({ role: 'user', content: reply }, { role: 'assistant', content: answer });
    saveJson(this.file, this.lessons);
  }

  // Delete ended lessons (the privacy policy promises this).
  prune() {
    const ended = Object.keys(this.lessons).filter(id => !this.get(id));
    if (!ended.length) return;
    ended.forEach(id => delete this.lessons[id]);
    saveJson(this.file, this.lessons);
  }
}

// What a lesson sends to Knox: the opening question and Knox's plan (so a long
// lesson keeps to it), then the newest messages, inside the website's limits
// (40 messages, 24k characters each, 120k in all). Same idea as the website.
export function historyForKnox(history, maxMessages = 30, maxChars = 120000) {
  const valid = m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 24000;
  const all = (history || []).filter(valid);
  if (all.length <= maxMessages && all.reduce((n, m) => n + m.content.length, 0) <= maxChars) return all;
  const anchor = all.slice(0, 2);
  const recent = [];
  let chars = anchor.reduce((n, m) => n + m.content.length, 0);
  for (const m of all.slice(2).slice(-(maxMessages - anchor.length)).reverse()) {
    if (chars + m.content.length > maxChars) break;
    recent.unshift(m); chars += m.content.length;
  }
  // Keep turns in order: the recent part starts with the student.
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return [...anchor, ...recent];
}
