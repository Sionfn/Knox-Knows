// Daily question counts: per user, plus one global cap for the whole server.
// Days are UTC. Counts are saved to a small JSON file so restarts don't reset them.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const today = () => new Date().toISOString().slice(0, 10);

export class Limits {
  constructor({ perUserLimit, globalCap, dataFile }) {
    this.perUserLimit = perUserLimit;
    this.globalCap = globalCap;
    this.dataFile = dataFile;
    this.state = this.#load();
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
    this.#save();
    return { ok: true, remaining: unlimited ? null : this.perUserLimit - used - 1 };
  }

  // Give a question back when Knox couldn't answer.
  refund(userId) {
    this.#rollover();
    if (!this.state.users[userId]) return;
    this.state.users[userId]--;
    this.state.total = Math.max(0, this.state.total - 1);
    this.#save();
  }

  #rollover() {
    if (this.state.day !== today()) this.state = { day: today(), total: 0, users: {} };
  }

  #load() {
    try {
      const saved = JSON.parse(readFileSync(this.dataFile, 'utf8'));
      if (saved.day === today() && saved.users && Number.isInteger(saved.total)) return saved;
    } catch {}
    return { day: today(), total: 0, users: {} };
  }

  #save() {
    try {
      mkdirSync(dirname(this.dataFile), { recursive: true });
      const temp = this.dataFile + '.tmp';
      writeFileSync(temp, JSON.stringify(this.state));
      renameSync(temp, this.dataFile); // atomic, so a crash can't leave half a file
    } catch (err) {
      console.error('Could not save usage counts:', err.message);
    }
  }
}
