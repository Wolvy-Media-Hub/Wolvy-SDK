// @wolvy/player-react in a browser page (jsdom), against a fake Wolvy player that speaks the
// postMessage protocol (type 'wolvy:player', v 1). Runs every test on the ES module and on the
// CommonJS entry. No network: the iframes never load anything.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const PLAYER_ORIGIN = 'https://embed.wolvy.stream';
const EMBED_A = `${PLAYER_ORIGIN}/a1b2c3d4e5f60718293a/NDI=`;
const EMBED_B = `${PLAYER_ORIGIN}/0f1e2d3c4b5a69788796/NDI=`;
const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
const STATE = { currentTime: 0, duration: 600, paused: true, muted: false, volume: 1, playbackRate: 1 };

// --- A page, set up before React and the SDK read `window` -------------------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://school.example/lessons/42' });
const { window } = dom;
const { document } = window;
globalThis.window = window;
globalThis.document = document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Every 'message' listener on the page, to prove that unmounting leaves none behind.
const listeners = new Set();
const addListener = window.addEventListener.bind(window);
const removeListener = window.removeEventListener.bind(window);
window.addEventListener = (type, fn, options) => {
  if (type === 'message') listeners.add(fn);
  return addListener(type, fn, options);
};
window.removeEventListener = (type, fn, options) => {
  if (type === 'message') listeners.delete(fn);
  return removeListener(type, fn, options);
};

// --- The fake player ------------------------------------------------------------------------------
// Each iframe window gets one. It records what the page posts to it, answers `ping` with STATE like
// a running player (unless the iframe has data-quiet: a player with the Player API off, or one still
// loading), and sends events and answers the way the real one does: a MessageEvent on the page whose
// origin is the player's and whose source is the iframe's window.
const fakes = new WeakMap();
const posted = []; // everything any page code posted to any iframe: { frame, message, targetOrigin }

class FakePlayer {
  constructor(frame, win) {
    this.frame = frame;
    this.window = win;
    this.origin = new URL(frame.getAttribute('src') || 'about:blank').origin;
    this.received = [];
    win.postMessage = (message, targetOrigin) => {
      const copy = JSON.parse(JSON.stringify(message));
      this.received.push({ message: copy, targetOrigin });
      posted.push({ frame, message: copy, targetOrigin });
      if (targetOrigin !== this.origin) return; // a browser drops it
      if (copy.type === 'wolvy:player' && copy.method === 'ping' && !frame.hasAttribute('data-quiet')) {
        this.reply(copy.id, { ok: true, value: STATE });
      }
    };
  }

  send(data, { origin = this.origin, source = this.window } = {}) {
    setTimeout(() => window.dispatchEvent(new window.MessageEvent('message', { data, origin, source })), 0);
  }

  reply(id, answer, options) {
    this.send({ type: 'wolvy:player', v: 1, id, ...answer }, options);
  }

  emit(event, data, options) {
    this.send({ type: 'wolvy:player', v: 1, event, data }, options);
  }

  requests(method) {
    return this.received.filter((entry) => entry.message.method === method);
  }
}

const iframeProto = window.HTMLIFrameElement.prototype;
const realContentWindow = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow').get;
const realContentDocument = Object.getOwnPropertyDescriptor(iframeProto, 'contentDocument').get;
Object.defineProperty(iframeProto, 'contentWindow', {
  configurable: true,
  get() {
    const win = realContentWindow.call(this);
    if (win && !fakes.has(win)) fakes.set(win, new FakePlayer(this, win));
    return win;
  },
});
// A loaded Wolvy player is on another origin, so the page cannot read its document. jsdom never
// loads it; data-loaded marks an iframe that a browser would show as loaded.
Object.defineProperty(iframeProto, 'contentDocument', {
  configurable: true,
  get() {
    return this.hasAttribute('data-loaded') ? null : realContentDocument.call(this);
  },
});

function fakeOf(frame) {
  return fakes.get(frame.contentWindow);
}

// --- Helpers ---------------------------------------------------------------------------------------
const React = require('react');
let act;
let createRoot;
let Player;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (ms = 10) => act(() => sleep(ms));

function spy() {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
  };
  fn.calls = calls;
  return fn;
}

async function outcome(promise, ms = 30) {
  return Promise.race([
    promise.then(
      (value) => ({ state: 'resolved', value }),
      (error) => ({ state: 'rejected', error }),
    ),
    sleep(ms).then(() => ({ state: 'pending' })),
  ]);
}

async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    frames: () => [...container.querySelectorAll('iframe')],
    rerender: (next) => act(async () => root.render(next)),
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const EVENT_PROPS = {
  play: ['onPlay', { currentTime: 1 }],
  pause: ['onPause', { currentTime: 2 }],
  ended: ['onEnded', {}],
  seeked: ['onSeeked', { currentTime: 30 }],
  timeupdate: ['onTimeUpdate', { currentTime: 31, duration: 600 }],
  progress: ['onProgress', { percent: 12.5, seconds: 75, duration: 600 }],
  volumechange: ['onVolumeChange', { volume: 0.5, muted: false }],
  ratechange: ['onRateChange', { playbackRate: 1.5 }],
  qualitychange: ['onQualityChange', { available: [1080, 720], selected: 'auto', playing: 720 }],
  captionschange: ['onCaptionsChange', { active: 'ar' }],
  fullscreenchange: ['onFullscreenChange', { fullscreen: true }],
  error: ['onError', { code: 'network_error' }],
};

before(async () => {
  ({ act } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  Player = require('@wolvy/player');
});

after(() => window.close());

const entries = [
  ['ES module (import)', () => import('@wolvy/player-react')],
  ['CommonJS (require)', async () => require('@wolvy/player-react')],
];

for (const [label, load] of entries) {
  describe(`@wolvy/player-react, ${label}`, () => {
    let WolvyPlayer;
    let useWolvyPlayer;
    const h = React.createElement;

    before(async () => {
      ({ WolvyPlayer, useWolvyPlayer } = await load());
    });

    it('exports the component and the hook, and nothing else', async () => {
      const lib = await load();
      assert.deepEqual(Object.keys(lib).filter((key) => key !== 'default' && key !== 'module.exports').sort(), ['WolvyPlayer', 'useWolvyPlayer']);
      assert.equal(WolvyPlayer.displayName, 'WolvyPlayer');
      assert.equal(typeof useWolvyPlayer, 'function');
    });

    it('renders one iframe with exactly the attributes the docs require, whatever else is passed', async () => {
      const view = await mount(
        h(WolvyPlayer, {
          src: EMBED_A,
          className: 'video',
          'data-lesson': '42',
          // Ignored: the component owns these, and a sandbox breaks DRM and fullscreen.
          sandbox: 'allow-scripts',
          allow: 'camera',
          allowFullScreen: false,
          referrerPolicy: 'no-referrer',
          srcDoc: '<p>not a player</p>',
          origin: PLAYER_ORIGIN,
          timeout: 20000,
          onProgress() {},
        }),
      );
      const frames = view.frames();
      assert.equal(frames.length, 1);
      const [frame] = frames;
      assert.equal(frame.getAttribute('src'), EMBED_A);
      assert.equal(frame.getAttribute('allow'), ALLOW);
      assert.equal(frame.hasAttribute('allowfullscreen'), true);
      assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
      assert.equal(frame.hasAttribute('sandbox'), false);
      assert.deepEqual(
        frame.getAttributeNames().sort(),
        ['allow', 'allowfullscreen', 'class', 'data-lesson', 'referrerpolicy', 'src', 'title'],
      );
      assert.equal(frame.getAttribute('title'), 'Wolvy video player');
      await view.unmount();
    });

    it('creates a player on mount: pings the player origin, then reports ready with the player', async () => {
      const ref = React.createRef();
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, ref, onReady, title: 'Lesson 42' }));
      await settle();
      const [frame] = view.frames();
      assert.equal(frame.getAttribute('title'), 'Lesson 42');
      const fake = fakeOf(frame);
      const [ping] = fake.requests('ping');
      assert.ok(ping, 'the player was pinged');
      assert.equal(ping.targetOrigin, PLAYER_ORIGIN);
      assert.deepEqual(Object.keys(ping.message).sort(), ['id', 'method', 'type', 'v']);
      assert.equal(ping.message.type, 'wolvy:player');
      assert.equal(ping.message.v, 1);

      assert.ok(ref.current instanceof Player, 'ref holds the WolvyPlayer from @wolvy/player');
      assert.equal(ref.current.element, frame);
      assert.equal(onReady.calls.length, 1);
      assert.deepEqual(onReady.calls[0][0], STATE);
      assert.equal(onReady.calls[0][1], ref.current);
      await view.unmount();
    });

    it('passes each of the 12 events to its prop, with the data and the player; ready once', async () => {
      const ref = React.createRef();
      const props = { src: EMBED_A, ref, onReady: spy() };
      for (const [prop] of Object.values(EVENT_PROPS)) props[prop] = spy();
      const view = await mount(h(WolvyPlayer, props));
      await settle();
      const fake = fakeOf(view.frames()[0]);
      fake.emit('ready', STATE); // already ready through ping: not reported twice
      for (const [event, [, data]] of Object.entries(EVENT_PROPS)) fake.emit(event, data);
      await settle();
      assert.equal(props.onReady.calls.length, 1);
      for (const [event, [prop, data]] of Object.entries(EVENT_PROPS)) {
        assert.equal(props[prop].calls.length, 1, `${prop} for ${event}`);
        assert.deepEqual(props[prop].calls[0][0], data, `${prop} data`);
        assert.equal(props[prop].calls[0][1], ref.current, `${prop} player`);
      }
      await view.unmount();
    });

    it('reports ready from the ready event when the player does not answer ping', async () => {
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, onReady, 'data-quiet': '' }));
      const fake = fakeOf(view.frames()[0]);
      await settle();
      assert.equal(onReady.calls.length, 0);
      fake.emit('ready', { ...STATE, duration: 42 });
      await settle();
      assert.equal(onReady.calls.length, 1);
      assert.equal(onReady.calls[0][0].duration, 42);
      await view.unmount();
    });

    it('enforces the origin and source rules: other origins, other windows and other messages are ignored', async () => {
      const ref = React.createRef();
      const onProgress = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, ref, onProgress }));
      await settle();
      const fake = fakeOf(view.frames()[0]);
      const other = document.createElement('iframe');
      other.setAttribute('src', 'https://other.example/');
      document.body.appendChild(other);
      const data = { percent: 50, seconds: 300, duration: 600 };

      fake.emit('progress', data, { origin: 'https://evil.example' });
      fake.emit('progress', data, { origin: 'http://embed.wolvy.stream' });
      fake.emit('progress', data, { source: other.contentWindow });
      fake.emit('progress', data, { source: window });
      fake.emit('progress', data, { source: null });
      fake.send({ type: 'other:player', v: 1, event: 'progress', data });
      fake.send({ type: 'wolvy:player', v: 1, event: 'not-an-event', data });
      fake.send('wolvy:player progress');
      await settle();
      assert.equal(onProgress.calls.length, 0);

      fake.emit('progress', data);
      await settle();
      assert.equal(onProgress.calls.length, 1);

      // Answers follow the same rule. Every request went to the player origin, never "*".
      const answer = ref.current.seek(42);
      await settle();
      const [request] = fake.requests('seek');
      assert.deepEqual(
        { method: request.message.method, value: request.message.value, to: request.targetOrigin },
        { method: 'seek', value: 42, to: PLAYER_ORIGIN },
      );
      fake.reply(request.message.id, { ok: true, value: 999 }, { origin: 'https://evil.example' });
      fake.reply(request.message.id, { ok: true, value: 998 }, { source: other.contentWindow });
      assert.equal((await outcome(answer)).state, 'pending');
      fake.reply(request.message.id, { ok: true, value: 42 });
      assert.deepEqual(await outcome(answer), { state: 'resolved', value: 42 });
      assert.ok(fake.received.every((entry) => entry.targetOrigin === PLAYER_ORIGIN));

      other.remove();
      await view.unmount();
    });

    it('takes the player origin from the src', async () => {
      const src = 'https://staging-embed.wolvy.example/a1b2c3d4e5f60718293a/NDI=';
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src, onReady }));
      await settle();
      const fake = fakeOf(view.frames()[0]);
      assert.equal(fake.requests('ping')[0].targetOrigin, 'https://staging-embed.wolvy.example');
      assert.equal(onReady.calls.length, 1);
      await view.unmount();
    });

    it('keeps the same player when only event props change, and calls the newest ones', async () => {
      const ref = React.createRef();
      const first = spy();
      const second = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, ref, onProgress: first, style: { width: 640 } }));
      await settle();
      const player = ref.current;
      const fake = fakeOf(view.frames()[0]);
      const pings = fake.requests('ping').length;
      await view.rerender(h(WolvyPlayer, { src: EMBED_A, ref, onProgress: second, style: { width: 800 } }));
      fake.emit('progress', { percent: 1, seconds: 6, duration: 600 });
      await settle();
      assert.equal(ref.current, player);
      assert.equal(fake.requests('ping').length, pings);
      assert.equal(first.calls.length, 0);
      assert.equal(second.calls.length, 1);
      assert.equal(view.frames()[0].style.width, '800px');
      await view.unmount();
    });

    it('reports an error event once, even when it arrives before ready', async () => {
      const onError = spy();
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, onError, onReady, 'data-quiet': '' }));
      const fake = fakeOf(view.frames()[0]);
      fake.emit('error', { code: 'device_not_supported' });
      await settle(20);
      assert.deepEqual(onError.calls.map(([data]) => data), [{ code: 'device_not_supported' }]);
      assert.equal(onReady.calls.length, 0);
      await view.unmount();
    });

    it('reports not_available when the player never answers (Player API off)', async () => {
      const onError = spy();
      const ref = React.createRef();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, timeout: 30, onError, ref, 'data-quiet': '' }));
      await settle(80);
      assert.equal(onError.calls.length, 1);
      assert.deepEqual(onError.calls[0][0], { code: 'not_available' });
      assert.equal(onError.calls[0][1], ref.current);
      await assert.rejects(ref.current.play(), { name: 'WolvyPlayerError', code: 'not_available' });
      await view.unmount();
    });

    it('unmount destroys the player and leaves nothing behind', async () => {
      const ref = React.createRef();
      const onProgress = spy();
      const onError = spy();
      const before = listeners.size;
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, ref, onProgress, onError }));
      await settle();
      assert.equal(listeners.size, before + 1);
      const player = ref.current;
      const fake = fakeOf(view.frames()[0]);
      const pending = player.getDuration(); // the fake never answers it
      pending.catch(() => {}); // inspected below

      await view.unmount();
      assert.equal(listeners.size, before, 'no message listener is left on the page');
      assert.equal(ref.current, null);
      assert.equal(document.querySelectorAll('iframe').length, 0);
      const result = await outcome(pending);
      assert.equal(result.state, 'rejected');
      assert.equal(result.error.code, 'destroyed');
      fake.emit('progress', { percent: 99, seconds: 594, duration: 600 });
      await sleep(10);
      assert.equal(onProgress.calls.length, 0);
      assert.equal(onError.calls.length, 0, 'destroying is not an error');
    });

    it('a new src gets a new iframe and a new player; the old player is destroyed', async () => {
      const ref = React.createRef();
      const onReady = spy();
      const onProgress = spy();
      const before = listeners.size;
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, ref, onReady, onProgress }));
      await settle();
      const [oldFrame] = view.frames();
      const oldFake = fakeOf(oldFrame);
      const oldPlayer = ref.current;
      const pending = oldPlayer.getDuration();
      pending.catch(() => {}); // inspected below

      await view.rerender(h(WolvyPlayer, { src: EMBED_B, ref, onReady, onProgress }));
      await settle();
      const frames = view.frames();
      assert.equal(frames.length, 1);
      const [newFrame] = frames;
      assert.notEqual(newFrame, oldFrame, 'a new iframe, so the old video stops and history is untouched');
      assert.equal(oldFrame.isConnected, false);
      assert.equal(newFrame.getAttribute('src'), EMBED_B);

      assert.equal((await outcome(pending)).error.code, 'destroyed');
      assert.notEqual(ref.current, oldPlayer);
      assert.ok(ref.current instanceof Player);
      assert.equal(ref.current.element, newFrame);
      assert.equal(fakeOf(newFrame).requests('ping').length >= 1, true);
      assert.equal(onReady.calls.length, 2);
      assert.equal(onReady.calls[1][1], ref.current);
      assert.equal(listeners.size, before + 1);

      oldFake.emit('progress', { percent: 99, seconds: 594, duration: 600 });
      fakeOf(newFrame).emit('progress', { percent: 1, seconds: 6, duration: 600 });
      await settle();
      assert.deepEqual(onProgress.calls.map(([data]) => data.percent), [1]);
      await view.unmount();
    });

    it('in StrictMode, one live player: each event is reported once', async () => {
      const onProgress = spy();
      const before = listeners.size;
      const view = await mount(h(React.StrictMode, null, h(WolvyPlayer, { src: EMBED_A, onProgress })));
      await settle();
      assert.equal(listeners.size, before + 1);
      fakeOf(view.frames()[0]).emit('progress', { percent: 3, seconds: 18, duration: 600 });
      await settle();
      assert.equal(onProgress.calls.length, 1);
      await view.unmount();
      assert.equal(listeners.size, before);
    });

    it('loading="lazy": waits for the iframe to load instead of timing out first', async () => {
      const ref = React.createRef();
      const onReady = spy();
      const onError = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, loading: 'lazy', timeout: 30, ref, onReady, onError }));
      await settle(80);
      const [frame] = view.frames();
      assert.equal(frame.getAttribute('loading'), 'lazy');
      assert.equal(fakeOf(frame).requests('ping').length, 0);
      assert.equal(ref.current, null);
      assert.equal(onError.calls.length, 0);

      await act(async () => frame.dispatchEvent(new window.Event('load')));
      await settle();
      assert.ok(ref.current instanceof Player);
      assert.equal(onReady.calls.length, 1);
      await view.unmount();
    });

    it('loading="lazy" on an iframe that has already loaded (after hydration): starts at once', async () => {
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src: EMBED_A, loading: 'lazy', 'data-loaded': '', onReady }));
      await settle();
      assert.equal(onReady.calls.length, 1);
      await view.unmount();
    });

    it('no src yet: no player and no error; the src arriving later creates one', async () => {
      const ref = React.createRef();
      const onError = spy();
      const onReady = spy();
      const view = await mount(h(WolvyPlayer, { src: '', ref, onError, onReady }));
      await settle();
      assert.equal(ref.current, null);
      assert.equal(onError.calls.length, 0);
      await view.rerender(h(WolvyPlayer, { src: EMBED_A, ref, onError, onReady }));
      await settle();
      assert.ok(ref.current instanceof Player);
      assert.equal(onReady.calls.length, 1);
      await view.unmount();
    });

    it('a src that is not an http(s) URL is reported as invalid_element, not thrown', async () => {
      const onError = spy();
      const view = await mount(h(WolvyPlayer, { src: 'about:blank', onError }));
      await settle();
      assert.deepEqual(onError.calls, [[{ code: 'invalid_element' }, null]]);
      await view.unmount();
    });

    it('useWolvyPlayer on your own iframe: a new src on the same iframe waits for the new page', async () => {
      const seen = [];
      const onReady = spy();
      function Own({ src }) {
        const frame = React.useRef(null);
        const player = useWolvyPlayer(frame, { src, onReady });
        seen.push(player);
        return h('iframe', {
          ref: frame,
          src,
          allow: ALLOW,
          allowFullScreen: true,
          referrerPolicy: 'strict-origin-when-cross-origin',
        });
      }
      const before = listeners.size;
      const view = await mount(h(Own, { src: EMBED_A }));
      await settle();
      const [frame] = view.frames();
      const first = seen[seen.length - 1];
      assert.ok(first instanceof Player);
      assert.equal(first.element, frame);
      assert.equal(onReady.calls.length, 1);

      const sentBefore = posted.filter((entry) => entry.frame === frame).length;
      await view.rerender(h(Own, { src: EMBED_B }));
      await settle();
      assert.equal(view.frames()[0], frame, 'the same iframe element');
      assert.equal(frame.getAttribute('src'), EMBED_B);
      assert.equal(posted.filter((entry) => entry.frame === frame).length, sentBefore, 'nothing is sent to the old page');
      assert.equal(seen[seen.length - 1], null);
      assert.equal(listeners.size, before);

      await act(async () => frame.dispatchEvent(new window.Event('load')));
      await settle();
      const second = seen[seen.length - 1];
      assert.ok(second instanceof Player);
      assert.notEqual(second, first);
      assert.equal(onReady.calls.length, 2);
      assert.equal(listeners.size, before + 1);
      await view.unmount();
      assert.equal(listeners.size, before);
    });
  });
}
