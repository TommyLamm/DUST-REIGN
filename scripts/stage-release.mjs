import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${manifest.version}`) {
  throw new Error('Tag and manifest version differ');
}
const output = path.join(root, 'output', 'release', manifest.version, 'game');
const staged = path.join(root, 'output', 'game');
const rootFiles = ['game.json', 'index.html', 'playroom-sdk.js', 'cover.png'];
const assetDirs = { src: '.js', css: '.css' };

function collectDir(dir, ext) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    const stat = fs.lstatSync(path.join(root, rel));
    if (stat.isDirectory()) found.push(...collectDir(rel, ext));
    else if (stat.isFile() && entry.name.endsWith(ext)) found.push(rel);
    else throw new Error(`Invalid asset: ${rel}`);
  }
  return found;
}

// A fresh allowlisted directory keeps repository metadata and secrets out of the ZIP.
const files = [...rootFiles];
for (const [dir, ext] of Object.entries(assetDirs)) files.push(...collectDir(dir, ext));
for (const name of rootFiles) {
  if (!fs.lstatSync(path.join(root, name)).isFile()) throw new Error(`Invalid asset: ${name}`);
}
const seen = new Set();
for (const name of files) {
  const key = name.toLowerCase();
  if (seen.has(key)) throw new Error(`Case-colliding asset: ${name}`);
  seen.add(key);
}
if (fs.existsSync(output)) throw new Error(`Staging directory already exists: ${output}`);

function copyAll(target) {
  for (const name of files) {
    const dest = path.join(target, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, name), dest);
  }
}
fs.mkdirSync(output, { recursive: true });
copyAll(output);
fs.rmSync(staged, { recursive: true, force: true });
fs.mkdirSync(staged, { recursive: true });
copyAll(staged);
console.log(output);
