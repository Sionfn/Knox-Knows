// A lesson is one /ask plus the replies to it, so Knox remembers what it asked.
// Saved to a JSON file next to the daily counts; old lessons are dropped.
import { randomUUID } from 'node:crypto';
import { loadJson, saveJson } from './store.js';

export const MAX_REPLIES = 10;
const LESSON_HOURS = 2;

export class Lessons {
  constructor({ dataFile }) {
    this.file = dataFile.replace(/(\.json)?$/, '-lessons.json');
    this.lessons = loadJson(this.file) || {};
    this.busy = new Set(); // lessons Knox is answering right now
    this.prune();
  }

  // photo: { url, contentType } for a photo question, so replies can show it to Knox again.
  start(ownerId, question, answer, photo = null) {
    this.prune();
    const id = randomUUID();
    this.lessons[id] = {
      ownerId, startedAt: Date.now(), replies: 0, photo,
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
