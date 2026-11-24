import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIM_CATALOG } from '../api/_sim-build.js';

const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('Simulation Lab: the server catalog and the Lab have the same simulations and the same free starter set', () => {
  const lab = src('simlab.js');
  const ids = [...lab.matchAll(/^    ([a-z]+): \{\n      group:/gm)].map(m => m[1]);
  assert.equal(ids.length, 15);
  assert.deepEqual([...ids].sort(), SIM_CATALOG.map(s => s[0]).sort());
  const freeLab = ids.filter(id => new RegExp(`^    ${id}: \\{\\n      group: '[A-Za-z]+', icon: '[a-zA-Z]+', free: true`, 'm').test(lab)).sort();
  assert.deepEqual(freeLab, SIM_CATALOG.filter(s => s[1]).map(s => s[0]).sort());
  assert.deepEqual(freeLab, ['fraction', 'interest', 'line', 'parabola', 'probability', 'projectile']);
});

test('Simulation Lab: plans like Flashcards, and Knox builds through /api/me', () => {
  const lab = src('simlab.js'), build = src('api/_sim-build.js'), me = src('api/me.js');
  assert.match(lab, /const SAVE_MAX = \{ free: 3, plus: 25, mega: Infinity \};/);
  assert.match(build, /const BUILD_COST = 2;/);
  assert.match(build, /const PER_DAY = \{ plus: 20, mega: 100 \};/);
  assert.match(build, /never write code/);
  assert.match(me, /route === "sim-build"\) return simBuild\(req, res, \{ db, auth: adminAuth \}\)/);
  assert.match(lab, /fetch\('\/api\/me\?route=sim-build'/);
  assert.match(src('notes.js'), /window\.knoxSimLab\.show\(simsView\)/);
  assert.match(src('app.html'), /<script src="\/simlab\.js" defer><\/script>/);
});

test('Wallpaper stickers: extra background layers behind the content, per background, with plan limits', () => {
  const bg = src('mode-bg.js'), css = src('mode-bg.css');
  assert.match(bg, /const STICKER_MAX = \{ free: 3, plus: 6, mega: 12 \};/);
  assert.match(css, /background:var\(--mb-stk, none\), var\(--mb-paint\), var\(--mb-bg\) !important;/);
  assert.match(bg, /window\.knoxFlameFest\?\.styles\?\.\(\)/);
  assert.match(src('flamefest.js'), /styles: \(\) => \(state && state\.flameStyles\) \|\| \['classic'\]/);
});
