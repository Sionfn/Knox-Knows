import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('blind bags: the real Christmas scene in every look, the real pack on the counter, the tear starts where you press', () => {
  const js = src('bags3d.js'), css = src('bags3d.css');
  assert.match(js, /const root = document\.documentElement, xmas = true, night = root\.getAttribute\('data-theme'\) === 'dark';/);
  assert.match(css, /\.kb3-stage\.is-xmas \.xmas-deco \{ display: block;/);
  assert.match(css, /\.kb3-stage\.is-night \.xmas-night-sky \{ display: block;/);
  assert.match(js, /<img class="kb3-left-pack" src="\$\{packPic\}" alt="">/);
  assert.doesNotMatch(js, /KI\('bag'/, 'no bag icon on the counter');
  assert.match(js, /side = x > \(line\.x1 \+ line\.x2\) \/ 2 \? -1 : 1;/);
  assert.match(js, /stage\.classList\.toggle\('dir-left', side < 0\)/);
  assert.match(js, /peelStrip\(vf, dir \|\| side\)/);
});

test('badges never show a ? cursor; the landing keeps its colors in Dark; no snow over Pricing and FAQ small print; Family is 4 students', () => {
  const app = src('app.html'), landing = src('landing.css'), theme = src('theme.js'), index = src('index.html');
  assert.doesNotMatch(app, /\.kbadge[^}]*cursor: help/);
  assert.doesNotMatch(src('advent.css'), /cursor: help/);
  for (const [id, c] of [['#ask', '#FF6B00'], ['#learn', '#A560F2'], ['#flashcards', '#58CC02'], ['#streaks', '#FF4B4B']]) assert.match(landing, new RegExp(`html\\[data-theme="dark"\\] ${id}\\.kl-section \\{ background: color-mix\\(in srgb, ${c}`));
  assert.match(landing, /html\[data-theme="dark"\] #pricing\.kl-pricing \{ background: color-mix\(in srgb, #1CB0F6/);
  assert.match(theme, /section\.kl-section:not\(#home\):not\(\.kl-final\):not\(#pricing\):not\(#faq\)/);
  for (const html of [index, app]) assert.equal((html.match(/<svg class="kk-ic kk-family"[^]*?<\/svg>/)[0].match(/<circle /g) || []).length, 4, 'four students');
});

test('launch fixes from the Codex audit: Coming soon App Store, keyboard-safe sign-in, tour waits for the Advent Calendar, lazy videos with less motion, Learn input', () => {
  const landing = src('landing.js'), index = src('index.html'), app = src('app.html'), tour = src('tour.js');
  assert.match(landing, /var APP_STORE_URL = '';/);
  assert.match(index, /if \(e\.target\.closest\?\.\('button, a'\)\) return;/);
  for (const page of [index, app]) assert.match(page, /Keep Tab \/ Shift\+Tab inside the open sign-in dialog/);
  assert.match(tour, /\.adv-wrap, \.kb-wrap, \.kb3-stage/);
  assert.match(landing, /if \(reduced\) return; \/\/ less motion: the poster stays/);
  assert.match(app, /input\.placeholder = learn \? \(home \? 'What do you want to learn\?'/);
  assert.doesNotMatch(src('advent.js'), /Anywhere on Earth/);
});
