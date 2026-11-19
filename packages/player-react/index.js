'use client';
/*! @wolvy/player-react - https://docs.wolvy.net/player-api/ - Apache-2.0 */
// The source of this package. index.cjs and index.d.cts are generated from index.js and index.d.ts
// by `npm run release` in the repository; edit this file, never index.cjs.
import * as React from 'react';
import Player from '@wolvy/player';

// The iframe attributes the Wolvy embed needs (docs.wolvy.net/embedding/). Not overridable, and no
// sandbox: DRM, fullscreen and the domain check do not work in a sandboxed frame.
const ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
const REFERRER_POLICY = 'strict-origin-when-cross-origin';

// Player event -> prop. `ready` is not here: onReady follows player.ready(), which also covers a
// player that was already running when this component attached (the ready event is sent only once).
const EVENT_PROPS = [
  ['play', 'onPlay'],
  ['pause', 'onPause'],
  ['ended', 'onEnded'],
  ['seeked', 'onSeeked'],
  ['timeupdate', 'onTimeUpdate'],
  ['progress', 'onProgress'],
  ['volumechange', 'onVolumeChange'],
  ['ratechange', 'onRateChange'],
  ['qualitychange', 'onQualityChange'],
  ['captionschange', 'onCaptionsChange'],
  ['fullscreenchange', 'onFullscreenChange'],
  ['error', 'onError'],
];

// Props of <WolvyPlayer> that are not passed to the iframe as they are.
const OWN_PROPS = ['src', 'origin', 'timeout', 'onReady', 'title', 'allow', 'allowFullScreen', 'referrerPolicy', 'sandbox', 'srcDoc', 'children'].concat(
  EVENT_PROPS.map((pair) => pair[1]),
);

/**
 * Creates a WolvyPlayer for the iframe in `frameRef` once it is mounted, destroys it on unmount, and
 * creates a new one when `options.src`, `options.origin` or `options.timeout` changes. Returns the
 * player, or null while there is none. Event props in `options` may change on every render.
 */
export function useWolvyPlayer(frameRef, options) {
  const settings = options || {};
  const { src, origin, timeout } = settings;
  const handlers = React.useRef(settings);
  const attached = React.useRef({ frame: null, src: undefined });
  const [player, setPlayer] = React.useState(null);

  React.useEffect(() => {
    handlers.current = settings;
  });

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const previous = attached.current;
    attached.current = { frame, src };
    // No embed URL yet (still loading it, for example): nothing to talk to.
    if (!frame.getAttribute('src')) return undefined;
    let instance = null;
    let stopped = false;
    let reported = false;

    function call(prop, data) {
      const handler = handlers.current[prop];
      if (typeof handler === 'function') handler(data, instance);
    }

    function start() {
      frame.removeEventListener('load', start);
      if (stopped) return;
      try {
        instance = new Player(frame, { origin, timeout });
      } catch (error) {
        // `invalid_element`: the src is not an http(s) URL. Reported, not thrown into React.
        call('onError', { code: (error && error.code) || 'invalid_element' });
        return;
      }
      EVENT_PROPS.forEach(([event, prop]) => {
        instance.on(event, (data) => {
          if (event === 'error') reported = true;
          call(prop, data);
        });
      });
      instance.ready().then(
        (state) => {
          if (!stopped) call('onReady', state);
        },
        (error) => {
          // An error event before ready also rejects ready(): onError has had that one already.
          if (!stopped && !reported && error && error.code !== 'destroyed') call('onError', { code: error.code });
        },
      );
      setPlayer(instance);
    }

    // Wait for the iframe's next load when the page in it now is not the player to talk to yet:
    // the same iframe got a new src (until the new page loads, the old player is there and would
    // answer), or it is loading="lazy" and has not loaded (the SDK would give up after `timeout`
    // before the viewer scrolls to it). contentDocument is readable only while the iframe still
    // holds its first, empty document; a loaded Wolvy player is on another origin.
    const newSrcSameFrame = previous.frame === frame && previous.src !== src;
    const lazyNotLoaded = frame.getAttribute('loading') === 'lazy' && frame.contentDocument != null;
    if (newSrcSameFrame || lazyNotLoaded) frame.addEventListener('load', start);
    else start();

    return () => {
      stopped = true;
      frame.removeEventListener('load', start);
      if (instance) instance.destroy();
      setPlayer(null);
    };
  }, [frameRef, src, origin, timeout]);

  return player;
}

/**
 * <WolvyPlayer src={embedUrl} onProgress={...} ref={playerRef} />: the Wolvy embed iframe with the
 * attributes it needs, and a WolvyPlayer connected to it. `ref` receives the player object.
 * A new `src` gets a new iframe, so the old video stops and the browser history is not touched.
 */
export const WolvyPlayer = React.forwardRef(function WolvyPlayer(props, ref) {
  const frameRef = React.useRef(null);
  const player = useWolvyPlayer(frameRef, props);
  React.useImperativeHandle(ref, () => player, [player]);

  const attributes = {};
  Object.keys(props).forEach((name) => {
    if (OWN_PROPS.indexOf(name) === -1) attributes[name] = props[name];
  });
  attributes.key = props.src;
  attributes.ref = frameRef;
  attributes.src = props.src || undefined;
  attributes.title = props.title || 'Wolvy video player';
  attributes.allow = ALLOW;
  attributes.allowFullScreen = true;
  attributes.referrerPolicy = REFERRER_POLICY;
  return React.createElement('iframe', attributes);
});

WolvyPlayer.displayName = 'WolvyPlayer';
