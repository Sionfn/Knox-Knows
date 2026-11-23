import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADVENT_START, ADVENT_END } from '../api/_streak.js';

const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('Advent Calendar runs December 1–25 and study days unlock doors', () => {
  assert.equal(ADVENT_START, '2026-12-01');
  assert.equal(ADVENT_END, '2026-12-25');
  const streak = src('api/_streak.js');
  assert.match(streak, /update\.advent = \{ \.\.\.adv, days: \[\.\.\.days\]\.sort\(\) \}/);
  assert.match(streak, /savedDays\.filter\(inAdvent\)\.forEach/); // a Flame Shield keeps that day's door
});

test('opening a door is checked on the server: real door, its date, studied, not opened twice', () => {
  const s = src('api/flame-fest.js');
  assert.match(s, /body\.advent === "open"/);
  assert.match(s, /n < 1 \|\| n > 25/);
  assert.match(s, /day > addDays\(now, 1\)/);
  assert.match(s, /if \(door\.opened\) return/);
  assert.match(s, /if \(!door\.studied\) return/);
  assert.match(s, /"frost", "ruby"/);
});

test('the calendar has a treat for every door and the new flames have looks', () => {
  const a = src('advent.js');
  const treats = a.slice(a.indexOf('const TREATS = ['), a.indexOf('];', a.indexOf('const TREATS = [')));
  assert.equal((treats.match(/^    '/gm) || []).length, 25);
  const css = src('flamefest.css');
  assert.match(css, /\.flame-frost \{ filter:/);
  assert.match(css, /\.flame-ruby \{ filter:/);
});

test('blind bags: earned behind every Advent door and every 10 questions (3 a day), opened and traded on the server', () => {
  const ff = src('api/flame-fest.js'), streak = src('api/_streak.js'), ask = src('api/ask.js');
  assert.match(ff, /return \{ gives: \{ \.\.\.base\.gives, bag: 1 \}/);
  assert.match(ff, /\["open", "trade", "claim"\]\.includes\(body\.bags\)/);
  assert.match(ff, /if \(st\.dupes < 3\) return/);
  assert.match(streak, /const BAG_EVERY = 10, BAGS_PER_DAY = 3;/);
  assert.match(ask, /await countQuestionForBags\(db, uid, localDay\)/);
  const bags = src('bags.js');
  for (const id of ['elf', 'snowman', 'reindeer', 'gingerbread', 'cocoa', 'sweater', 'skater', 'caroler', 'snowball', 'santa', 'nutcracker', 'golden']) assert.match(bags, new RegExp(`\\b${id}: \\(\\) => S\\(`));
});

test('blind bags: the published odds are the real odds (Golden Knox 1 in 100), and the bags screen shows them', () => {
  const ff = src('api/flame-fest.js');
  const start = ff.indexOf('function pickFigure');
  const code = ff.slice(ff.indexOf('const BAG_SERIES'), ff.indexOf('function bagStatus')) + ff.slice(start, ff.indexOf('\n}\n', start) + 2);
  const { pickFigure, RARITY_ODDS } = new Function(code + '; return { pickFigure, RARITY_ODDS };')();
  assert.deepEqual(RARITY_ODDS, { common: 64, rare: 25, epic: 10, secret: 1 });
  const seq = vals => { let i = 0; return () => vals[i++]; };
  assert.equal(pickFigure({}, seq([.995, 0])).id, 'golden'); // the top 1%
  assert.equal(pickFigure({}, seq([.985, 0])).rarity, 'epic');
  assert.equal(pickFigure({}, seq([.70, 0])).rarity, 'rare');
  assert.equal(pickFigure({}, seq([.10, .99])).rarity, 'common');
  assert.equal(pickFigure({ santa: 1 }, seq([.95, 0])).id, 'nutcracker'); // missing ones before duplicates
  assert.equal(pickFigure({ golden: 1 }, seq([.995, .5])).id, 'golden'); // the only secret
  let golden = 0; const N = 200000;
  for (let i = 0; i < N; i++) if (pickFigure({}).id === 'golden') golden++;
  assert.ok(golden / N > .007 && golden / N < .013, `golden rate ${golden / N}`);
  const bags = src('bags.js');
  assert.match(bags, /const ODDS = \{ common: 64, rare: 25, epic: 10, secret: 1 \};/);
  assert.match(bags, /'1 in 100'/);
  assert.match(bags, /\$\{oddsHtml\(\)\}/);
});
