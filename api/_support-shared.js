// api/_support-shared.js — pieces used by both Knox Support (api/_support.js)
// and the Support Desk (api/_support-desk.js).
import Stripe from "stripe";
import { tierOf } from "./_plans.js";

export const SUPPORT_EMAIL = "support@knoxknowsapp.com";
const NEW_REFUND_RULES_FROM = Date.parse("2026-11-01T00:00:00-07:00"); // before this: 30 days
const DAY = 86400000;
export const MAX_MESSAGES = 120;                   // per conversation
export const NAMES = { free: "Free", plus: "Knox Plus", mega: "Mega Knox" };

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmtDate = ms => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
export const clip = (s, n) => String(s || "").trim().slice(0, n);

// What Knox Support knows about this student's account, as short lines.
export async function accountFacts(db, uid, email) {
  const d = (await db.collection("users").doc(uid).get()).data() || {};
  const now = Date.now(), tier = tierOf(d), lines = [`Email: ${email || "unknown"}`, `Plan: ${NAMES[tier]}`];
  let refund = null;
  if (d.ambassador === true) lines.push("Knox Ambassador: free Mega Knox (nothing billed).");
  else if (d.comped === true) lines.push(`Free ${NAMES[d.compedTier === "mega" ? "mega" : "plus"]} given by Knox Knows (nothing billed).`);
  const giftUntil = Math.max(Number(d.megaUntil) || 0, Number(d.plusUntil) || 0);
  if (giftUntil > now) lines.push(`Plan time from a gift code or Flame Fest until ${fmtDate(giftUntil)} (one-time, never renews, nothing to cancel).`);
  if (d.planStatus === "cancelled" || d.cancelledAt) lines.push(`A subscription was cancelled${d.cancelledAt ? " on " + fmtDate(Date.parse(d.cancelledAt)) : ""}.`);

  if (d.stripeSubscription && process.env.STRIPE_SECRET_KEY) {
    try {
      const sub = await new Stripe(process.env.STRIPE_SECRET_KEY).subscriptions.retrieve(d.stripeSubscription);
      const item = sub.items?.data?.[0];
      const interval = item?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
      const periodEnd = (sub.current_period_end || item?.current_period_end || 0) * 1000;
      lines.push(`Subscription: ${NAMES[tier]} ${interval}, status ${sub.status}.`);
      if (sub.status === "trialing" && sub.trial_end) {
        lines.push(`In the free trial until ${fmtDate(sub.trial_end * 1000)}. Cancelling before then means no charge at all; nothing has been paid yet.`);
      } else {
        // First payment: the end of the trial, if there was one, else the start.
        const firstPaid = (sub.trial_end || sub.start_date || 0) * 1000 || Date.parse(d.planActivatedAt || "") || 0;
        if (firstPaid) {
          const windowDays = firstPaid < NEW_REFUND_RULES_FROM ? 30 : interval === "yearly" ? 14 : 7;
          const deadline = firstPaid + windowDays * DAY;
          refund = now <= deadline;
          lines.push(`First payment: ${fmtDate(firstPaid)}. Refund window: ${windowDays} days, until ${fmtDate(deadline)} — ${refund ? "STILL INSIDE the window" : "the window has PASSED"}.`);
        }
      }
      if (sub.cancel_at_period_end && periodEnd) lines.push(`Already set to cancel; the plan ends on ${fmtDate(periodEnd)} with no more charges.`);
      else if (periodEnd && sub.status !== "trialing") lines.push(`Renews on ${fmtDate(periodEnd)}.`);
    } catch { lines.push("Billing details couldn't be loaded right now."); }
  } else if (tier === "free") {
    lines.push("No paid subscription on this account.");
  }
  return { text: lines.join("\n"), refund, name: d.displayName || d.name || "" };
}

export const forStudent = (id, c) => ({
  id, status: c.status, kind: c.kind || null, title: c.title, updatedAt: c.updatedAt,
  unread: c.userUnread || 0, messages: (c.messages || []).map(({ byUid, ...m }) => m),
});
export const summary = (id, c) => {
  const last = (c.messages || []).at(-1);
  return { id, status: c.status, kind: c.kind || null, title: c.title, updatedAt: c.updatedAt, unread: c.userUnread || 0, last: last ? { from: last.from, by: last.by || null, text: clip(last.text, 140) } : null };
};
// Change a conversation inside a transaction, starting from what's stored
// right now: a team reply, note or assignment can land while Knox Support is
// thinking, and a plain overwrite would erase it. `change(current)` returns
// the fields to write; resolves to the conversation after the change.
export async function updateChat(db, ref, change) {
  return db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() || {};
    const update = change(cur);
    tx.set(ref, update, { merge: true });
    return { ...cur, ...update };
  });
}

// A conversation the Knox team has (or had) is theirs: new messages from the
// student go to them instead of Knox Support, even after it was solved.
export const isWithTeam = c => c.status === "waiting" || c.status === "replied" || (c.status === "closed" && !!c.kind);

export const transcriptOf = c => (c.messages || []).map(m => `${m.from === "user" ? "Student" : m.from === "team" ? "Knox team" : "Knox Support"}: ${m.text}`).join("\n\n");

export async function sendEmail({ to, replyTo, subject, html, text, from = "Knox Support" }) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${from} <${process.env.EMAIL_FROM || SUPPORT_EMAIL}>`, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, html, text }),
    });
    if (!r.ok) console.error("Support email failed:", (await r.text()).slice(0, 300));
  } catch (e) { console.error("Support email failed:", e?.message); }
}
