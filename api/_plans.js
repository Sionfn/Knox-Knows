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
// time-limited Plus (`plusUntil`) or Mega (`megaUntil`), in ms. App Store
// subscriptions set appleTier + appleUntil (api/_apple.js).
//
// Family plan (Dec 2026): Knox Plus for the payer and up to 3 more students
// ($19.99/mo, $149/yr). The payer is stored like Knox Plus (plan 'super') with
// `family: true`; each member gets `familyUntil` (ms, the payer's paid-through
// date plus a few days, refreshed on every renewal) and `familyOwner`. Only the
// server writes these (api/_family.js, api/webhook.js).
export const MEGA_PLAN = "max";
export const PLUS_PLAN = "super";
export const FAMILY_PLAN = "family";   // the checkout choice; stored as PLUS_PLAN + family: true
export const FAMILY_SEATS = 4;         // the payer + 3 members

export function activeAppleTier(d, now = Date.now()) {
  const legacy = Number(d?.appleUntil) > now ? d?.appleTier : null;
  if (Number(d?.appleMegaUntil) > now || legacy === "mega") return "mega";
  if (Number(d?.applePlusUntil) > now || legacy === "plus") return "plus";
  return null;
}

export function tierOf(d, now = Date.now()) {
  const apple = activeAppleTier(d, now);
  if (d?.plan === MEGA_PLAN || Number(d?.megaUntil) > now || (d?.comped === true && d?.compedTier === "mega") || apple === "mega") return "mega";
  if (d?.plan === "super" || d?.plan === "plus" || d?.comped === true || Number(d?.plusUntil) > now || Number(d?.familyUntil) > now || apple === "plus") return "plus";
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

// Daily credit banks. Free and Knox Plus earn credits every 24 hours and save
// unused ones for up to 4 days' worth; Mega Knox is unlimited (fair-use only).
// A typed question costs 1, a photo or file 2; replies inside a Learn lesson are free.
export const BANKS = {
  free: { regen: 5,  max: 20,  start: 10, doc: "bank" },
  plus: { regen: 50, max: 200, start: 50, doc: "plusBank" },
};
// Knox Plus moves to credits on Dec 1, 2026 (straight away on preview builds, to
// test). A subscriber from before then keeps unlimited until their next renewal:
// set `plusLegacyUntil` (ms) on their user doc to that renewal date.
export const PLUS_CREDITS_START = Date.parse("2026-12-01T08:00:00Z");
export function plusUsesCredits(d, now = Date.now()) {
  if (Number(d?.plusLegacyUntil) > now) return false;
  return now >= PLUS_CREDITS_START || process.env.VERCEL_ENV === "preview";
}

// The plan value a comped account falls back to when a subscription of theirs ends.
export const compedPlan = d => d?.compedTier === "mega" ? MEGA_PLAN : PLUS_PLAN;

// Stripe prices for Mega Knox live in Vercel env vars (made in the Stripe
// dashboard): STRIPE_PRICE_MEGA_MONTHLY and STRIPE_PRICE_MEGA_YEARLY.
export const megaPrices = () => ({
  monthly: (process.env.STRIPE_PRICE_MEGA_MONTHLY || "").trim(),
  yearly:  (process.env.STRIPE_PRICE_MEGA_YEARLY  || "").trim(),
});

// Family plan prices (env vars, made in the Stripe dashboard):
// STRIPE_PRICE_FAMILY_MONTHLY ($19.99/mo) and STRIPE_PRICE_FAMILY_YEARLY ($149/yr).
export const familyPrices = () => ({
  monthly: (process.env.STRIPE_PRICE_FAMILY_MONTHLY || "").trim(),
  yearly:  (process.env.STRIPE_PRICE_FAMILY_YEARLY  || "").trim(),
});
export const isFamilyPrice = id => !!id && Object.values(familyPrices()).includes(id);
