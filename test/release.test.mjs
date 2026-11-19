// The release step and its rule: for a given version, the JavaScript in the npm package is the file
// served at sdk.wolvy.net/<sdk>/<version>/, byte for byte. Checked on disk, in the tarball npm would
// publish (npm pack, offline), and against tampered copies of the repository.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sdks = JSON.parse(readFileSync(join(ROOT, 'sdks.json'), 'utf8'));
const VERSION = sdks.player.version;
// public/player/1.0.0/wolvy-player.js as deployed to sdk.wolvy.net on 2026-11-17. Never changes.
const PUBLISHED_1_0_0 = '8712479f9818925b9b2c06583a2ecdab9b583b0c1782dba3f2197057b66c1264';
// The Apache License 2.0 as apache.org publishes it (LICENSE-2.0.txt, 11,358 bytes).
const APACHE_2_0 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';

const scratch = mkdtempSync(join(tmpdir(), 'wolvy-sdk-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const read = (...parts) => readFileSync(join(...parts));

function release(root, ...args) {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'release.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, npm_package_name: '' } });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

// A copy of the repository's release inputs and outputs, to tamper with.
function sandbox(name) {
  const root = join(scratch, name);
  for (const part of ['scripts', 'src', 'public', 'packages', 'sdks.json']) {
    cpSync(join(ROOT, part), join(root, part), { recursive: true, filter: (path) => !path.includes('node_modules') });
  }
  return root;
}

function edit(path, change) {
  writeFileSync(path, change(readFileSync(path, 'utf8')));
}

describe('the repository as it is', () => {
  test('npm run check passes: public/ and packages/ match src/ and sdks.json', () => {
    const run = release(ROOT, '--check');
    assert.equal(run.status, 0, run.output);
  });

  test('the bytes published at /player/1.0.0/ are unchanged, and /player/v1/ serves the current 1.x', () => {
    assert.equal(sha256(read(ROOT, 'public/player/1.0.0/wolvy-player.js')), PUBLISHED_1_0_0);
    assert.ok(read(ROOT, 'public/player/v1/wolvy-player.js').equals(read(ROOT, 'public/player', VERSION, 'wolvy-player.js')));
  });

  test('packages/player/wolvy-player.js is the served file for its version, and the source', () => {
    const packaged = read(ROOT, 'packages/player/wolvy-player.js');
    assert.ok(packaged.equals(read(ROOT, 'public/player', VERSION, 'wolvy-player.js')));
    assert.ok(packaged.equals(read(ROOT, 'src/player/wolvy-player.js')));
    assert.ok(read(ROOT, 'packages/player/wolvy-player.d.ts').equals(read(ROOT, 'src/player/wolvy-player.d.ts')));
    assert.equal(JSON.parse(read(ROOT, 'packages/player/package.json')).version, VERSION);
  });

  test('both packages carry the Apache License 2.0, unmodified', () => {
    for (const folder of ['packages/player', 'packages/player-react']) {
      const text = read(ROOT, folder, 'LICENSE');
      assert.equal(sha256(text), APACHE_2_0, folder);
      assert.ok(text.toString().startsWith('\n                                 Apache License\n                           Version 2.0, January 2004\n'));
      assert.ok(text.toString().endsWith('   limitations under the License.\n'));
      assert.equal(JSON.parse(read(ROOT, folder, 'package.json')).license, 'Apache-2.0');
    }
  });
});

describe('what npm would publish (npm pack, offline)', () => {
  const out = join(scratch, 'pack');
  mkdirSync(out, { recursive: true });
  const run = spawnSync('npm', ['pack', './packages/player', './packages/player-react', '--pack-destination', out, '--json', '--ignore-scripts', '--offline'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const packs = run.status === 0 ? Object.values(JSON.parse(run.stdout)) : [];
  const unpack = (name) => {
    const pack = packs.find((entry) => entry.name === name);
    const folder = join(out, name.replace('/', '__'));
    mkdirSync(folder, { recursive: true });
    const tar = spawnSync('tar', ['-xzf', join(out, pack.filename), '-C', folder]);
    assert.equal(tar.status, 0, String(tar.stderr));
    return { pack, dir: join(folder, 'package') };
  };

  test('npm pack works', () => {
    assert.equal(run.status, 0, run.stderr);
    assert.equal(packs.length, 2);
  });

  test('@wolvy/player: wolvy-player.js in the tarball is the file served at /player/<version>/', () => {
    const { pack, dir } = unpack('@wolvy/player');
    assert.equal(pack.version, VERSION);
    assert.deepEqual(readdirSync(dir).sort(), ['LICENSE', 'README.md', 'package.json', 'wolvy-player.d.ts', 'wolvy-player.js']);
    const served = read(ROOT, 'public/player', VERSION, 'wolvy-player.js');
    assert.ok(read(dir, 'wolvy-player.js').equals(served), 'npm file == served file');
    if (VERSION === '1.0.0') assert.equal(sha256(read(dir, 'wolvy-player.js')), PUBLISHED_1_0_0);
    assert.ok(read(dir, 'wolvy-player.d.ts').equals(read(ROOT, 'src/player/wolvy-player.d.ts')));
  });

  test('@wolvy/player-react: the ES module, the CommonJS twin and both declaration files', () => {
    const { pack, dir } = unpack('@wolvy/player-react');
    assert.deepEqual(readdirSync(dir).sort(), ['LICENSE', 'README.md', 'index.cjs', 'index.d.cts', 'index.d.ts', 'index.js', 'package.json']);
    const manifest = JSON.parse(read(dir, 'package.json'));
    assert.equal(manifest.dependencies['@wolvy/player'], `^${VERSION.split('.')[0]}.0.0`);
    assert.equal(pack.version, manifest.version);
  });
});

describe('the check fails when the rule is broken (tampered copies)', () => {
  test('a package file edited by hand', () => {
    const root = sandbox('edited-package');
    edit(join(root, 'packages/player/wolvy-player.js'), (text) => text.replace("'ready'", "'ready', 'loaded'"));
    const run = release(root, '--check');
    assert.equal(run.status, 1);
    assert.match(run.output, /packages\/player\/wolvy-player\.js is not the same file as public\/player\/1\.0\.0\/wolvy-player\.js/);
  });

  test('a package version that differs from sdks.json', () => {
    const root = sandbox('package-version');
    edit(join(root, 'packages/player/package.json'), (text) => text.replace(`"version": "${VERSION}"`, '"version": "9.9.9"'));
    const run = release(root, '--check');
    assert.equal(run.status, 1);
    assert.match(run.output, /packages\/player\/package\.json has version 9\.9\.9/);
  });

  test('a source change without a new version: refused, and nothing is written anywhere', () => {
    const root = sandbox('same-version');
    edit(join(root, 'src/player/wolvy-player.js'), (text) => text.replace('15000', '20000'));
    const run = release(root);
    assert.equal(run.status, 1);
    assert.match(run.output, /already published with different content/);
    assert.ok(read(root, 'packages/player/wolvy-player.js').equals(read(ROOT, 'packages/player/wolvy-player.js')));
    assert.ok(read(root, 'public/player/v1/wolvy-player.js').equals(read(ROOT, 'public/player/v1/wolvy-player.js')));
  });

  test('a new version: one command writes public/<version>/, v1 and the package, and leaves 1.0.0 alone', () => {
    const root = sandbox('new-version');
    edit(join(root, 'src/player/wolvy-player.js'), (text) => text.replace(`WolvyPlayer.version = '${VERSION}'`, "WolvyPlayer.version = '1.9.0'"));
    edit(join(root, 'sdks.json'), (text) => text.replace(`"version": "${VERSION}"`, '"version": "1.9.0"'));
    const run = release(root);
    assert.equal(run.status, 0, run.output);
    const served = read(root, 'public/player/1.9.0/wolvy-player.js');
    assert.ok(read(root, 'packages/player/wolvy-player.js').equals(served));
    assert.ok(read(root, 'public/player/v1/wolvy-player.js').equals(served));
    assert.equal(JSON.parse(read(root, 'packages/player/package.json')).version, '1.9.0');
    assert.equal(sha256(read(root, 'public/player/1.0.0/wolvy-player.js')), PUBLISHED_1_0_0);
    assert.match(read(root, 'public/_headers').toString(), /\/player\/1\.9\.0\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    assert.equal(release(root, '--check').status, 0);
  });

  test('the React source changed without regenerating the CommonJS twin', () => {
    const root = sandbox('react-cjs');
    edit(join(root, 'packages/player-react/index.js'), (text) => text.replace("'Wolvy video player'", "'Video'"));
    const run = release(root, '--check');
    assert.equal(run.status, 1);
    assert.match(run.output, /packages\/player-react\/index\.cjs is out of date/);
    assert.equal(release(root).status, 0);
    assert.match(read(root, 'packages/player-react/index.cjs').toString(), /'Video'/);
  });

  test('a package.json "files" that leaves the JavaScript out', () => {
    const root = sandbox('files');
    edit(join(root, 'packages/player/package.json'), (text) => text.replace('"wolvy-player.js",\n', ''));
    const run = release(root, '--check');
    assert.equal(run.status, 1);
    assert.match(run.output, /"files" must list wolvy-player\.js/);
  });

  test('prepublishOnly (--publish) passes with the real repository and refuses a TODO placeholder', () => {
    const root = sandbox('publish');
    assert.equal(release(root, '--publish').status, 0);
    for (const folder of ['packages/player', 'packages/player-react']) {
      const json = JSON.parse(read(root, join(folder, 'package.json')).toString());
      assert.equal(json.repository.url, 'git+https://github.com/Wolvy-Media-Hub/Wolvy-SDK.git');
      assert.equal(json.repository.directory, folder);
      edit(join(root, folder, 'package.json'), (text) => text.replace(/"url": "git\+https:[^"]*"/, '"url": "TODO: not decided"'));
    }
    const run = release(root, '--publish');
    assert.equal(run.status, 1);
    assert.match(run.output, /"repository" is still a TODO placeholder/);
  });
});

test('the sandbox copies do not include node_modules', () => {
  assert.equal(existsSync(join(scratch, 'edited-package', 'node_modules')), false);
});
