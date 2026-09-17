import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
// Include new source files before they have been committed.
const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
let inlineCount = 0;
for (const file of [...new Set([...tracked, ...added])]) {
  if (/\.(?:js|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', join(root, file)]);
  if (!file.endsWith('.html')) continue;
  const html = readFileSync(join(root, file), 'utf8');
  for (const [block, attributes, source] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attributes) || !source.trim()) continue;
    if (/application\/ld\+json/.test(attributes)) { JSON.parse(source); continue; }
    const result = spawnSync(process.execPath, ['--input-type=' + (/type\s*=\s*["']module/.test(attributes) ? 'module' : 'commonjs'), '--check'], { input: source, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(file + ' inline script: ' + result.stderr);
    inlineCount++;
  }
}
console.log('Parsed ' + inlineCount + ' inline scripts and all tracked JavaScript.');
const apiDirectory = join(root, "api");
for (const file of readdirSync(apiDirectory).filter(file => file.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", join(apiDirectory, file)], { stdio: "inherit" });
}

JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

const rules = readFileSync(join(root, "firestore.rules"), "utf8");
if (!rules.includes("match /databases/{database}/documents")) throw new Error("Firestore rule entrypoint missing");
console.log("Source checks passed.");
