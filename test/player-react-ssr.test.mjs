// @wolvy/player-react on a server (Next.js, Remix, Astro): no window, no document. Importing the
// package and rendering it to HTML must work; the player is created in the browser only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('imports and renders to HTML without a browser, from ESM and from CommonJS', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  const esm = await import('@wolvy/player-react');
  const cjs = require('@wolvy/player-react');
  const src = 'https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=?vt=abc&x=1';
  for (const { WolvyPlayer } of [esm, cjs]) {
    const html = renderToString(React.createElement(WolvyPlayer, { src, className: 'video', onProgress() {}, sandbox: 'allow-scripts' }));
    assert.match(html, /^<iframe [^>]*><\/iframe>$/);
    // HTML attribute names are case-insensitive (React writes allowFullScreen, referrerPolicy).
    const attributes = Object.fromEntries([...html.matchAll(/ ([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value]));
    assert.deepEqual(attributes, {
      class: 'video',
      src: 'https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=?vt=abc&amp;x=1',
      title: 'Wolvy video player',
      allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
  }
});

test('both entries start with the "use client" directive, for React Server Components', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['index.js', 'index.cjs']) {
    const text = readFileSync(require.resolve(`@wolvy/player-react/package.json`).replace('package.json', file), 'utf8');
    assert.ok(text.startsWith("'use client';\n"), file);
  }
});
