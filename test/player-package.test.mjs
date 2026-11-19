// @wolvy/player as a customer installs it: the import shapes, and the declaration file against the
// class it describes (a method or event added to wolvy-player.js must be added to the types too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const sdks = JSON.parse(readFileSync(new URL('../sdks.json', import.meta.url), 'utf8'));
const types = readFileSync(require.resolve('@wolvy/player/package.json').replace('package.json', 'wolvy-player.d.ts'), 'utf8');

// A page for the SDK, which binds to `window` when it is first loaded.
const { window } = new JSDOM('<!doctype html><iframe id="lesson" src="https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI="></iframe>', {
  url: 'https://school.example/lessons/42',
});
globalThis.window = window;

test('import and require give the same class, which is also window.WolvyPlayer', async () => {
  const { default: imported } = await import('@wolvy/player');
  const required = require('@wolvy/player');
  assert.equal(typeof imported, 'function');
  assert.equal(imported, required);
  assert.equal(window.WolvyPlayer, required);
  assert.equal(required.version, sdks.player.version);
  assert.equal(require('@wolvy/player/package.json').version, sdks.player.version);
  assert.equal(require('@wolvy/player/wolvy-player.js'), required);
});

test('the declaration file names exactly the methods and events of the class', () => {
  const WolvyPlayer = require('@wolvy/player');
  const methods = [...types.match(/type MethodName =([^;]+);/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const eventMap = types.match(/interface EventMap \{([\s\S]*?)\n {2}\}/)[1];
  const events = [...eventMap.matchAll(/^ {4}(\w+): /gm)].map((m) => m[1]);
  assert.deepEqual([...methods].sort(), [...WolvyPlayer.METHODS].sort());
  assert.deepEqual([...events].sort(), [...WolvyPlayer.EVENTS].sort());
  assert.equal(methods.length, 18);
  assert.equal(events.length, 13);
  for (const name of WolvyPlayer.METHODS) {
    assert.match(types, new RegExp(`\\n  ${name}\\(`), `the WolvyPlayer interface declares ${name}()`);
  }
  for (const name of ['ready', 'on', 'off', 'once', 'destroy']) assert.match(types, new RegExp(`\\n  ${name}(<[^>]+>)?\\(`));
});

test('the declaration file lists every error code the SDK can produce', () => {
  const source = readFileSync(require.resolve('@wolvy/player'), 'utf8');
  const declared = [...types.match(/type ErrorCode =([\s\S]+?);\n/)[1].matchAll(/\| '(\w+)'/g)].map((m) => m[1]);
  const fromSdk = new Set([
    ...[...source.matchAll(/fail\('(\w+)'/g)].map((m) => m[1]),
    ...Object.keys(source.match(/var MESSAGES = \{([\s\S]*?)\};/)[1].split('\n').reduce((all, line) => {
      const key = /^\s*(\w+):/.exec(line);
      if (key) all[key[1]] = true;
      return all;
    }, {})),
    'failed',
  ]);
  for (const code of fromSdk) assert.ok(declared.includes(code), `ErrorCode includes ${code}`);
  assert.ok(declared.includes('play_failed'), 'the player can answer play_failed');
});

test('a constructor error carries a code from the declared list', () => {
  const WolvyPlayer = require('@wolvy/player');
  assert.throws(() => new WolvyPlayer('#missing'), { name: 'WolvyPlayerError', code: 'invalid_element' });
  const player = new WolvyPlayer('#lesson', { timeout: 10 });
  assert.throws(() => player.on('loaded', () => {}), { code: 'invalid_event' });
  player.destroy();
  return assert.rejects(player.ready(), { code: 'destroyed' });
});
