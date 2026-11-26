import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
// The Lab's equation reader (simlab.js parseMath), and the grapher on top of it.
const lab = src('simlab.js');
const reader = lab.slice(lab.indexOf('  const FUNCS = {'), lab.indexOf('  const LETTERS ='));
const context = { window: {}, Math, Number, Object, Set, String, Array, JSON };
runInNewContext(`${reader}\nwindow.knoxSimLab = { parseMath };`, context);
runInNewContext(src('calc-graph.js'), context);
const G = context.window.KnoxGraph;
const plain = v => JSON.parse(JSON.stringify(v)); // arrays made in the sandbox → normal arrays
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

test('Graph mode reads equations like a student writes them', () => {
  const f = (t, x, env = {}) => { const c = G.compile(t); assert.ok(!c.error, t + ': ' + c?.error); return c.m.f({ x, ...env }); };
  assert.equal(f('y = 2x + 1', 3), 7);
  assert.equal(f('y = x² − 3', 2), 1);
  assert.equal(f('f(x) = √(x)', 9), 3);
  assert.equal(f('y = 2(x+1) sqrt(x)', 4), 20);
  assert.equal(f('y = a sin(bx)', Math.PI / 2, { a: 2, b: 1 }), 2, '"a sin(bx)" is a × sin(bx)');
  assert.ok(near(f('y = asin(x)', 1), Math.PI / 2), '"asin" is still arcsine');
  assert.deepEqual(plain([...G.compile('y = ax^2 + bx + c').vars].sort()), ['a', 'b', 'c', 'x']);
  assert.equal(G.compile('x = 3').kind, 'x');
  assert.match(G.compile('y = 3 = x').error, /one = sign/);
  assert.match(G.compile('y = 2x +').error, /missing/);
  assert.equal(G.compile('   '), null);
});

test('special points: intercepts, highs and lows, crossings — never an asymptote', () => {
  const pts = plain(G.specialPoints(x => x * x - 4, -10, 10).map(p => `${p.kind} (${p.x}, ${p.y})`));
  assert.deepEqual(pts, ['y-intercept · low point (0, -4)', 'x-intercept (-2, 0)', 'x-intercept (2, 0)']);
  const cross = G.specialPoints(x => 2 * x + 1, -10, 10, [{ kind: 'y', f: x => x * x - 3 }]).filter(p => p.kind === 'crossing');
  assert.equal(cross.length, 2);
  assert.ok(near(cross[0].x, 1 - Math.sqrt(5), 1e-5) && near(cross[1].x, 1 + Math.sqrt(5), 1e-5), 'crossings at 1 ± √5');
  const tan = G.specialPoints(Math.tan, -2, 2).filter(p => p.kind.includes('x-intercept'));
  assert.deepEqual(plain(tan.map(p => p.x)), [0], 'tan crosses at 0, not at its asymptotes ±π/2');
  assert.equal(G.specialPoints(x => 1 / x, -5, 5).filter(p => p.kind.includes('x-intercept')).length, 0);
  const vert = G.specialPoints(x => x * x, -5, 5, [{ kind: 'x', at: 3 }]).find(p => p.kind === 'crossing');
  assert.deepEqual([vert.x, vert.y], [3, 9]);
  const sinPts = G.specialPoints(Math.sin, 0, 7);
  assert.ok(sinPts.some(p => p.kind === 'high point' && near(p.x, Math.PI / 2, 1e-5) && p.y === 1));
});

test('the Calculator has a Graph mode, wired to Ask Knox, Learn and Learn graphs', () => {
  const calc = src('calc.js'), app = src('app.html'), css = src('calc.css');
  assert.match(calc, /<button type="button" class="kc-mode" data-mode="graph">Graph<\/button>/);
  assert.match(calc, /if \(st\.mode === 'graph'\) return; \/\/ the grapher has its own keys/);
  assert.match(calc, /window\.KnoxGraph\.mount\(box, \{ send: sendText \}\)/);
  assert.match(calc, /graph\(list\) \{ st\.mode = 'graph';/);
  assert.ok(app.indexOf('<script src="/calc-graph.js"></script>') < app.indexOf('<script src="/calc.js"></script>'), 'the grapher loads before the calculator');
  assert.match(app, /class="lg-open" data-graph="/);
  assert.match(app, /window\.KnoxCalc\.graph\(list\)/);
  assert.match(lab, /window\.knoxSimLab = \{[^}]*parseMath/);
  assert.match(css, /\.kc-wrap \.kc-screen\[hidden\]/);
  assert.match(css, /@media \(max-width: 820px\) \{\n  \.kg \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
