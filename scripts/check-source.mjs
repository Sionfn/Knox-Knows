import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

function walk(dir = '.') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git', '.vercel'].includes(entry.name) || entry.isSymbolicLink()) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = walk();
let checked = 0;
for (const file of files) {
  const extension = extname(file);
  if (extension === '.json') {
    JSON.parse(readFileSync(file, 'utf8'));
    checked++;
  } else if (extension === '.js' || extension === '.mjs') {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
    checked++;
  } else if (extension === '.html') {
    const source = readFileSync(file, 'utf8');
    const scripts = source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
    for (const [, attributes, body] of scripts) {
      if (/\bsrc\s*=/.test(attributes) || !body.trim()) continue;
      if (/type=["']application\/ld\+json["']/.test(attributes)) {
        JSON.parse(body);
      } else {
        const type = /type=["']module["']/.test(attributes) ? 'module' : 'commonjs';
        const result = spawnSync(process.execPath, ['--check', `--input-type=${type}`], { input: body, encoding: 'utf8' });
        if (result.status !== 0) throw new Error(`${file} inline script: ${result.stderr}`);
      }
      checked++;
    }
  }
}
console.log(`Parsed ${checked} source and inline-script files across ${files.length} tracked/private files.`);
