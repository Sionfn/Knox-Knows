// knox-sound.js — Knox's sound effects on the web, like the iPhone app's
// (You → Sound effects). Off until switched on in Account & Plan → Sound
// effects; saved on this device (localStorage knoxSounds = '1').
//
// The same clips the app plays (sounds/knox-*.m4a, made from the app's
// scripts/make-sounds.swift: marimba and celesta bells in C major):
//   flame (today's flame lights) · goal · deck (flashcards session done) ·
//   lesson (Learn lesson finished) · reward (Advent door, Flame Fest prize) ·
//   plan (a new plan unlocked) · flip (a flashcard flips)
// plus synth effects for the blind bags (crinkle, rip, the rising chime while
// the light changes color, the boom and the fanfare).
//
//   knoxSound.on()          — is it switched on?
//   knoxSound.set(on)       — switch it (plays a little "goal" when turned on)
//   knoxSound.play(name)    — a clip; does nothing while off
//   knoxSound.fx.rip() …    — the blind bag synth effects; nothing while off
//   knoxSound.unlock()      — call from a click so the browser lets it play
(function () {
  const KEY = 'knoxSounds';
  const CLIPS = ['flame', 'goal', 'deck', 'lesson', 'reward', 'plan', 'flip'];
  let ctx = null, master = null, lastCelebration = 0;
  const buffers = {}, loading = {};

  const on = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };
  function audio() {
    if (!on()) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch (_) { return null; }
  }
  function load(name) {
    if (buffers[name] || loading[name] || !audio()) return loading[name];
    return (loading[name] = fetch(`/sounds/knox-${name}.m4a`).then(r => r.arrayBuffer())
      .then(b => new Promise((ok, bad) => ctx.decodeAudioData(b, ok, bad)))
      .then(buf => { buffers[name] = buf; return buf; })
      .catch(() => { delete loading[name]; return null; }));
  }
  async function play(name) {
    const a = audio(); if (!a || !CLIPS.includes(name) || document.hidden) return;
    // Two celebrations at once (say, a flame and a goal): keep it to one.
    if (name !== 'flip') { if (Date.now() - lastCelebration < 900) return; lastCelebration = Date.now(); }
    const buf = buffers[name] || await load(name); if (!buf) return;
    const src = a.createBufferSource(), g = a.createGain();
    g.gain.value = name === 'flip' ? .9 : .85;
    src.buffer = buf; src.connect(g).connect(master); src.start();
  }
  function warmUp() { if (on()) CLIPS.forEach(load); }

  // ── Synth effects for the blind bags ──────────────────────────────────────
  // Bell: a sine with a soft overtone and a quick, ringing decay (celesta-ish).
  function bell(freq, at = 0, dur = .6, vol = .16) {
    const a = audio(); if (!a) return; const t = a.currentTime + at;
    [[1, 1], [2.01, .32], [3.02, .12]].forEach(([m, v]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq * m, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur / m);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
    });
  }
  // Filtered noise: foil crinkles and the rip.
  function noise(at, dur, f0, f1, vol, q = 1.1) {
    const a = audio(); if (!a) return; const t = a.currentTime + at;
    const n = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.value = vol; src.connect(f).connect(g).connect(master); src.start(t);
  }
  function thump(at = 0, vol = .5) {
    const a = audio(); if (!a) return; const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .35);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    o.connect(g).connect(master); o.start(t); o.stop(t + .55);
  }
  const C5 = 523.25, note = s => C5 * Math.pow(2, s / 12);
  const fx = {
    crinkle: () => noise(0, .045 + Math.random() * .03, 2600 + Math.random() * 2600, 1800, .14, 2.2),
    rip: () => { noise(0, .34, 5200, 900, .5, .8); noise(.05, .2, 2400, 600, .25, 1.5); },
    // The chime rises with each color: white → blue → purple → red → gold.
    step: n => { bell(note([0, 4, 7, 12, 16][n] || 0), 0, .7, .17); bell(note(([0, 4, 7, 12, 16][n] || 0) + 12), .04, .4, .05); },
    boom: () => { thump(0, .55); noise(0, .7, 7000, 1600, .16, .6); },
    fanfare: secret => {
      const seq = secret ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
      seq.forEach((s, i) => bell(note(s), i * .085, .9, .14));
      bell(note(seq[seq.length - 1] + 12), seq.length * .085 + .05, 1.3, .07);
    },
    stamp: () => { thump(0, .25); bell(note(19), .01, .25, .07); },
    whoosh: () => noise(0, .3, 600, 3200, .12, .7),
  };

  window.knoxSound = {
    on,
    set(v) {
      try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (_) {}
      if (v) { audio(); warmUp(); setTimeout(() => play('goal'), 60); }
    },
    play,
    fx,
    unlock() { if (audio()) warmUp(); },
  };
  // Browsers only start audio after a click or key press: wake it on the first one.
  const wake = () => { if (on()) { audio(); warmUp(); } removeEventListener('pointerdown', wake, true); removeEventListener('keydown', wake, true); };
  addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true);
})();
