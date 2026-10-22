// api/_support-desk.js — the Knox Support Desk (support-desk.html): where the
// Knox team answers students who wrote to Knox Support. Reached through
// api/_support.js (actions starting with "desk-").
//
// Who can use it:
//   owner  — the ADMIN_UID account (verified email). Everything, plus managing
//            the team and the saved replies.
//   agent  — anyone the owner adds (supportAgents/{uid}). Reply, internal
//            notes, assign, solve/reopen. Refunds only if given "Can refund".
//
// Data (server-only collections):
//   supportChats/{id}   + assignedTo {uid,name}, notes [{text,by,byUid,at}],
//                         firstReplyAt, solvedAt/solvedBy, refunds [...]
//   supportAgents/{uid} { email, name, canRefund, notify, addedAt }
//   supportConfig/replies { list:[{title,text}] }
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { accountFacts, sendEmail, flushEmails, clip, esc, MAX_MESSAGES, SUPPORT_EMAIL, updateChat } from "./_support-shared.js";

const APP_URL = "https://knoxknowsapp.com/app?open=messages";
const DEFAULT_REPLIES = [
  { title: "Refund approved", text: "Hi! I've refunded your payment in full — it usually shows up on your card in 5–10 business days. Your plan has been cancelled so you won't be charged again. Thanks for trying Knox, and you're always welcome back on the free plan!" },
  { title: "Refund window passed", text: "Hi! I'm sorry — your payment was outside our refund window (7 days for monthly plans, 14 days for yearly). I've made sure you can still cancel anytime from Account & Plan → Manage Billing, and you'll keep your plan until the end of the time you paid for." },
  { title: "How to cancel", text: "You can cancel anytime: tap your profile → Account & Plan → Manage Billing, then cancel there. You'll keep your plan until the end of the time you paid for." },
  { title: "Plan not showing", text: "Thanks for letting us know! Please make sure you're signed in with the same email you used to pay, then refresh the page. If it's still missing, tell me the email you paid with and I'll fix it." },
  { title: "Need more info", text: "Thanks for reaching out! Could you tell me a bit more about what happened (and a screenshot if you have one)? That'll help me sort it out quickly." },
  { title: "Solved — anything else?", text: "Glad that's sorted! Is there anything else I can help with?" },
];

const isOwner = user => {
  const ADMIN_UID = (process.env.ADMIN_UID || "").trim();
  return !!ADMIN_UID && user.uid === ADMIN_UID && user.email_verified === true;
};

// The signed-in person's Support Desk role, or null.
async function whoIs(db, user) {
  const doc = await db.collection("supportAgents").doc(user.uid).get();
  const a = doc.exists ? doc.data() : null;
  if (isOwner(user)) return { role: "owner", uid: user.uid, email: user.email, name: a?.name || "Sion", canRefund: true, notify: !!a?.notify };
  if (!a) return null;
  return { role: "agent", uid: user.uid, email: user.email, name: a.name || (user.email || "").split("@")[0], canRefund: !!a.canRefund, notify: !!a.notify };
}

const deskSummary = (id, c) => {
  const last = (c.messages || []).at(-1);
  return {
    id, status: c.status, kind: c.kind || null, title: c.title || "", updatedAt: c.updatedAt || 0,
    email: c.email || null, name: c.name || "", teamUnread: !!c.teamUnread,
    assignedTo: c.assignedTo || null, refundEligible: c.refundEligible ?? null,
    handedOff: !!c.kind, last: last ? { from: last.from, by: last.by || null, text: clip(last.text, 140) } : null,
  };
};
const deskChat = (id, c) => ({
  ...deskSummary(id, c), uid: c.uid, createdAt: c.createdAt || null,
  messages: c.messages || [], notes: c.notes || [], refunds: c.refunds || [],
  firstReplyAt: c.firstReplyAt || null, solvedAt: c.solvedAt || null, solvedBy: c.solvedBy || null,
});

const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);
const money = (cents, cur = "usd") => (cents / 100).toLocaleString("en-US", { style: "currency", currency: cur.toUpperCase() });

export default async function desk(req, res, { user, db, body }) {
  const me = await whoIs(db, user);
  if (!me) return res.status(403).json({ error: "This account isn't on the Knox support team. Ask Sion to add you." });
  const action = body.action;
  const chats = db.collection("supportChats");
  const now = Date.now();

  // ── About me ──
  if (action === "desk-me") {
    const cfg = await db.collection("supportConfig").doc("replies").get();
    return res.status(200).json({ me, replies: cfg.exists ? cfg.data().list || [] : DEFAULT_REPLIES });
  }
  if (action === "desk-me-save") {
    const update = {};
    if (typeof body.name === "string" && body.name.trim()) update.name = clip(body.name, 40);
    if (typeof body.notify === "boolean") update.notify = body.notify;
    await db.collection("supportAgents").doc(me.uid).set({ email: user.email || null, ...update }, { merge: true });
    return res.status(200).json({ me: { ...me, ...update } });
  }

  // ── Team + saved replies (owner) ──
  // Everyone on the team can see who's on it (to assign conversations).
  if (action === "desk-team") {
    const snap = await db.collection("supportAgents").get();
    const owner = (process.env.ADMIN_UID || "").trim();
    const team = snap.docs.map(d => ({ uid: d.id, name: d.data().name || d.data().email, email: d.data().email || null, owner: d.id === owner,
      ...(me.role === "owner" ? { canRefund: !!d.data().canRefund, notify: !!d.data().notify, addedAt: d.data().addedAt || null } : {}) }));
    if (owner && !team.some(a => a.uid === owner)) team.unshift({ uid: owner, name: "Sion", email: null, owner: true });
    return res.status(200).json({ team });
  }
  if (action.startsWith("desk-team") || action === "desk-replies-save") {
    if (me.role !== "owner") return res.status(403).json({ error: "Only Sion can change the team." });
    const agents = db.collection("supportAgents");
    if (action === "desk-team-save") {
      const email = clip(body.email, 254).toLowerCase();
      let found;
      try { found = await getAuth().getUserByEmail(email); }
      catch { return res.status(404).json({ error: `No Knox account uses ${email}. They need to sign up at knoxknowsapp.com first.` }); }
      const ref = agents.doc(found.uid), had = (await ref.get()).exists;
      await ref.set({
        email: found.email, name: clip(body.name, 40) || found.displayName || email.split("@")[0],
        canRefund: !!body.canRefund, notify: body.notify !== false,
        ...(had ? {} : { addedAt: now, addedBy: me.name }),
      }, { merge: true });
      return res.status(200).json({ ok: true, uid: found.uid });
    }
    if (action === "desk-team-remove") {
      if (body.uid === me.uid) return res.status(400).json({ error: "You can't remove yourself." });
      await agents.doc(clip(body.uid, 128) || "-").delete();
      return res.status(200).json({ ok: true });
    }
    if (action === "desk-replies-save") {
      const list = (Array.isArray(body.list) ? body.list : []).slice(0, 40)
        .map(r => ({ title: clip(r?.title, 60), text: clip(r?.text, 2000) })).filter(r => r.title && r.text);
      await db.collection("supportConfig").doc("replies").set({ list, updatedAt: now, updatedBy: me.name });
      return res.status(200).json({ replies: list });
    }
    return res.status(400).json({ error: "Unknown action." });
  }

  // ── Inbox ──
  if (action === "desk-list") {
    const delivery = await flushEmails(db);
    const snap = await chats.orderBy("updatedAt", "desc").limit(300).get();
    return res.status(200).json({ delivery, chats: snap.docs.map(d => deskSummary(d.id, d.data())) });
  }

  // Everything below works on one conversation.
  const ref = chats.doc(clip(body.id, 64) || "-");
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Conversation not found." });
  const c = snap.data();
  // Every change starts from the stored conversation (see updateChat), so two
  // teammates — or the student — writing at once never erase each other.
  const save = async change => res.status(200).json({ chat: deskChat(ref.id, await updateChat(db, ref, change)) });
  const withNote = (cur, text, system) => ({ notes: [...(cur.notes || []), { text, by: me.name, byUid: me.uid, at: now, ...(system ? { system: true } : {}) }].slice(-100) });

  if (action === "desk-get") {
    if (c.teamUnread && (!c.assignedTo || c.assignedTo.uid === me.uid)) await ref.update({ teamUnread: false });
    const out = { chat: deskChat(ref.id, c) };
    if (!body.light) {
      const [facts, others] = await Promise.all([
        accountFacts(db, c.uid, c.email),
        chats.where("uid", "==", c.uid).limit(20).get(),
      ]);
      out.account = facts.text;
      out.hasBilling = !!(await db.collection("users").doc(c.uid).get()).data()?.stripeCustomerId;
      out.history = others.docs.filter(d => d.id !== ref.id).map(d => ({ id: d.id, title: d.data().title, status: d.data().status, updatedAt: d.data().updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return res.status(200).json(out);
  }

  if (action === "desk-reply") {
    const text = clip(body.text, 4000);
    if (!text) return res.status(400).json({ error: "Write a reply first." });
    const solve = body.solve === true;
    const after = await updateChat(db, ref, cur => ({
      messages: [...(cur.messages || []), { from: "team", text, at: now, by: me.name, byUid: me.uid }].slice(-MAX_MESSAGES),
      status: solve ? "closed" : "replied", updatedAt: now, userUnread: (cur.userUnread || 0) + 1, teamUnread: false,
      kind: cur.kind || "human",
      ...(cur.firstReplyAt ? {} : { firstReplyAt: now }),
      ...(cur.assignedTo ? {} : { assignedTo: { uid: me.uid, name: me.name } }),
      ...(solve ? { solvedAt: now, solvedBy: me.name } : {}),
    }));
    if (c.email) {
      await sendEmail({ db, studentUid: c.uid,
        to: c.email, replyTo: SUPPORT_EMAIL, from: "Knox Knows", subject: `${me.name} from Knox Knows replied to your message`,
        html: `<div style="font-family:Nunito,Arial,sans-serif;max-width:520px;margin:auto;color:#3C3C3C">
          <h2 style="color:#FF6B00;margin:0 0 12px">${esc(me.name)} from the Knox team replied 🦊</h2>
          <div style="white-space:pre-wrap;background:#FFF8F0;border:2px solid #FFE0C2;border-radius:14px;padding:14px 16px;font-size:15px;line-height:1.5">${esc(text)}</div>
          <p style="margin:18px 0"><a href="${APP_URL}" style="background:#FF6B00;color:#fff;font-weight:800;padding:12px 20px;border-radius:12px;text-decoration:none;display:inline-block">Open your messages</a></p>
          <p style="font-size:13px;color:#777">You can also just reply to this email.</p></div>`,
        text: `${me.name} from the Knox team replied:\n\n${text}\n\nOpen your messages: ${APP_URL}\n(You can also reply to this email.)`,
      });
    }
    return res.status(200).json({ chat: deskChat(ref.id, after) });
  }

  if (action === "desk-note") {
    const text = clip(body.text, 4000);
    if (!text) return res.status(400).json({ error: "Write a note first." });
    return save(cur => withNote(cur, text));
  }

  if (action === "desk-assign") {
    let to = null;
    if (body.to === "me") to = { uid: me.uid, name: me.name };
    else if (body.to) {
      const a = await db.collection("supportAgents").doc(clip(body.to, 128)).get();
      if (a.exists) to = { uid: a.id, name: a.data().name || a.data().email };
      else if (body.to === (process.env.ADMIN_UID || "").trim()) to = { uid: body.to, name: "Sion" };
      else return res.status(404).json({ error: "That team member wasn't found." });
    }
    return save(cur => ({ assignedTo: to, ...withNote(cur, to ? `Assigned to ${to.name}` : "Unassigned", true) }));
  }

  if (action === "desk-status") {
    if (body.status === "closed") return save(() => ({ status: "closed", teamUnread: false, solvedAt: now, solvedBy: me.name, updatedAt: now }));
    if (body.status === "waiting") return save(cur => ({ status: "waiting", kind: cur.kind || "human", solvedAt: null, solvedBy: null, updatedAt: now }));
    return res.status(400).json({ error: "Unknown status." });
  }

  // ── Refunds (owner, or agents allowed to refund) ──
  if (action === "desk-charges" || action === "desk-refund") {
    if (!me.canRefund) return res.status(403).json({ error: "Ask Sion for refund access, or leave an internal note that this one needs a refund." });
    const s = stripe();
    if (!s) return res.status(503).json({ error: "Stripe isn't set up here." });
    const u = (await db.collection("users").doc(c.uid).get()).data() || {};
    if (!u.stripeCustomerId) return res.status(404).json({ error: "This student has never paid with a card on Knox." });

    if (action === "desk-charges") {
      const list = await s.charges.list({ customer: u.stripeCustomerId, limit: 10 });
      return res.status(200).json({
        hasSubscription: !!u.stripeSubscription,
        charges: list.data.filter(ch => ch.paid).map(ch => ({
          id: ch.id, amount: ch.amount, refunded: ch.amount_refunded, currency: ch.currency, created: ch.created * 1000,
          description: ch.description || (ch.invoice ? "Plan payment" : "Payment"), label: money(ch.amount, ch.currency),
          fullyRefunded: ch.refunded,
        })),
      });
    }

    const chargeId = clip(body.chargeId, 64);
    const ch = await s.charges.retrieve(chargeId).catch(() => null);
    if (!ch || ch.customer !== u.stripeCustomerId) return res.status(404).json({ error: "That payment isn't this student's." });
    if (ch.refunded) return res.status(409).json({ error: "That payment was already refunded." });
    const refund = await s.refunds.create(
      { charge: ch.id, reason: "requested_by_customer", metadata: { supportChat: ref.id, by: me.name } },
      { idempotencyKey: `knox-desk-refund-${ch.id}` },
    );
    let cancelled = false;
    if (body.cancel === true && u.stripeSubscription) {
      try { await s.subscriptions.cancel(u.stripeSubscription); cancelled = true; }
      catch (e) { console.error("Desk cancel failed:", e?.message); }
    }
    const amount = money(refund.amount, refund.currency);
    const entry = { chargeId: ch.id, refundId: refund.id, amount: refund.amount, currency: refund.currency, by: me.name, byUid: me.uid, at: now, cancelled };
    await updateChat(db, ref, cur => ({ refunds: [...(cur.refunds || []), entry], ...withNote(cur, `Refunded ${amount}${cancelled ? " and cancelled their plan" : ""}`, true) }));
    return res.status(200).json({ refunded: amount, cancelled });
  }

  return res.status(400).json({ error: "Unknown action." });
}
