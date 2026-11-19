// The declaration files against the usage examples in test/types/, with `tsc --noEmit`: a project
// built with a bundler, and Node's own resolution from ESM and from CommonJS. Each runs with
// TypeScript 5 and, when installed, TypeScript 7. Lines marked @ts-expect-error must fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const compilers = [
  ['TypeScript 5', 'node_modules/typescript/bin/tsc'],
  ['TypeScript 7', 'node_modules/typescript-7/bin/tsc'],
].filter(([, path]) => existsSync(ROOT + path));

for (const [name, tsc] of compilers) {
  for (const config of ['bundler', 'nodenext']) {
    test(`${name}, moduleResolution ${config}: the types accept the examples and refuse the mistakes`, () => {
      const run = spawnSync(process.execPath, [tsc, '-p', `test/types/tsconfig.${config}.json`], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    });
  }
}

test('TypeScript 5 is installed (npm install)', () => {
  assert.ok(compilers.length > 0);
});
