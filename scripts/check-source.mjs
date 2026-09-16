import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
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
