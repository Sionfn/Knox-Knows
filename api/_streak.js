// api/_streak.js — the 🔥 study streak, shared by api/ask.js (a real
// question or Learn step) and api/flame-fest.js (a Flashcards review).
// Files starting with "_" aren't deployed as their own Vercel functions.

// Only successful substantive answers count. Streak days follow the
// student's own calendar (the app sends its local YYYY-MM-DD) so a day starts
// at their midnight, not 5pm in California. The server only accepts a date
// within one day of real UTC time and never moves a streak backwards, so a
// changed browser clock or timezone can't farm extra days.
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const utcDayKey = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
export function studyDay(clientDay) {
  const utc = utcDayKey();
  if (typeof clientDay === 'string' && DAY_KEY.test(clientDay)) {
    const diff = (Date.parse(clientDay) - Date.parse(utc)) / 86400000;
    if (Math.abs(diff) <= 1) return clientDay;
  }
  return utc;
}
// Flame Fest (November 2026): every study day in the event is saved as a
// flame on the student's calendar (users/{uid}.flameFest.days); rewards are
// claimed in api/flame-fest.js (which imports these dates).
export const FLAME_FEST_START = '2026-11-01', FLAME_FEST_END = '2026-11-30';
const inFlameFest = day => day >= FLAME_FEST_START && day <= FLAME_FEST_END;
const addDays = (day, n) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
export async function advanceStudyStreak(db, uid, clientDay) {
  const ref = db.collection('users').doc(uid);
  const today = studyDay(clientDay);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const last = data.streakLastDay;
    if (last === today) return;
    // A last day beyond tomorrow (UTC) can't be real — treat it as no streak.
    const lastValid = typeof last === 'string' && DAY_KEY.test(last) && last <= utcDayKey(1);
    if (lastValid && last > today) return; // never move a streak backwards
    const gap = lastValid ? (Date.parse(today) - Date.parse(last)) / 86400000 : NaN;
    const previous = Math.max(0, Number(data.streakCount) || 0);
    const shields = Math.max(0, Math.floor(Number(data.flameShields) || 0));
    // Flame Shields (Flame Fest rewards) each cover one missed day, so the
    // streak carries on; one shield per missed day, used automatically.
    const missed = gap >= 2 ? gap - 1 : 0;
    const shielded = missed > 0 && missed <= shields;
    const count = gap === 1 || shielded ? Math.min(10000, previous + 1) : 1;
    const update = { streakLastDay: today, streakCount: count };
    if (shielded) update.flameShields = shields - missed;
    const savedDays = shielded ? Array.from({ length: missed }, (_, k) => addDays(last, k + 1)) : [];
    if (inFlameFest(today) || savedDays.some(inFlameFest)) {
      const fest = data.flameFest && typeof data.flameFest === 'object' ? data.flameFest : {};
      const days = new Set(Array.isArray(fest.days) ? fest.days : []);
      if (inFlameFest(today)) days.add(today);
      const shieldDays = new Set(Array.isArray(fest.shielded) ? fest.shielded : []);
      savedDays.filter(inFlameFest).forEach(d => shieldDays.add(d));
      update.flameFest = { ...fest, days: [...days].sort(), shielded: [...shieldDays].sort() };
    }
    tx.set(ref, update, { merge: true });
  });
}
