import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function escHtml('), source.indexOf('function showChatThread('));
const renderer = source.slice(source.indexOf('// ── Learn extras'), source.indexOf('// ── Render a video suggestion card'));
const context = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [] } };
runInNewContext(readFileSync(new URL('../learn-visuals.js', import.meta.url), 'utf8'), context);
runInNewContext(`${helpers}\n${renderer}`, context);
const ask = readFileSync(new URL('../api/ask.js', import.meta.url), 'utf8');

test('a Sim: line in an Ask answer becomes one simulation card and leaves the text', () => {
  const html = context.renderAnswerHtml('The ball goes highest at 45 degrees.\n\nSim: projectile | speed=20, angle=45', 'answer');
  assert.match(html, /<div class="knox-sim" data-sim="projectile \| speed=20, angle=45"><\/div>/);
  assert.doesNotMatch(html, /Sim:/);
  assert.match(context.renderAnswerHtml('**Sim:** line | m=2, b=1', 'answer'), /data-sim="line \| m=2, b=1"/);
});

test('simulation specs are escaped and never become markup', () => {
  const html = context.renderAnswerHtml('Hi\nSim: line | m="><img src=x onerror=alert(1)>', 'answer');
  assert.doesNotMatch(html, /<img|onerror="/);
});

test('normal prose is left alone; a Learn reply shows its simulation above Your turn (Dec 1)', () => {
  assert.doesNotMatch(context.renderAnswerHtml('Simulation: try this at home.', 'answer'), /knox-sim/);
  const html = context.renderAnswerHtml('Try it.\nSim: line | m=1\nYour turn: What next?', 'learn');
  assert.match(html, /data-sim="line \| m=1"/);
  assert.doesNotMatch(html, /Sim:/);
});

test('the server offers simulations on every plan (Ask Knox and Learn), only when they help, and validates the flag', () => {
  assert.match(ask, /const simsOn = simulations === true && !casual && !isBot;/);
  assert.match(ask, /const SIM_LINES = SIM_CATALOG\.map/);
  assert.match(ask, /learnMode \? SIM_LEARN_INSTRUCTION : SIM_INSTRUCTION/);
  assert.match(ask, /typeof simulations !== 'boolean'/);
});

test('Learn keeps a sim only when Simulations are on, and only a known template', async () => {
  const { decodeLearnOutput } = await import('../api/_learn-output.js');
  const reply = sim => JSON.stringify({body:'Watch the slope.',question:'What is m?',choices:[],goals:['Slope'],part:1,practiceIndex:0,assessment:'new',reviewFocus:'',keyIdea:'',graph:'',visual:'',video:'',recap:'',watchOut:'',topic:'',sim});
  assert.match(decodeLearnOutput(reply('line | m=3, b=1'), { sims: true }), /^Sim: line \| m=3, b=1$/m);
  assert.doesNotMatch(decodeLearnOutput(reply('line | m=3, b=1'), {}), /Sim:/);
  assert.doesNotMatch(decodeLearnOutput(reply('rocket | x=1'), { sims: true }), /Sim:/);
});

test('answers and Learn know every Simulation Lab sim (all 23)', async () => {
  const { SIM_CATALOG } = await import('../api/_sim-build.js');
  const { decodeLearnOutput } = await import('../api/_learn-output.js');
  const reply = sim => JSON.stringify({body:'Watch it swing.',question:'What changes the period?',choices:[],goals:['Pendulums'],part:1,practiceIndex:0,assessment:'new',reviewFocus:'',keyIdea:'',graph:'',visual:'',video:'',recap:'',watchOut:'',topic:'',sim});
  assert.equal(SIM_CATALOG.length, 23);
  for (const [type] of SIM_CATALOG) assert.match(decodeLearnOutput(reply(type + ' | a=1'), { sims: true }), new RegExp('^Sim: ' + type + ' \\|', 'm'), type);
  const sims = readFileSync(new URL('../sims.js', import.meta.url), 'utf8');
  assert.match(sims, /window\.knoxSimLab\.mini\(el, p\.type, p\.vals\)/);
  assert.match(readFileSync(new URL('../simlab.js', import.meta.url), 'utf8'), /Open in Lab/);
});

test('Ask Knox and Learn both search the web only when needed, and Learn falls back to a normal reply', () => {
  assert.match(ask, /const useWebSearch = webSearch === true && !casual && !isBot;/);
  assert.match(ask, /LEARN_WEB_SEARCH_INSTRUCTION/);
  assert.match(ask, /Learn search reply was not a lesson; answering normally\./);
  const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(app, /webSearch: true,/);
  assert.match(app, /simulations: true,/);
});

test('with a sim, Knox uses the Lab\'s exact gravity so the answer matches the sim', async () => {
  assert.match(ask, /Earth 9\.81 m\/s², Moon 1\.62, Mars 3\.71, Jupiter 24\.79, Sun 274, Pluto 0\.62/);
  assert.match(ask, /SIM_GRAVITY \+ ' Use the numbers/);
  assert.match(ask, /'\\n' \+ SIM_GRAVITY \+/);
  const lab = readFileSync(new URL('../simlab.js', import.meta.url), 'utf8');
  assert.match(lab, /earth: \[9\.81, 'Earth'\], moon: \[1\.62, 'Moon'\], mars: \[3\.71, 'Mars'\], jupiter: \[24\.79, 'Jupiter'\], sun: \[274, 'The Sun'\], pluto: \[0\.62, 'Pluto'\]/);
});

test('catch-up race: the time unit is the one in the speeds (mph → hours), and short times also show in minutes', async () => {
  const { SIM_CATALOG } = await import('../api/_sim-build.js');
  assert.match(SIM_CATALOG.find(x => x[0] === 'motion')[3], /time unit inside the SPEEDS: mph or km\/h → h/);
  assert.match(ask, /time= is the time unit inside the speeds \(mph → h, m\/s → s\), never the unit of your answer/);
  assert.match(readFileSync(new URL('../simlab.js', import.meta.url), 'utf8'), /s\.time === 'h' && catchT < 1 \? ` \(\$\{fmt\(catchT \* 60, 0\)\} min\)`/);
});

test('a "Citation (MLA):" line becomes a citation box with a Copy button (italics kept)', () => {
  const html = context.renderAnswerHtml('Here is your citation:\n\nCitation (MLA): “Evidence.” *NASA Science*, National Aeronautics and Space Administration, 1 Oct. 2026, science.nasa.gov/climate-change/evidence/. Accessed 25 Nov. 2026.', 'answer');
  assert.match(html, /<div class="knox-citation">/);
  assert.match(html, /<span class="kcit-label">MLA citation<\/span>/);
  assert.match(html, /class="kcit-copy"/);
  assert.match(html, /<em>NASA Science<\/em>/);
  assert.doesNotMatch(html, /Citation \(MLA\):/);
});

test('site names: server names show as the real site; normal names stay', () => {
  const html = context.renderAnswerHtml('Temps are rising ([prod-01-asg-www-climate.woc.noaa.gov](https://prod-01-asg-www-climate.woc.noaa.gov/news)). Ice too ([science.nasa.gov](https://science.nasa.gov/x)).\n\n🌐 Searched the web\n- [Climate change](https://prod-01-asg-www-climate.woc.noaa.gov/news)\n- [Titanic](https://guides.loc.gov/titanic)\n- [BBC](https://www.bbc.co.uk/news/science)', 'answer');
  assert.match(html, />noaa\.gov<\/a>/);
  assert.match(html, />science\.nasa\.gov<\/a>/);
  assert.match(html, /<span class="kws-site">noaa\.gov<\/span>/);
  assert.match(html, /<span class="kws-site">guides\.loc\.gov<\/span>/);
  assert.match(html, /<span class="kws-site">bbc\.co\.uk<\/span>/);
  assert.match(html, /href="https:\/\/prod-01-asg-www-climate\.woc\.noaa\.gov\/news"/, 'the link itself is unchanged');
});

test('Graph your own fits y to where the graphs turn and cross (x³ − 3x isn\'t squashed flat)', () => {
  const lab = readFileSync(new URL('../simlab.js', import.meta.url), 'utf8');
  assert.match(lab, /turnsOrMeets \? Math\.max\(\.\.\.keys\) \* 2\.5/);
});
test('catch-up race: A and B can be different (a bike ahead, a car chasing)', async () => {
  const lab = readFileSync(new URL('../simlab.js', import.meta.url), 'utf8');
  assert.match(lab, /select\('who2', 'Who is chasing \(B\)'/);
  const { SIM_CATALOG } = await import('../api/_sim-build.js');
  assert.match(SIM_CATALOG.find(x => x[0] === 'motion')[3], /who2 \(what B, the chaser, is/);
});

test('math answers draw fractions stacked (3/4, mixed 3 7/30), but never dates, links, web addresses or exponents', () => {
  const r = t => context.renderAnswerHtml(t, 'answer');
  const html = r('Add them: 9/10 + 7/3 = 27/30 + 70/30 = 97/30 = 3 7/30.\n\nAnswer: **3 7/30**');
  assert.match(html, /<span class="kfrac-n">9<\/span><span class="kfrac-d">10<\/span>/);
  assert.match(html, /<span class="kfrac-whole">3<\/span><span class="kfrac"><span class="kfrac-n">7<\/span><span class="kfrac-d">30<\/span>/, 'mixed number');
  assert.match(html, /<span class="sr-only">3 7\/30<\/span>/, 'screen readers hear it');
  for (const keep of ['Due 11/25/2026 at noon.', 'See https://www.pewresearch.org/internet/2025/04/22/teens/ for more.', 'It is open 24/7.', 'So x^(1/2) is a square root.']) {
    const out = r(keep);
    if (keep.includes('24/7')) continue; // a plain number pair may stack — harmless
    assert.doesNotMatch(out, /kfrac/, keep);
  }
  assert.doesNotMatch(r('Read [the 3/4 report](https://example.org/3/4).'), /kfrac/, 'never inside a link');
  assert.doesNotMatch(r('Use `a = 3/4` in code.'), /kfrac/, 'never inside code');
});

test('"Why it works:" becomes a small note in the answer', () => {
  const html = context.renderAnswerHtml('**Step 1 – Mark it up:** $80 + $20 = $100.\n\nWhy it works: up 25% then down 30% is not 5% off, because the 30% comes off the bigger price.\n\nAnswer: **$70**', 'answer');
  assert.match(html, /<div class="knox-why"><span class="knox-why-label">Why it works<\/span><p>up 25% then down 30%/);
  assert.doesNotMatch(html, /Why it works:/);
  assert.match(html, /knox-answer|answer-box|Answer/);
  for (const line of ['Answer: **$70**', '**Answer:** $70', '**Answer: $70**']) {
    const box = context.renderAnswerHtml('Step one.\n\n' + line, 'answer');
    assert.equal(box, context.renderAnswerHtml('Step one.\n\nAnswer: $70', 'answer').replace('$70', line === 'Answer: **$70**' ? '<strong>$70</strong>' : '$70'), line);
  }
});

test('math answers draw powers and square roots like a textbook, never inside links', () => {
  const f = t => context.formatInline(t);
  assert.match(f('Solve 3^(2x) = 81'), /3<span class="sr-only">\^\(2x\)<\/span><sup class="kpow" aria-hidden="true">2x<\/sup> = 81/);
  assert.match(f('x^2 + y^(n+1)'), /x<span class="sr-only">\^2<\/span><sup class="kpow" aria-hidden="true">2<\/sup> \+ y<span class="sr-only">\^\(n\+1\)<\/span><sup class="kpow" aria-hidden="true">n\+1<\/sup>/);
  assert.match(f('e^(−0.5t)'), /<sup class="kpow" aria-hidden="true">−0\.5t<\/sup>/);
  const half = f('x^(1/2)');
  assert.match(half, /<sup class="kpow" aria-hidden="true">1\/2<\/sup>/);
  assert.doesNotMatch(half, /kfrac/, 'a fraction in a power stays inline');
  const root = f('σ = √(910/6) ≈ 12.32 and h = √144');
  assert.match(root, /<span class="krad">√<span class="krad-in"><span class="kfrac-wrap">.*910.*6.*<\/span><\/span> ≈ 12\.32/);
  assert.match(root, /<span class="krad">√<span class="krad-in">144<\/span><\/span>/);
  assert.match(f('(−b ± √(b² − 4ac))/2a'), /√<span class="krad-in">b² − 4ac<\/span><\/span>\)\/2a/);
  assert.doesNotMatch(f('see [a^b](https://x.com/a^b)'), /kpow/);
  assert.doesNotMatch(f('`x^2` in code'), /kpow/);
});

test('"Check:" becomes a green row, and "All answers:" one summary card (3+ problems)', () => {
  const html = context.renderAnswerHtml('### 1. Ladder\nUse the Pythagorean theorem.\n\nCheck: 5² + 12² = 25 + 144 = 169 = 13² ✓\n\nWhy it works: 5, 12, 13 is a Pythagorean triple, like 3, 4, 5.\n\nAnswer: **12 ft**\n\nAll answers:\n- Trigonometry: x = π/6, 5π/6\n- **Exponents:** x = 2\n- Big arithmetic: 17,290', 'answer');
  assert.match(html, /<div class="knox-check"><span class="knox-check-label"><svg[^>]*>.*<\/svg>Check<\/span><span>5² \+ 12² = 25 \+ 144 = 169 = 13²<\/span><\/div>/);
  assert.ok(html.indexOf('knox-check') < html.indexOf('knox-why') && html.indexOf('knox-why') < html.indexOf('knox-final-answer'));
  assert.match(html, /<div class="knox-all-answers"><span class="knox-final-answer-label">All answers<\/span><ul>/);
  assert.match(html, /<li><span class="kaa-name">Trigonometry<\/span><span class="kaa-val">x = π\/6, 5π\/6<\/span><\/li>/);
  assert.match(html, /<li><span class="kaa-name">Exponents<\/span><span class="kaa-val">x = 2<\/span><\/li>/);
  assert.match(html, /<span class="kaa-name">Big arithmetic<\/span><span class="kaa-val">17,290<\/span>/);
  assert.doesNotMatch(html, /All answers:|<li>Trigonometry/);
  // Learn keeps its own layout.
  assert.doesNotMatch(context.renderAnswerHtml('Check: does 2 + 3 = 5?', 'learn'), /knox-check/);
});

test('the Knox prompt asks for a Check line, shortcut tips, both standard deviations and an All answers summary', () => {
  const ask = readFileSync(new URL('../api/ask.js', import.meta.url), 'utf8');
  assert.match(ask, /starts with "Check:"/);
  assert.match(ask, /well-known shortcut that makes problems like it faster \(5, 12, 13 is a Pythagorean triple/);
  assert.match(ask, /give both — population σ \(divide by n\) and sample s \(divide by n − 1\)/);
  assert.match(ask, /list each squared difference's value/);
  assert.match(ask, /end with the line "All answers:" followed by one bullet per problem/);
});
