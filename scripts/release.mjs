#!/usr/bin/env node
// Copies each SDK in sdks.json from src/<sdk>/ into public/<sdk>/<version>/ (never changed again)
// and public/<sdk>/v<major>/ (follows the newest release of that major), then rewrites
// public/_headers. With --check it writes nothing and fails if public/ is out of date.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const CHECK = process.argv.includes('--check');
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_HEADER_RULES = 100; // Cloudflare's limit for one _headers file

const problems = [];
const written = [];

function put(path, content) {
  const current = existsSync(path) ? readFileSync(path) : null;
  if (current && current.equals(content)) return;
  if (CHECK) {
    problems.push(`${rel(path)} is out of date. Run: npm run release`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  written.push(rel(path));
}

function rel(path) {
  return path.slice(ROOT.length + 1);
}

function newer(a, b) {
  const x = a.match(VERSION).slice(1).map(Number);
  const y = b.match(VERSION).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

const sdks = JSON.parse(readFileSync(join(ROOT, 'sdks.json'), 'utf8'));

for (const [name, sdk] of Object.entries(sdks)) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    problems.push(`sdks.json: "${name}" must be lowercase letters, digits and dashes.`);
    continue;
  }
  const match = VERSION.exec(sdk.version || '');
  if (!match) {
    problems.push(`sdks.json: ${name}.version must look like 1.2.3.`);
    continue;
  }
  if (!Array.isArray(sdk.files) || sdk.files.length === 0) {
    problems.push(`sdks.json: ${name}.files must list at least one file.`);
    continue;
  }
  const major = match[1];

  const published = existsSync(join(PUBLIC, name))
    ? readdirSync(join(PUBLIC, name)).filter((entry) => VERSION.test(entry))
    : [];
  const ahead = published.find((v) => v.split('.')[0] === major && newer(v, sdk.version));
  if (ahead) {
    problems.push(`${name}: ${ahead} is already published, so ${sdk.version} cannot become v${major}.`);
    continue;
  }

  const sources = sdk.files.map((file) => ({ file, content: readFileSync(join(ROOT, 'src', name, file)) }));
  if (!sources.some(({ content }) => content.includes(sdk.version))) {
    problems.push(`${name}: no file in src/${name}/ mentions ${sdk.version}. Update the version inside the SDK too.`);
    continue;
  }

  for (const { file, content } of sources) {
    // Served without a charset, so anything outside ASCII depends on the embedding page's encoding.
    if (/\.(js|css)$/.test(file) && content.some((byte) => byte > 127)) {
      problems.push(`src/${name}/${file} has characters outside ASCII. Write them as \\uXXXX escapes.`);
      continue;
    }
    const pinned = join(PUBLIC, name, sdk.version, file);
    if (existsSync(pinned) && !readFileSync(pinned).equals(content)) {
      problems.push(
        `${rel(pinned)} is already published with different content. ` +
          `A published version never changes: raise ${name}.version in sdks.json.`,
      );
      continue;
    }
    put(pinned, content);
    put(join(PUBLIC, name, `v${major}`, file), content);
  }
}

// One cache rule per folder: exact versions are cached for a year, v<major> for an hour.
const rules = [
  ['/*', ['Access-Control-Allow-Origin: *', 'Cross-Origin-Resource-Policy: cross-origin', 'X-Content-Type-Options: nosniff']],
];
if (existsSync(PUBLIC)) {
  for (const name of readdirSync(PUBLIC).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const folders = readdirSync(join(PUBLIC, name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      if (VERSION.test(folder)) {
        rules.push([`/${name}/${folder}/*`, ['Cache-Control: public, max-age=31536000, immutable']]);
      } else if (/^v\d+$/.test(folder)) {
        rules.push([`/${name}/${folder}/*`, ['Cache-Control: public, max-age=3600']]);
      } else {
        problems.push(`public/${name}/${folder} is neither a version (1.2.3) nor a major alias (v1).`);
      }
    }
  }
}
if (rules.length > MAX_HEADER_RULES) {
  problems.push(`public/_headers would have ${rules.length} rules; Cloudflare allows ${MAX_HEADER_RULES}.`);
}
const headers = rules.map(([path, lines]) => `${path}\n${lines.map((line) => `  ${line}`).join('\n')}\n`).join('\n');
if (problems.length === 0) put(join(PUBLIC, '_headers'), Buffer.from(headers));

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
if (CHECK) console.log('public/ matches src/ and sdks.json.');
else if (written.length === 0) console.log('Nothing to do: public/ is already up to date.');
else for (const path of written) console.log(`wrote ${path}`);
