// Daily question counts: per user, plus one global cap for the whole server.
// Days are UTC. Counts are saved to a small JSON file so restarts don't reset them.
import { loadJson, saveJson } from './store.js';

const today = () => new Date().toISOString().slice(0, 10);

export class Limits {
  constructor({ perUserLimit, globalCap, dataFile }) {
    this.perUserLimit = perUserLimit;
    this.globalCap = globalCap;
    this.dataFile = dataFile;
    const saved = loadJson(dataFile);
    this.state = saved?.day === today() && saved.users && Number.isInteger(saved.total) ? saved : this.#fresh();
  }

  // Reserve one question. Returns { ok, reason?, remaining } where remaining is
  // the user's questions left after this one (null = unlimited).
  reserve(userId, unlimited) {
    this.#rollover();
    const used = this.state.users[userId] || 0;
    if (this.state.total >= this.globalCap) return { ok: false, reason: 'global' };
    if (!unlimited && used >= this.perUserLimit) return { ok: false, reason: 'user', remaining: 0 };
    this.state.total++;
    this.state.users[userId] = used + 1;
    saveJson(this.dataFile, this.state);
    return { ok: true, remaining: unlimited ? null : this.perUserLimit - used - 1 };
  }

  // Give a question back when Knox couldn't answer.
  refund(userId) {
    this.#rollover();
    if (!this.state.users[userId]) return;
    this.state.users[userId]--;
    this.state.total = Math.max(0, this.state.total - 1);
    saveJson(this.dataFile, this.state);
  }

  // Lesson replies don't use a student's questions, but they still cost an AI
  // call, so they count toward the global cap.
  reserveGlobal() {
    this.#rollover();
    if (this.state.total >= this.globalCap) return false;
    this.state.total++;
    saveJson(this.dataFile, this.state);
    return true;
  }

  refundGlobal() {
    this.#rollover();
    this.state.total = Math.max(0, this.state.total - 1);
    saveJson(this.dataFile, this.state);
  }

  // Clear yesterday's counts even if nobody has asked anything today yet.
  prune() {
    if (this.state.day === today()) return;
    this.#rollover();
    saveJson(this.dataFile, this.state);
  }

  #rollover() {
    if (this.state.day !== today()) this.state = this.#fresh();
  }

  #fresh() {
    return { day: today(), total: 0, users: {} };
  }
}
