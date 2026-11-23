// api/_family.js — the Family plan (Dec 2026): Knox Plus for the payer and up
// to 3 more students. Reached through /api/me?route=family (Vercel's function
// limit), and syncFamily() is called by the Stripe webhook.
//
// Data (server-only; Firestore rules allow no client access):
//   families/{ownerUid}       { owner, members: [uid…], until (ms), inviteCode }
//   familyInvites/{code}      { owner, createdAt }
//   users/{ownerUid}          family: true (set by the webhook with plan 'super')
//   users/{memberUid}         familyOwner, familyUntil (ms) — tierOf() reads familyUntil
//
// GET                         → { role: 'owner'|'member'|null, … }
// POST { action: 'invite' }   → owner: a new invite link (the old one stops working)
// POST { action: 'join', code }   a student joins with an invite link
// POST { action: 'remove', uid }  owner takes a member off
// POST { action: 'leave' }        a member leaves
import { FieldValue } from "firebase-admin/firestore";
import { FAMILY_SEATS, activeAppleTier } from "./_plans.js";

const DAY = 86400000;
export const FAMILY_GRACE_MS = 3 * DAY; // a late renewal never cuts members off
const CODE = /^[A-Za-z0-9]{10}$/;
const newCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; return [...globalThis.crypto.getRandomValues(new Uint8Array(10))].map(b => a[b % a.length]).join(""); };
const appUrl = () => (process.env.APP_URL || "https://knoxknowsapp.com").replace(/\/$/, "");
const ownerActive = d => d?.family === true && ["active", "trialing", "past_due"].includes(d?.planStatus);

// The webhook keeps every member's access in step with the payer's subscription:
// `until` = paid-through date + grace while it runs, 0 when it ends.
export async function syncFamily(db, ownerUid, until) {
  const ref = db.collection("families").doc(ownerUid);
  const snap = await ref.get();
  if (!snap.exists && !until) return;
  await ref.set({ owner: ownerUid, until: until || 0, updatedAt: new Date().toISOString() }, { merge: true });
  for (const m of snap.data()?.members || []) {
    const mref = db.collection("users").doc(m);
    await db.runTransaction(async tx => {
      const ms = await tx.get(mref);
      if (ms.data()?.familyOwner !== ownerUid) return; // they left or moved to another family
      tx.set(mref, { familyUntil: until || 0 }, { merge: true });
    }).catch(err => console.error("Family member sync failed:", m, err.message));
  }
}
export const familyUntilOf = sub => {
  const end = sub?.status === "trialing" && sub?.trial_end ? sub.trial_end : sub?.items?.data?.[0]?.current_period_end || sub?.current_period_end;
  return end ? end * 1000 + FAMILY_GRACE_MS : 0;
};

async function who(auth, uid) {
  try { const u = await auth.getUser(uid); return { uid, name: u.displayName || (u.email || "").split("@")[0] || "Student", email: u.email || "" }; }
  catch { return { uid, name: "Student", email: "" }; }
}

export default async function family(req, res, { db, auth }) {
  res.setHeader("Cache-Control", "no-store");
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in first." });
  let me;
  try { me = (await auth.verifyIdToken(h.slice(7))).uid; } catch { return res.status(401).json({ error: "Please sign in again." }); }
  const users = db.collection("users"), fams = db.collection("families"), invites = db.collection("familyInvites");
  const body = req.body && typeof req.body === "object" ? req.body : {};

  try {
    if (req.method === "GET") {
      const d = (await users.doc(me).get()).data() || {};
      if (ownerActive(d)) {
        const ref = fams.doc(me);
        let f = (await ref.get()).data() || {};
        if (!f.inviteCode) { // first visit: make the invite link
          const code = newCode();
          await invites.doc(code).set({ owner: me, createdAt: new Date().toISOString() });
          await ref.set({ owner: me, members: f.members || [], inviteCode: code }, { merge: true });
          f = { ...f, inviteCode: code };
        }
        const members = await Promise.all((f.members || []).map(m => who(auth, m)));
        return res.status(200).json({ role: "owner", seats: FAMILY_SEATS, members, invite: `${appUrl()}/app?family=${f.inviteCode}`, until: f.until || 0 });
      }
      if (d.familyOwner && Number(d.familyUntil) > Date.now()) {
        const o = await who(auth, d.familyOwner);
        return res.status(200).json({ role: "member", owner: { name: o.name }, until: Number(d.familyUntil) });
      }
      return res.status(200).json({ role: null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const action = body.action;

    if (action === "invite") {
      const d = (await users.doc(me).get()).data() || {};
      if (!ownerActive(d)) return res.status(403).json({ error: "Only the person who pays for the Family plan can invite." });
      const ref = fams.doc(me), old = (await ref.get()).data()?.inviteCode, code = newCode();
      await invites.doc(code).set({ owner: me, createdAt: new Date().toISOString() });
      await ref.set({ owner: me, inviteCode: code }, { merge: true });
      if (old && CODE.test(old)) await invites.doc(old).delete().catch(() => {});
      return res.status(200).json({ invite: `${appUrl()}/app?family=${code}` });
    }

    if (action === "join") {
      const code = String(body.code || "");
      if (!CODE.test(code)) return res.status(400).json({ error: "That invite link isn't right. Ask for a new one." });
      const result = await db.runTransaction(async tx => {
        const inv = await tx.get(invites.doc(code));
        if (!inv.exists) return { status: 404, error: "That invite link has expired. Ask the person who invited you for a new one." };
        const owner = inv.data().owner;
        if (owner === me) return { status: 409, error: "This is your own Family plan. Send the link to the students you want to add." };
        const [fam, od, md] = await Promise.all([tx.get(fams.doc(owner)), tx.get(users.doc(owner)), tx.get(users.doc(me))]);
        const f = fam.data() || {}, o = od.data() || {}, m = md.data() || {};
        if (!ownerActive(o) || !(Number(f.until) > Date.now())) return { status: 409, error: "This Family plan isn't active right now. Ask the person who invited you to check their plan." };
        if (f.inviteCode !== code) return { status: 404, error: "That invite link has expired. Ask for a new one." };
        if (m.family === true && ownerActive(m)) return { status: 409, error: "You pay for your own Family plan, so you can't join another one." };
        if (m.familyOwner === owner && Number(m.familyUntil) > Date.now()) return { status: 200, already: true };
        if (m.familyOwner && m.familyOwner !== owner && Number(m.familyUntil) > Date.now()) return { status: 409, error: "You're already on another Family plan. Leave it in Account & Plan first." };
        const members = (f.members || []).filter(x => x !== me);
        if (members.length >= FAMILY_SEATS - 1) return { status: 409, error: `This Family plan is full (${FAMILY_SEATS} students). Ask them to remove someone first.` };
        tx.set(fams.doc(owner), { members: [...members, me] }, { merge: true });
        tx.set(users.doc(me), { familyOwner: owner, familyUntil: Number(f.until), familyJoinedAt: new Date().toISOString() }, { merge: true });
        // Still paying for Knox themselves? Tell them, so they don't pay twice.
        const paysToo = !!m.stripeSubscription && ["active", "trialing", "past_due"].includes(m.planStatus) || !!activeAppleTier(m);
        return { status: 200, owner, paysToo };
      });
      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      const o = result.owner ? await who(auth, result.owner) : null;
      return res.status(200).json({ joined: true, already: !!result.already, owner: o ? { name: o.name } : null, paysToo: !!result.paysToo });
    }

    if (action === "remove" || action === "leave") {
      const target = action === "leave" ? me : String(body.uid || "");
      const owner = action === "leave" ? (await users.doc(me).get()).data()?.familyOwner : me;
      if (!owner || !target || target === owner) return res.status(400).json({ error: "Nothing to change." });
      await db.runTransaction(async tx => {
        const [fam, td] = await Promise.all([tx.get(fams.doc(owner)), tx.get(users.doc(target))]);
        if (action === "remove" && !(fam.data()?.members || []).includes(target)) return;
        tx.set(fams.doc(owner), { members: FieldValue.arrayRemove(target) }, { merge: true });
        if (td.data()?.familyOwner === owner) tx.set(users.doc(target), { familyOwner: null, familyUntil: 0 }, { merge: true });
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("Family route failed:", err);
    return res.status(503).json({ error: "Knox is busy right now. Please try again in a moment." });
  }
}
