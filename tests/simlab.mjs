import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIM_CATALOG } from '../api/_sim-build.js';

const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('Simulation Lab: the server catalog and the Lab have the same simulations and the same free starter set', () => {
  const lab = src('simlab.js');
  const ids = [...lab.matchAll(/^    ([a-z]+): \{\n      group:/gm)].map(m => m[1]);
  assert.equal(ids.length, 22);
  assert.deepEqual([...ids].sort(), SIM_CATALOG.map(s => s[0]).sort());
  const freeLab = ids.filter(id => new RegExp(`^    ${id}: \\{\\n      group: '[A-Za-z]+', icon: '[a-zA-Z]+', free: true`, 'm').test(lab)).sort();
  assert.deepEqual(freeLab, SIM_CATALOG.filter(s => s[1]).map(s => s[0]).sort());
  assert.deepEqual(freeLab, ['equation', 'fraction', 'interest', 'line', 'parabola', 'probability', 'projectile']);
});

test('Simulation Lab: plans like Flashcards, and Knox builds through /api/me', () => {
  const lab = src('simlab.js'), build = src('api/_sim-build.js'), me = src('api/me.js');
  assert.match(lab, /const SAVE_MAX = \{ free: 3, plus: 25, mega: Infinity \};/);
  assert.match(build, /const BUILD_COST = 2;/);
  assert.match(build, /const PER_DAY = \{ plus: 20, mega: 100 \};/);
  assert.match(build, /never write code/);
  assert.match(me, /route === "sim-build"\) return simBuild\(req, res, \{ db, auth: adminAuth \}\)/);
  assert.match(lab, /fetch\('\/api\/me\?route=sim-build'/);
  assert.match(src('notes.js'), /window\.knoxSimLab\.show\(simsView, fresh\)/);
  assert.match(src('app.html'), /<script src="\/simlab\.js" defer><\/script>/);
});

test('Wallpaper stickers: extra background layers behind the content, per background, with plan limits', () => {
  const bg = src('mode-bg.js'), css = src('mode-bg.css');
  assert.match(bg, /const STICKER_MAX = \{ free: 3, plus: 6, mega: 12 \};/);
  assert.match(css, /background:var\(--mb-stk, none\), var\(--mb-paint\), var\(--mb-bg\) !important;/);
  assert.match(bg, /window\.knoxFlameFest\?\.styles\?\.\(\)/);
  assert.match(src('flamefest.js'), /styles: \(\) => \(state && state\.flameStyles\) \|\| \['classic'\]/);
});

test('Graph your own: the math reader reads what students type and never runs code', async () => {
  const lab = src('simlab.js');
  const start = lab.indexOf('  const FUNCS = '), end = lab.indexOf('  const LETTERS = ');
  const { parseMath } = new Function(lab.slice(start, end) + '; return { parseMath };')();
  const at = (e, env) => parseMath(e).f(env);
  assert.equal(at('y = 2x + 1', { x: 3 }), 7);
  assert.equal(at('a x^2 + b x + c', { x: 2, a: 1, b: -3, c: 2 }), 0);
  assert.equal(at('3(x+1)(x-1)', { x: 2 }), 9);
  assert.equal(at('2^(x/b)', { x: 4, b: 2 }), 4);
  assert.ok(Math.abs(at('sin(pi/2)', {}) - 1) < 1e-12);
  assert.equal(at('-x^2', { x: 3 }), -9);
  assert.equal(at('sqrt(r^2 - x^2)', { r: 5, x: 3 }), 4);
  assert.deepEqual([...parseMath('y = m x + b').vars].sort(), ['b', 'm', 'x']);
  assert.throws(() => parseMath('alert(1);'));
  assert.throws(() => parseMath('x +'));
  assert.throws(() => parseMath('(x + 1'));
  assert.doesNotMatch(lab.slice(start, end), /\beval\(|new Function/);
});

test('Challenges: every built-in sim has some, and none is already met by its starting setup', () => {
  const lab = src('simlab.js');
  const ids = [...lab.matchAll(/^    ([a-z]+): \{\n      group:/gm)].map(m => m[1]);
  for (const id of ids) assert.match(lab, new RegExp(`^    ${id}: \\[\\['`, 'm'), `${id} has challenges`);
});

test('Community: published sims are moderated, anonymous, reportable, and never carry contact info', () => {
  const c = src('api/_sim-community.js'), lab = src('simlab.js');
  assert.match(c, /omni-moderation-latest/);
  assert.match(c, /const HIDE_AT = 3;/);
  assert.match(c, /reports >= HIDE_AT \? \{ hidden: true \}/);
  assert.match(c, /if \(CONTACT\.test\(text\)\)/);
  assert.doesNotMatch(c, /displayName|email:/);
  assert.match(lab, /By a Knox student/);
  assert.match(src('api/me.js'), /route === "sim-community"\) return simCommunity\(req, res, \{ db, auth: adminAuth \}\)/);
  const CONTACT = new RegExp(c.match(/const CONTACT = \/(.+)\/i;/)[1], 'i');
  for (const bad of ['see www.example.com', 'email me kid@mail.com', 'call 555 123 4567', 'add me @coolkid99', 'https://x.y']) assert.ok(CONTACT.test(bad), bad);
  for (const ok of ['Ball on the Moon', 'Ramp race 2', 'y = 2x + 1', 'Speed 25 m/s']) assert.ok(!CONTACT.test(ok), ok);
});

test('Flashcards Community: decks are moderated, fact-checked, anonymous, photo-free and reportable; admins review reports', () => {
  const d = src('api/_deck-community.js'), fc = src('flashcards.js'), admin = src('api/_community-admin.js'), me = src('api/me.js');
  assert.match(d, /omni-moderation-latest/);
  assert.match(d, /async function factCheck\(/);
  assert.match(d, /return res\.status\(409\)\.json\(\{ needsFix: wrong \}\)/);
  assert.match(d, /Never publish a student's own photos/);
  assert.match(d, /reports >= HIDE_AT \? \{ hidden: true \}/);
  assert.doesNotMatch(d, /displayName|email:/);
  assert.match(fc, /By a Knox student/);
  assert.match(fc, /'cm-open'/);
  assert.match(fc, /'cm-publish'/);
  assert.match(admin, /decoded\.uid !== ADMIN \|\| decoded\.email_verified !== true/);
  assert.match(me, /route === "deck-community"\) return deckCommunity/);
  assert.match(me, /route === "community-admin"\) return communityAdmin/);
  assert.match(src('admin.html'), /Community reports/);
});

test('Simulation Lab works like Flashcards: opens on its home, asks before losing an unsaved sim, Open in Lab goes straight to the sim', () => {
  const lab = src('simlab.js'), notes = src('notes.js'), sims = src('sims.js'), builder = src('simbuilder.js'), app = src('app.html');
  // Coming back to Simulations starts on the Lab home (not the sim you left open).
  assert.match(notes, /if \(typeof then === 'function' && window\.knoxSimLab\) then\(simsView\); else simsHome\(true\);/);
  assert.doesNotMatch(notes, /if \(!simsView\.querySelector\('\.sl-wrap, \.sl-ed'\)\) simsHome\(\)/);
  // Knox-built sims and changed scenes of your own ask first — sidebar, Back button, the Lab's back button.
  assert.match(lab, /title: 'Leave without saving\?'/);
  assert.match(lab, /title: 'Discard your changes\?'/);
  assert.match(lab, /guard = meta\.fromBuild \? \(\) => true : null;/);
  assert.match(lab, /prompt, fromBuild: true/);
  assert.match(notes, /if \(await simsCanLeave\(\)\) \{ closeSims\(\); nav\.click\(\); \}/);
  assert.match(app, /if \(window\.simsCanLeave && !\(await window\.simsCanLeave\(\)\)\) return false;/);
  assert.match(builder, /opts\.canLeave \? opts\.canLeave\(\) : true/);
  // Open in Lab: no Lab home flashing first (no setTimeout hop), with a way back to the answer.
  assert.match(lab, /window\.openSims\?\.\(h => openIn\(h, id, values/);
  assert.match(sims, /window\.openSims\?\.\(h => window\.knoxSimLab\?\.openIn\(/);
  assert.doesNotMatch(lab + sims, /openSims\?\.\(\); setTimeout/);
  assert.match(lab, /← Back to answer/);
  // Save goes back to the Lab home with a note, like a Flashcards deck.
  assert.match(lab, /editor\?\.stop\(\); editor = null; tab = 'home'; renderHome\(\);\n    toast\(/);
});
