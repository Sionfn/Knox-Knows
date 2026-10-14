import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext, runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const extension = readFileSync(new URL('../extension-auth.html', import.meta.url), 'utf8');

test('chat scroll area reaches the main column edge while messages stay centered', () => {
  const rule = html.match(/#chatThread\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(rule, /overflow-y:\s*auto/);
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /padding:\s*24px max\(24px, calc\(\(100% - 900px\) \/ 2\)\) 12px/);
  assert.doesNotMatch(rule, /max-width|margin:\s*0 auto/);
});

test('first paint is covered until auth, plan, usage, history and streak resolve', () => {
  assert.match(html, /<body class="app-auth-pending">/);
  assert.match(html, /\.app-auth-pending #appShell\s*\{ visibility: hidden; \}/);
  assert.match(html, /<div id="appLoading" role="status" aria-live="polite">/);
  assert.match(html, /await updatePlanUI\(\)/);
  assert.match(html, /await Promise\.all\(\[\s*loadSidebarHistory\(\),\s*loadStreak\(user\.uid\)/);
  assert.match(html, /if \(loadVersion === authLoadVersion\)\s*\{[\s\S]*?window\.finishAppLoading\(\)/);
});

test('all inline app scripts parse', () => {
  for (const page of [html, landing, extension]) {
    const scripts = [...page.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    for (const [, source] of scripts) {
      new SourceTextModule(source, { context: createContext({}) });
    }
  }
});

test('landing and extension auth hide incomplete first paint, with a retry state', () => {
  assert.match(landing, /<body class="landing-loading">/);
  assert.match(landing, /<div id="landingLoading" role="status" aria-live="polite">/);
  assert.match(landing, /landingResolvedUid !== \(user\?\.uid \|\| null\)/);
  assert.match(landing, /if \(loadVersion === landingAuthVersion\)[\s\S]*?window\.finishLandingLoading\(\)/);
  assert.match(landing, /id="appFab" href="\/app"/);
  assert.match(extension, /<body class="extension-loading">/);
  assert.match(extension, /window\.finishExtensionLoading\(\)/);
});

test('entry routing opens the app and preserves logo visits and existing deep links', () => {
  const source = landing.match(/<script id="knox-entry-route">([\s\S]*?)<\/script>/)[1];
  const cases = [
    ['/', '/app'],
    ['/?utm_source=search', '/app?utm_source=search'],
    ['/index.html', '/app'],
    ['/about', null],
    ['/about#pricing', null],
    ['/?from=app', '/about?from=app'],
    ['/#pricing', '/about#pricing'],
    ['/?payment=success', '/about?payment=success'],
    ['/?payment=cancelled', '/about?payment=cancelled'],
    ['/?action=login', '/about?action=login'],
  ];
  for (const [path, expected] of cases) {
    const url = new URL(path, 'https://knox.example');
    let destination = null;
    runInNewContext(source, {
      URLSearchParams,
      location: { pathname: url.pathname, search: url.search, hash: url.hash, replace(value) { destination = value; } },
    });
    assert.equal(destination, expected, path);
  }
});
