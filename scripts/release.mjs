#!/usr/bin/env node
// One step for everything this repository ships:
//
// 1. sdk.wolvy.net: copies each SDK in sdks.json from src/<sdk>/ into public/<sdk>/<version>/ (never
//    changed again) and public/<sdk>/v<major>/ (follows the newest release of that major), then
//    rewrites public/_headers.
// 2. npm, for an SDK with an "npm" entry in sdks.json: copies the same files into that package
//    folder (packages/player/), plus its "extraFiles" (the TypeScript declarations), and sets the
//    package's version to the SDK's. The package's JavaScript is therefore the served file, byte for
//    byte; the last check below compares the two on disk.
// 3. npm packages written here as ES modules (packages/player-react/): generates index.cjs and
//    index.d.cts from index.js and index.d.ts.
//
// --check writes nothing and fails if anything above is out of date, or if a package file differs
// from the file served for the same version. --publish (used by each package's prepublishOnly) is
// --check plus the things only a publish needs, such as a real "repository" in package.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PUBLISH = process.argv.includes('--publish');
const CHECK = PUBLISH || process.argv.includes('--check');
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_HEADER_RULES = 100; // Cloudflare's limit for one _headers file

// npm packages whose source is index.js (ESM) and index.d.ts, with generated CommonJS twins.
const ESM_PACKAGES = ['packages/player-react'];

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

function readPackage(folder) {
  const path = join(ROOT, folder, 'package.json');
  if (!existsSync(path)) {
    problems.push(`${folder}/package.json is missing.`);
    return null;
  }
  return { path, text: readFileSync(path, 'utf8'), json: JSON.parse(readFileSync(path, 'utf8')) };
}

// What every npm package here needs before it can be published.
function checkPackage(folder, pkg, shipped) {
  const { json } = pkg;
  const listed = Array.isArray(json.files) ? json.files : [];
  for (const file of shipped) {
    if (!listed.includes(file)) problems.push(`${folder}/package.json: "files" must list ${file}, or npm will not ship it.`);
  }
  if (!existsSync(join(ROOT, folder, 'LICENSE'))) problems.push(`${folder}/LICENSE is missing.`);
  if (json.license !== 'Apache-2.0') problems.push(`${folder}/package.json: "license" must be "Apache-2.0".`);
  if (PUBLISH && (!process.env.npm_package_name || process.env.npm_package_name === json.name)) {
    const repository = JSON.stringify(json.repository || '');
    if (/TODO/.test(repository)) {
      problems.push(`${folder}/package.json: "repository" is still a TODO placeholder. Set the public repository first.`);
    }
  }
}

const sdks = JSON.parse(readFileSync(join(ROOT, 'sdks.json'), 'utf8'));
const mirrors = []; // [package file, served file] pairs that must hold the same bytes

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

  let servable = true;
  for (const { file, content } of sources) {
    // Served without a charset, so anything outside ASCII depends on the embedding page's encoding.
    if (/\.(js|css)$/.test(file) && content.some((byte) => byte > 127)) {
      problems.push(`src/${name}/${file} has characters outside ASCII. Write them as \\uXXXX escapes.`);
      servable = false;
      continue;
    }
    const pinned = join(PUBLIC, name, sdk.version, file);
    if (existsSync(pinned) && !readFileSync(pinned).equals(content)) {
      problems.push(
        `${rel(pinned)} is already published with different content. ` +
          `A published version never changes: raise ${name}.version in sdks.json.`,
      );
      servable = false;
      continue;
    }
    put(pinned, content);
    put(join(PUBLIC, name, `v${major}`, file), content);
  }

  // The npm package: the served files as they are, plus files that are not served (types).
  if (sdk.npm === undefined) continue;
  const folder = sdk.npm && sdk.npm.folder;
  const extra = (sdk.npm && sdk.npm.extraFiles) || [];
  if (typeof folder !== 'string' || !/^packages\/[a-z0-9][a-z0-9-]*$/.test(folder) || !Array.isArray(extra)) {
    problems.push(`sdks.json: ${name}.npm needs "folder": "packages/<name>" and, optionally, "extraFiles": [...].`);
    continue;
  }
  const pkg = readPackage(folder);
  if (!pkg) continue;
  if (pkg.json.version !== sdk.version) {
    if (CHECK) {
      problems.push(`${folder}/package.json has version ${pkg.json.version}, sdks.json says ${sdk.version}. Run: npm run release`);
    } else {
      // Only the version line changes, so the rest of the file keeps its layout.
      put(pkg.path, Buffer.from(pkg.text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${sdk.version}"`)));
    }
  }
  if (!servable) continue;
  for (const { file, content } of sources) {
    put(join(ROOT, folder, file), content);
    mirrors.push([join(ROOT, folder, file), join(PUBLIC, name, sdk.version, file)]);
  }
  for (const file of extra) {
    if (sdk.files.includes(file)) continue;
    const source = join(ROOT, 'src', name, file);
    if (!existsSync(source)) {
      problems.push(`sdks.json: ${name}.npm.extraFiles lists ${file}, which is not in src/${name}/.`);
      continue;
    }
    put(join(ROOT, folder, file), readFileSync(source));
  }
  checkPackage(folder, pkg, [...sdk.files, ...extra]);
}

// The CommonJS twin of an ES module written in a fixed style: `import * as X from 'm';`,
// `import X from 'm';` and `export function` / `export const` at the start of a line. Anything else
// is refused rather than converted wrongly.
function commonJs(esm, folder) {
  const names = [];
  let body = esm
    .replace(/^import \* as (\w+) from '([^']+)';$/gm, "const $1 = require('$2');")
    .replace(/^import (\w+) from '([^']+)';$/gm, "const $1 = require('$2');")
    .replace(/^export (function|const) (\w+)/gm, (_, kind, exported) => {
      names.push(exported);
      return `${kind} ${exported}`;
    });
  const left = /^\s*(import|export)\b.*$/m.exec(body);
  if (left) {
    problems.push(`${folder}/index.js: "${left[0].trim()}" has no CommonJS conversion. Use the forms listed in scripts/release.mjs.`);
    return null;
  }
  const notice = '// Generated from index.js by scripts/release.mjs (npm run release). Do not edit.\n';
  body = /^'use client';\n/.test(body)
    ? body.replace(/^'use client';\n/, `'use client';\n'use strict';\n${notice}`)
    : `'use strict';\n${notice}${body}`;
  return `${body}\n${names.map((exported) => `exports.${exported} = ${exported};`).join('\n')}\n`;
}

for (const folder of ESM_PACKAGES) {
  const pkg = readPackage(folder);
  if (!pkg) continue;
  const esm = readFileSync(join(ROOT, folder, 'index.js'), 'utf8');
  const types = readFileSync(join(ROOT, folder, 'index.d.ts'), 'utf8');
  for (const [file, text] of [['index.js', esm], ['index.d.ts', types]]) {
    if (/[^\x00-\x7f]/.test(text)) problems.push(`${folder}/${file} has characters outside ASCII.`);
  }
  const cjs = commonJs(esm, folder);
  if (cjs) put(join(ROOT, folder, 'index.cjs'), Buffer.from(cjs));
  put(
    join(ROOT, folder, 'index.d.cts'),
    Buffer.from(`// Generated from index.d.ts by scripts/release.mjs (npm run release). Do not edit.\n${types}`),
  );
  checkPackage(folder, pkg, ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']);
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

// The rule for npm: a package's JavaScript is the file served at sdk.wolvy.net/<sdk>/<version>/,
// byte for byte. Compared on disk, after everything above was written (or found up to date).
for (const [packaged, served] of mirrors) {
  const a = existsSync(packaged) ? readFileSync(packaged) : null;
  const b = existsSync(served) ? readFileSync(served) : null;
  if (!a || !b || !a.equals(b)) {
    problems.push(`${rel(packaged)} is not the same file as ${rel(served)}. The npm package must ship the served bytes.`);
  }
}

if (problems.length > 0) {
  for (const problem of [...new Set(problems)]) console.error(`✗ ${problem}`);
  process.exit(1);
}
if (CHECK) console.log('public/ and packages/ match src/ and sdks.json.');
else if (written.length === 0) console.log('Nothing to do: public/ and packages/ are already up to date.');
else for (const path of written) console.log(`wrote ${path}`);
