import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${manifest.version}`) {
  throw new Error('Tag and manifest version differ');
}
const output = path.join(root, 'output', 'release', manifest.version, 'game');
const files = ['game.json', 'index.html', 'styles.css', 'game.js', 'cover.png'];
// A fresh allowlisted directory keeps repository metadata and secrets out of the ZIP.
if (fs.existsSync(output)) throw new Error(`Staging directory already exists: ${output}`);
for (const name of files) {
  if (!fs.lstatSync(path.join(root, name)).isFile()) throw new Error(`Invalid asset: ${name}`);
}
fs.mkdirSync(output, { recursive: true });
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(output, name));
console.log(output);
