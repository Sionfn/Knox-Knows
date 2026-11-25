// api/_sim-build.js — "Knox builds it" in the Simulation Lab (simlab.js).
// Reached through /api/me?route=sim-build (Vercel's function limit).
//
// POST { prompt, kind?, level?, steps?, compare? }
//   → { sim: { type, values, title, explain, steps?, compare?, compareLabel? }, creditsLeft? }
//
// Settings (like Flashcards' "Make with Knox" options, checked here too):
//   kind     auto | ready (a built-in sim) | scratch (a custom scene — Plus/Mega)
//   level    a grade level for the explanation and numbers — Plus/Mega
//   steps    Knox works it out step by step with your numbers — Mega
//   compare  Knox adds a second setup to compare (a faded run) — Mega
//
// The student describes what they want to see ("a ball kicked off a 20 m cliff
// at 15 m/s on the Moon"); the model only PICKS one of Knox's built-in
// simulations and fills in its settings — it never writes code. The client
// clamps every value to the template's own range again.
//
// Plans (like Flashcards' "Make with Knox"):
//   Free      2 credits per build from the daily bank, starter sims only
//   Knox Plus up to 20 builds a day, every sim
//   Mega Knox up to 100 builds a day, every sim
import { tierOf } from "./_plans.js";

const FREE_DAILY_REGEN = 5, FREE_MAX_BALANCE = 20, FREE_STARTING_BALANCE = 10; // keep in sync with api/ask.js
const BUILD_COST = 2;
const PER_DAY = { plus: 20, mega: 100 };
const DAY_MS = 86400000;
const today = () => new Date().toISOString().slice(0, 10);

// The sims (simlab.js TEMPLATES). free: in the free starter set.
export const SIM_CATALOG = [
  ["equation", true, "any equation graphed with a slider for each letter (functions, systems, transformations)", "eq (the equation, like y = a x^2 + b x + c — use x and single letters; + - * / ^ ( ) sin cos tan sqrt abs ln log exp), eq2 (an optional second equation to compare), p_a, p_b, p_c, p_m … (the value of each letter, -10..10), xmax (1..100 how far x goes)"],
  ["line", true, "a straight line y = m x + b", "m (-10..10), b (-20..20), m2, b2 (a second line), second (0/1 show the second line and where they cross)"],
  ["parabola", true, "a quadratic y = a x² + b x + c", "a (-5..5), b (-20..20), c (-20..20)"],
  ["sine", false, "a sine wave y = A sin(B x + C) + D (trig, waves, sound, tides)", "amp (0..10), freq (0.1..5), phase (-180..180 degrees), shift (-10..10), cosine (0/1 compare with cosine)"],
  ["exponential", false, "exponential growth or decay (bacteria, money, half-life, viral spread)", "start (1..10000), rate (-50..100 percent per step), steps (1..60), linear (0/1 compare with straight-line growth)"],
  ["fraction", true, "a fraction shown as a picture, decimal and percent", "n (0..24), d (1..24), n2, d2 (a second fraction to compare), compare (0/1), shape (pie or bar)"],
  ["unitcircle", false, "the unit circle: sine, cosine and tangent of an angle", "angle (0..360 degrees), spin (0/1 animate)"],
  ["projectile", true, "something launched or thrown through the air", "speed (1..80 m/s), angle (0..90 degrees), height (0..200 m launch height), planet (earth, moon, mars, jupiter, sun, pluto), drag (0/1 air resistance), item (soccer, basketball, football, baseball, tennis, golf, rocket, arrow, cannonball, rock, water, apple, frisbee)"],
  ["freefall", false, "dropping something from a height", "height (1..500 m), planet, drag (0/1), item (feather, ball, rock, skydiver, apple)"],
  ["pendulum", false, "a swinging pendulum", "length (0.1..20 m), angle (1..80 degrees start), planet, damping (0..1)"],
  ["spring", false, "a mass bouncing on a spring (Hooke's law)", "mass (0.1..20 kg), k (1..200 N/m), stretch (-2..2 m start), damping (0..1)"],
  ["motion", false, "a catch-up race: A starts ahead, B chases faster", "a (1..150 speed of A), b (1..150 speed of B), head (0..300 head start), unit (mi, km, m, ft), time (h, min, s), who (car, runner, person, train, bike, plane, boat, dog, bus, truck)"],
  ["interest", true, "savings or a loan growing with interest", "p (0..100000 starting dollars), r (0..30 percent per year), t (1..50 years), add (0..5000 dollars added each month), every (year, month, day compounding), simple (0/1 compare simple interest)"],
  ["probability", true, "flipping coins or rolling dice many times", "kind (coin, die, twodice), trials (10..5000)"],
  ["population", false, "a population growing in an environment (biology)", "start (1..1000), rate (1..100 percent per generation), capacity (10..10000 carrying capacity), years (5..100), logistic (0/1 limited by capacity)"],
  ["ohm", false, "a simple circuit: voltage, current and resistance (Ohm's law)", "volts (0..24), ohms (1..1000), bulbs (1..4 in series)"],
  ["gas", false, "gas laws: pressure, volume and temperature (PV = nRT)", "temp (50..1000 K), vol (1..50 L), mol (0.1..5)"],
  ["ph", false, "mixing an acid and a base and the pH", "va (0..100 mL acid), ca (0.01..1 M), vb (0..100 mL base), cb (0.01..1 M), ind (universal, phenol, litmus)"],
  ["wave", false, "waves and sound: wavelength, frequency, interference", "amp (0.1..3), freq (0.2..5 Hz), speed (0.5..10 m/s), two (0/1 second wave), amp2, freq2, flip (0/1)"],
  ["orbit", false, "a planet orbiting a star (gravity, Kepler)", "star (0.1..5 Suns), dist (0.3..5 AU), speed (0.2..1.6 times circular speed)"],
  ["seasons", false, "seasons, daylight and the sun's height (Earth's tilt)", "lat (-90..90), day (1..365 day of the year), tilt (0..45)"],
  ["supply", false, "supply and demand, equilibrium price, price ceilings", "d0 (20..200), ds (0.2..3), s0 (0..100), ss (0.2..3), ceil (0..200, 0 = none)"],
];
const FREE_TYPES = SIM_CATALOG.filter(s => s[1]).map(s => s[0]);

export default async function simBuild(req, res, { db, auth }) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to have Knox build a simulation." });
  let uid;
  try { uid = (await auth.verifyIdToken(h.slice(7))).uid; } catch { return res.status(401).json({ error: "Please sign in again." }); }
  const prompt = String(req.body?.prompt || "").replace(/\s+/g, " ").trim().slice(0, 500);
  const LEVELS = ["Elementary", "Middle school", "High school", "College"];
  if (prompt.length < 3) return res.status(400).json({ error: "Tell Knox what you want to see." });

  const userRef = db.collection("users").doc(uid);
  let tier;
  try { const u = await userRef.get(); tier = tierOf(u.exists ? u.data() : {}); }
  catch { return res.status(503).json({ error: "Knox is busy right now. Please try again in a moment." }); }

  // Pay for it first (refunded if Knox can't build it).
  const bankRef = userRef.collection("usage").doc("bank"), capRef = userRef.collection("usage").doc("simBuild");
  let charge;
  try {
    charge = await db.runTransaction(async tx => {
      if (tier !== "free") {
        const cap = await tx.get(capRef), used = cap.exists && cap.data().day === today() ? cap.data().count || 0 : 0;
        if (used >= PER_DAY[tier]) return { status: 429 };
        tx.set(capRef, { day: today(), count: used + 1, updatedAt: new Date().toISOString() });
        return { status: 200, kind: "paid" };
      }
      const now = Date.now(), snap = await tx.get(bankRef);
      let balance = FREE_STARTING_BALANCE, lastRegenAt = now;
      if (snap.exists) {
        const d = snap.data();
        balance = typeof d.balance === "number" ? d.balance : FREE_STARTING_BALANCE;
        lastRegenAt = d.lastRegenAt || now;
        const days = Math.floor((now - lastRegenAt) / DAY_MS);
        if (days > 0) { balance = Math.max(balance, Math.min(FREE_MAX_BALANCE, balance + days * FREE_DAILY_REGEN)); lastRegenAt += days * DAY_MS; }
      }
      if (balance < BUILD_COST) { tx.set(bankRef, { balance, lastRegenAt, updatedAt: new Date().toISOString() }, { merge: true }); return { status: 402, remaining: balance }; }
      tx.set(bankRef, { balance: balance - BUILD_COST, lastRegenAt, updatedAt: new Date().toISOString() }, { merge: true });
      return { status: 200, kind: "free", remaining: balance - BUILD_COST };
    });
  } catch { return res.status(503).json({ error: "Knox is busy right now. Please try again in a moment." }); }
  if (charge.status === 429) return res.status(429).json({ error: `You've had Knox build ${PER_DAY[tier]} simulations today — that's the daily limit. Try again tomorrow!` });
  if (charge.status === 402) return res.status(402).json({ error: `Having Knox build a simulation costs ${BUILD_COST} credits — you have ${charge.remaining} left. You get 5 more every day, or go unlimited with Knox Plus.`, upgrade: true, remaining: charge.remaining });
  const refund = () => db.runTransaction(async tx => {
    if (charge.kind === "free") { const b = await tx.get(bankRef); if (b.exists) tx.set(bankRef, { balance: (b.data().balance || 0) + BUILD_COST }, { merge: true }); return; }
    const c = await tx.get(capRef); if (c.exists && c.data().day === today()) tx.set(capRef, { count: Math.max(0, (c.data().count || 1) - 1) }, { merge: true });
  }).catch(() => {});

  const allowed = tier === "free" ? SIM_CATALOG.filter(s => s[1]) : SIM_CATALOG;
  // Settings the plan includes (anything else is quietly left out).
  const kind = tier !== "free" && req.body?.kind === "scratch" ? "scratch" : req.body?.kind === "ready" ? "ready" : "auto";
  const level = tier !== "free" && LEVELS.includes(req.body?.level) ? req.body.level : "";
  const wantSteps = tier === "mega" && req.body?.steps === true, wantCompare = tier === "mega" && req.body?.compare === true;
  const extra = [
    kind === "ready" ? "Use one of the built-in simulations above (not custom)." : "",
    kind === "scratch" ? 'BUILD a custom scene (type "custom") instead of a built-in simulation.' : "",
    level ? `The student is in ${level === "College" ? "college" : level.toLowerCase()}: write "explain" for that level and keep the numbers right for it.` : "",
    wantSteps ? 'Also add "steps": 3 to 6 short strings that work the problem out step by step with the student\'s numbers (plain-text formulas like "time = 2 × 25 × sin 45° ÷ 9.81 = 3.6 s").' : "",
    wantCompare ? 'For a built-in simulation, also add "compare": {setting: value} — a second setup that is interesting to compare (change one or two settings, like a different planet, angle or rate), and "compareLabel": 2 to 5 words naming it (like "on the Moon").' : "",
  ].filter(Boolean).join("\n");
  const system = `You set up an interactive simulation in Knox Knows, a homework app for students. You can ONLY pick one of these built-in simulations and fill in its settings — never write code.
${allowed.map(([type, , what, keys]) => `- ${type}: ${what}. Settings: ${keys}`).join("\n")}
${tier === "free" ? "" : `- custom: when none of those fits, BUILD a scene from pieces instead (physics setups: ramps, collisions, springs, targets, races, bouncing, orbits without gravity, Rube Goldberg ideas). Put it in "scene":
  {"world": {"planet": earth|moon|mars|jupiter|sun|pluto|space, "air": 0..1, "bounce": 0..1, "friction": 0..1, "width": 5..200 (meters shown across)},
   "objects": [{"id": short id, "kind": ball|box|ramp|wall|spring|target|label, "x": m, "y": m (0 is the ground), "name": short name, "color": one of #FF6B00 #1CB0F6 #1FA45A #A560F2 #E5383B #FFC800 #14B8A6 #3C3C3C,
      ball: "r" radius m, "mass" kg, "speed" m/s, "dir" degrees (0 right, 90 up), "fixed" true to pin; box: "w" size m, mass, speed, dir; ramp: starts at x,y, "len" m, "angle" degrees (negative slopes down to the right); wall: at x from the ground up, "len" height m; spring: anchored at x,y, "to" the id of a ball/box, "k" N/m, "rest" m; target: "r" m; label: "text"}],
   "sliders": [{"obj": an object id or "world", "prop": speed|dir|mass|r|w|x|y|angle|len|k|rest (world: gravity|air|bounce|friction), "min", "max"}] (1-4 helpful ones),
   "graphs": [{"obj": a ball/box id, "prop": y|x|speed|vy|vx|ke|pe}] (0-2),
   "goal": {"obj": ball id, "target": target id} (optional)}
  Keep it under 15 objects and inside the width.`}
Reply with JSON only: {"type": one type above, "values": {setting: number or word}, "title": a short friendly title (max 40 characters), "explain": one or two short sentences telling the student what to try (move which slider, what to watch for)}.
Use the numbers from the student's request. Leave out settings you don't need. If nothing fits, pick the closest one and say in "explain" what it shows instead. Never use bad language; keep it school-friendly.${extra ? "\n" + extra : ""}`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-6-luna", messages: [{ role: "system", content: system }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_completion_tokens: 4000 }),
      signal: AbortSignal.timeout(40000),
    });
    if (!r.ok) throw new Error("model " + r.status);
    const out = JSON.parse((await r.json()).choices?.[0]?.message?.content || "{}");
    const type = String(out.type || "").toLowerCase();
    const clean = s => String(s || "").replace(/[<>]/g, "").slice(0, 240);
    const stepsOf = o => wantSteps && Array.isArray(o.steps) ? { steps: o.steps.slice(0, 6).map(x => clean(x).slice(0, 200)).filter(Boolean) } : {};
    // A custom scene (Plus and Mega): plain data the Lab checks again field by field (simbuilder.js clean()).
    if (type === "custom" && tier !== "free" && out.scene && typeof out.scene === "object") {
      const json = JSON.stringify(out.scene);
      if (json.length > 12000) throw new Error("scene too big");
      const scene = JSON.parse(json.replace(/[<>]/g, ""));
      scene.title = clean(out.title).slice(0, 40);
      return res.status(200).json({ sim: { type: "custom", scene, title: scene.title, explain: clean(out.explain), ...stepsOf(out) }, ...(charge.kind === "free" ? { creditsLeft: charge.remaining } : {}) });
    }
    if (!allowed.some(s => s[0] === type)) throw new Error("bad type");
    const valuesOf = obj => {
      const values = {};
      for (const [k, v] of Object.entries(obj && typeof obj === "object" ? obj : {}).slice(0, 20)) {
        if (!/^[a-z0-9_]{1,12}$/i.test(k)) continue;
        if ((k === "eq" || k === "eq2") && typeof v === "string") { if (/^[a-z0-9\s.+\-*\/^()=,]{1,120}$/i.test(v)) values[k] = v; continue; }
        if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
        else if (typeof v === "boolean") values[k] = v ? 1 : 0;
        else if (typeof v === "string" && /^[a-z0-9.\-]{1,16}$/i.test(v)) values[k] = v.toLowerCase();
      }
      return values;
    };
    const values = valuesOf(out.values), compare = wantCompare && out.compare ? valuesOf(out.compare) : null;
    return res.status(200).json({
      sim: { type, values, title: clean(out.title).slice(0, 40), explain: clean(out.explain), ...stepsOf(out),
        ...(compare && Object.keys(compare).length ? { compare, compareLabel: clean(out.compareLabel).slice(0, 40) || "the second setup" } : {}) },
      ...(charge.kind === "free" ? { creditsLeft: charge.remaining } : {}),
    });
  } catch (e) {
    console.error("sim-build:", e.message);
    await refund();
    return res.status(502).json({ error: "Knox couldn't build that one. Try saying it another way." });
  }
}
export { FREE_TYPES };
