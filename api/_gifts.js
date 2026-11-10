// api/_gifts.js — Knox Plus gift codes, shared by:
//   create-checkout-session.js (buy a gift), webhook.js (payment → code + email),
//   admin-comp.js (make codes yourself) and redeem.js (use a code).
// Files starting with "_" aren't deployed as their own Vercel functions.
//
// A gift is time-limited Knox Plus or Mega Knox with no subscription: redeeming
// adds its days to users/{uid}.plusUntil or .megaUntil (stacking with any time
// left) — old codes without a tier are Knox Plus. Formerly: redeeming adds its days
// to users/{uid}.plusUntil (stacking with any time left), and nothing ever
// renews or charges the person who redeems it. Codes never expire.
// Codes live in giftCodes/{code} (12 characters; Flame Fest friend links use 8).
import crypto from "crypto";

// Knox Plus gifts keep their original ids; Mega Knox gifts start with "mega-".
// `name` is how the plan is written in emails and on Stripe's checkout page.
export const GIFTS = {
  "1m":       { tier: "plus", name: "Knox Plus", label: "1 month",   days: 31,  cents: 999 },
  "3m":       { tier: "plus", name: "Knox Plus", label: "3 months",  days: 92,  cents: 2999 },
  "12m":      { tier: "plus", name: "Knox Plus", label: "12 months", days: 365, cents: 7999 },
  "mega-1m":  { tier: "mega", name: "Mega Knox", label: "1 month",   days: 31,  cents: 1299 },
  "mega-3m":  { tier: "mega", name: "Mega Knox", label: "3 months",  days: 92,  cents: 3699 },
  "mega-12m": { tier: "mega", name: "Mega Knox", label: "12 months", days: 365, cents: 9999 },
};

// No 0/O or 1/I, so a code read off a card is never ambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// A 12-character code (60 bits). With a seed (a Stripe checkout id + a
// server secret) the same purchase always makes the same code, so a webhook
// that runs twice can't create two.
export function newGiftCode(seed) {
  const bytes = seed ? crypto.createHash("sha256").update(String(seed)).digest() : crypto.randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}
export const formatCode = code => code.length === 12 ? `KNOX-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` : code;
// "knox-7f3k q9wx-..." → "7F3KQ9WX...", or "" if it can't be a code.
export function normalizeCode(input) {
  let s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 16 && s.startsWith("KNOX")) s = s.slice(4);
  return /^[A-Z0-9]{8}$|^[A-Z0-9]{12}$/.test(s) ? s : "";
}

// Make `count` fresh codes worth `days` of Knox Plus or Mega Knox (admin giveaways).
export async function createGiftCodes(db, { days, count = 1, source, ...extra }) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 5; tries++) {
      const code = newGiftCode();
      const ref = db.collection("giftCodes").doc(code);
      const made = await db.runTransaction(async tx => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, { days, source, ...extra, createdAt: new Date().toISOString(), redeemedBy: null });
        return true;
      });
      if (made) { codes.push(code); break; }
    }
  }
  return codes;
}

// The email a buyer gets: a little gift card with the code and a redeem link.
export function giftEmail({ code, label, name = "Knox Plus", appUrl = "https://knoxknowsapp.com" }) {
  const pretty = formatCode(code);
  const link = `${appUrl}/redeem?code=${encodeURIComponent(pretty)}`;
  const subject = `🎁 Your ${name} gift code (${label})`;
  const text = `Thanks for giving ${name}!

Gift: ${label} of ${name}
Code: ${pretty}

To use it, open ${link} and sign in (or make a free account). The code works once and never expires. It's not a subscription — nothing renews and the person you give it to is never charged.

Happy studying! 🦊
— Sion at Knox Knows`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#18181B;">
  <p style="font-size:16px;">Thanks for giving ${name}! Here's your gift card — forward this email or print it out.</p>
  <div style="margin:22px 0;padding:26px 22px;border-radius:22px;background:linear-gradient(135deg,#FF6B00,#FF9500);color:#fff;text-align:center;box-shadow:0 6px 0 #CC5500;">
    <div style="font-size:40px;line-height:1;">🎁🦊</div>
    <div style="font-size:24px;font-weight:900;margin:10px 0 2px;">${label} of ${name}</div>
    <div style="font-size:14px;font-weight:700;opacity:.9;">Unlimited homework help from Knox</div>
    <div style="margin:18px auto 6px;display:inline-block;padding:12px 18px;border-radius:14px;background:#fff;color:#18181B;font-family:'Courier New',monospace;font-size:20px;font-weight:900;letter-spacing:2px;">${pretty}</div>
  </div>
  <p style="font-size:15px;"><strong>To use it:</strong> go to <a href="${link}" style="color:#FF6B00;font-weight:700;">knoxknowsapp.com/redeem</a>, sign in (or make a free account), and enter the code.</p>
  <p style="font-size:13px;color:#52525B;">The code works once and never expires. It's not a subscription — nothing renews, and the person you give it to is never charged.</p>
  <p style="font-size:15px;">Happy studying! 🦊<br>— Sion at Knox Knows</p>
</div>`;
  return { subject, text, html };
}
