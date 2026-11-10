// api/_plans.js — Knox's plans, shared by every API route.
// Files starting with "_" aren't deployed as their own Vercel functions.
//
//   free  — daily credits
//   plus  — Knox Plus ($9.99/mo, $79.99/yr). Stored as plan 'super' (or the
//           older 'plus').
//   mega  — Mega Knox ($12.99/mo, $99.99/yr). Stored as plan 'max' — the old
//           top tier's value, which every older check (and the Chrome
//           extension) already treats as paid.
//
// Comped accounts carry the same plan values (plus `comped: true`; Knox
// Ambassadors also `ambassador: true`). Gift codes and Flame Fest add
// time-limited Plus (`plusUntil`) or Mega (`megaUntil`), in ms.
export const MEGA_PLAN = "max";
export const PLUS_PLAN = "super";

export function tierOf(d, now = Date.now()) {
  if (d?.plan === MEGA_PLAN || Number(d?.megaUntil) > now || (d?.comped === true && d?.compedTier === "mega")) return "mega";
  if (d?.plan === "super" || d?.plan === "plus" || d?.comped === true || Number(d?.plusUntil) > now) return "plus";
  return "free";
}
export const isPaidTier = tier => tier === "plus" || tier === "mega";

// What each plan gets where the plans differ (questions are unlimited on both
// paid plans; same AI for everyone).
export const LIMITS = {
  free: { deckCards: 10, deckPhotos: 5,  decksPerDay: 40,  docChars: 30000, askPer3h: 0,    learnTurns: 20 },
  plus: { deckCards: 15, deckPhotos: 5,  decksPerDay: 40,  docChars: 30000, askPer3h: 500,  learnTurns: 30 },
  mega: { deckCards: 40, deckPhotos: 10, decksPerDay: 100, docChars: 60000, askPer3h: 1000, learnTurns: 50 },
};

// The plan value a comped account falls back to when a subscription of theirs ends.
export const compedPlan = d => d?.compedTier === "mega" ? MEGA_PLAN : PLUS_PLAN;

// Stripe prices for Mega Knox live in Vercel env vars (made in the Stripe
// dashboard): STRIPE_PRICE_MEGA_MONTHLY and STRIPE_PRICE_MEGA_YEARLY.
export const megaPrices = () => ({
  monthly: (process.env.STRIPE_PRICE_MEGA_MONTHLY || "").trim(),
  yearly:  (process.env.STRIPE_PRICE_MEGA_YEARLY  || "").trim(),
});
