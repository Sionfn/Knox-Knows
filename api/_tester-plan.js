// api/_tester-plan.js — "Pick your plan" for testers on the preview site.
// Served by api/me.js (?route=tester-plan) to stay within Vercel's function
// limit; files starting with "_" aren't deployed as functions of their own.
//
// On the preview (knoxknowspreview.vercel.app) every signed-in tester can
// switch their own account between Free, Knox Plus and Mega Knox, so the
// server's limits match what they're testing. It only ever runs on a Vercel
// *preview* deployment that uses the separate test Firebase project — on the
// real site it reports { available: false } and refuses to change anything.
//
//   GET  → { available }
//   POST { tier: 'free' | 'plus' | 'mega' } → { tier }
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { MEGA_PLAN, PLUS_PLAN } from "./_plans.js";

const TEST_PROJECT = "knox-knows-private-test";
export const testerPlansAvailable = () =>
  process.env.VERCEL_ENV === "preview" && process.env.FIREBASE_PROJECT_ID === TEST_PROJECT;

export default async function testerPlan(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ available: testerPlansAvailable() });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!testerPlansAvailable()) return res.status(403).json({ error: "Plan switching is only for the preview site." });

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in first." });
  let uid;
  try { uid = (await getAuth().verifyIdToken(auth.slice(7))).uid; }
  catch { return res.status(401).json({ error: "Please sign in again." }); }

  const tier = req.body?.tier;
  if (!["free", "plus", "mega"].includes(tier)) return res.status(400).json({ error: "Pick Free, Plus or Mega." });

  // Set the plan itself and clear anything else that grants one (comps, gift
  // or Flame Fest time), so the account is exactly the plan picked.
  await getFirestore().collection("users").doc(uid).set({
    plan: tier === "mega" ? MEGA_PLAN : tier === "plus" ? PLUS_PLAN : "free",
    comped: false,
    compedTier: FieldValue.delete(),
    plusUntil: FieldValue.delete(),
    megaUntil: FieldValue.delete(),
    testerPlan: tier,
  }, { merge: true });
  return res.status(200).json({ tier });
}
