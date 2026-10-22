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
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 5000, maxNetworkRetries: 0 });
      const sub = await stripe.subscriptions.retrieve(d.stripeSubscription);
      const item = sub.items?.data?.[0];
      const interval = item?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
      const periodEnd = (sub.current_period_end || item?.current_period_end || 0) * 1000;
      lines.push(`Subscription: ${NAMES[tier]} ${interval}, status ${sub.status}.`);
      if (sub.status === "trialing" && sub.trial_end) {
        lines.push(`In the free trial until ${fmtDate(sub.trial_end * 1000)}. Cancelling before then means no charge at all; nothing has been paid yet.`);
      } else {
        // Trial/start dates are not proof of payment. Use the earliest actual,
        // non-zero paid invoice, including the interval purchased at that time.
        let first = null, after, complete = false;
        for (let page = 0; page < 10; page++) {
          const invoices = await stripe.invoices.list({ subscription: sub.id || d.stripeSubscription, status: "paid", limit: 100, ...(after ? { starting_after: after } : {}) });
          for (const invoice of invoices.data) {
            if (invoice.amount_paid > 0 && invoice.status_transitions?.paid_at && (!first || invoice.status_transitions.paid_at < first.status_transitions.paid_at)) first = invoice;
          }
          if (!invoices.has_more) { complete = true; break; }
          after = invoices.data.at(-1)?.id;
          if (!after) break;
        }
        const firstPaid = complete && first ? first.status_transitions.paid_at * 1000 : 0;
        const originalInterval = first?.lines?.data?.find(line => line.price?.recurring?.interval)?.price.recurring.interval;
        if (firstPaid && (firstPaid < NEW_REFUND_RULES_FROM || ["year", "month"].includes(originalInterval))) {
          const windowDays = firstPaid < NEW_REFUND_RULES_FROM ? 30 : originalInterval === "year" ? 14 : 7;
          const deadline = firstPaid + windowDays * DAY;
          refund = now <= deadline;
          lines.push(`First payment: ${fmtDate(firstPaid)}. Refund window: ${windowDays} days, until ${fmtDate(deadline)} — ${refund ? "STILL INSIDE the window" : "the window has PASSED"}.`);
        } else lines.push("First paid invoice or original billing interval could not be confirmed; the team must verify refund eligibility.");
      }
      if (sub.cancel_at_period_end && periodEnd) lines.push(`Already set to cancel; the plan ends on ${fmtDate(periodEnd)} with no more charges.`);
      else if (periodEnd && ["active", "past_due"].includes(sub.status)) lines.push(`Renews on ${fmtDate(periodEnd)}.`);
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

export async function sendEmail({ db, studentUid, to, replyTo, subject, html, text, from = "Knox Support" }) {
  // Save before contacting the provider so a failed request survives a cold start.
  const ref = db.collection("supportNotifications").doc();
  await ref.set({ studentUid, state: "pending", createdAt: Date.now(), attempts: 0, nextAttemptAt: 0,
    payload: { from: `${from} <${process.env.EMAIL_FROM || SUPPORT_EMAIL}>`, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, html, text } });
  await deliverEmail(db, ref);
}

async function deliverEmail(db, ref) {
  const now = Date.now();
  const item = await db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data();
    if (!item || item.state === "sent" || item.nextAttemptAt > now || item.leaseUntil > now) return null;
    tx.set(ref, { leaseUntil: now + 60000, attempts: item.attempts + 1 }, { merge: true });
    return item;
  });
  if (!item) return;
  try {
    if (!process.env.RESEND_API_KEY) throw new Error("Email provider is not configured");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `support-${ref.id}` },
      body: JSON.stringify(item.payload),
    });
    if (!r.ok) throw new Error(`Email provider returned ${r.status}`);
    await ref.set({ state: "sent", sentAt: Date.now(), leaseUntil: 0, lastError: null, payload: null }, { merge: true });
  } catch (e) {
    await ref.set({ state: "pending", leaseUntil: 0, nextAttemptAt: Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(item.attempts, 7)), lastError: String(e.message).slice(0, 200) }, { merge: true });
  }
}

// Polling the student inbox or authorized desk also recovers queued deliveries.
// No cron job is required; inactive queues resume on the next visit.
export async function flushEmails(db, studentUid) {
  let query = db.collection("supportNotifications").where("state", "==", "pending");
  if (studentUid) query = query.where("studentUid", "==", studentUid);
  const pending = (await query.get()).docs;
  const due = pending.filter(d => !(d.data().nextAttemptAt > Date.now()) && !(d.data().leaseUntil > Date.now())).slice(0, 3);
  await Promise.all(due.map(d => deliverEmail(db, db.collection("supportNotifications").doc(d.id))));
  return { pending: (await query.get()).docs.length };
}
