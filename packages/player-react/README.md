# @wolvy/player-react

A React component for the [Wolvy](https://wolvy.net) video player: the embed iframe with the
attributes it needs, a player connected to it, event props such as `onProgress`, and the player
object through a `ref` or a hook. Built on [`@wolvy/player`](https://www.npmjs.com/package/@wolvy/player)
(the Player API SDK). Full guide: **https://docs.wolvy.net/player-api/**

Before you start, switch the Player API on for your account: in the dashboard, open
Settings → Player and turn on Player API. It is off by default; while it is off, `onError` receives
`not_available`.

## Install

```sh
npm install @wolvy/player-react
```

React 16.8 or later. `@wolvy/player` is installed with it. Plain JavaScript (an ES module and a
CommonJS file) with TypeScript types: no build step or JSX transform needed on your side.

## Example

```jsx
import { useRef } from 'react';
import { WolvyPlayer } from '@wolvy/player-react';

export function Lesson({ embedUrl, onComplete }) {
  const player = useRef(null);

  return (
    <>
      <WolvyPlayer
        ref={player}
        src={embedUrl}
        className="lesson-video"
        onReady={({ duration }) => console.log('ready,', duration, 'seconds')}
        onProgress={({ percent }) => percent >= 90 && onComplete()}
        onError={({ code }) => console.warn('Wolvy player:', code)}
      />
      {/* play() needs a click unless the player is muted */}
      <button onClick={() => player.current?.play()}>Play</button>
    </>
  );
}
```

`embedUrl` is the embed URL you would put in the iframe:
`https://embed.wolvy.stream/VIDEO_ID/ACCOUNT_ID?vt=VIEWER_TOKEN`.

## `<WolvyPlayer>`

It renders one `<iframe>` with `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`,
`allowfullscreen` and `referrerpolicy="strict-origin-when-cross-origin"`, and never a `sandbox`
(those are fixed; DRM, fullscreen and the domain check need them). It creates the player when it
mounts, destroys it when it unmounts, and when `src` changes it renders a new iframe with a new
player, so the old video stops and the browser's history is not touched.

| Prop | |
| --- | --- |
| `src` | The embed URL. Required. While it is empty, no player is created |
| `ref` | Receives the player object (see below), or `null` while there is none |
| `title` | The iframe's accessible name. Default `"Wolvy video player"` |
| `origin` | The player's origin. Default: the origin of `src` |
| `timeout` | Milliseconds to wait for the player before `not_available`. Default 15000 |
| any other iframe attribute | `className`, `style`, `width`, `height`, `id`, `loading`, `onLoad`, `data-*`, `aria-*`… |

Event props. Each handler gets the event's data, then the player. They may change on every render
without creating a new player.

| Prop | Player event | Data |
| --- | --- | --- |
| `onReady` | ready | `{ currentTime, duration, paused, muted, volume, playbackRate }`, once per player |
| `onPlay` · `onPause` | play · pause | `{ currentTime }` |
| `onEnded` | ended | `{}` |
| `onSeeked` | seeked | `{ currentTime }` |
| `onTimeUpdate` | timeupdate | `{ currentTime, duration }` (at most 4 times a second) |
| `onProgress` | progress | `{ percent, seconds, duration }` |
| `onVolumeChange` | volumechange | `{ volume, muted }` |
| `onRateChange` | ratechange | `{ playbackRate }` |
| `onQualityChange` | qualitychange | `{ available, selected, playing }` |
| `onCaptionsChange` | captionschange | `{ active }` |
| `onFullscreenChange` | fullscreenchange | `{ fullscreen }` |
| `onError` | error | `{ code }` |

`onError` is called once per player: with the player's `error` event (`network_error`,
`playback_error`, `device_not_supported`…), or with `not_available` when the player never answered
(Player API off, not a Wolvy embed, or nothing within `timeout`), or with `invalid_element` when
`src` is not an http(s) URL (then the second argument is `null`).

`onReady` follows `player.ready()`, so it fires even when the player was already running before the
component connected to it (after hydration, for example).

With `loading="lazy"`, the player is created when the iframe loads, so a video further down the page
does not report `not_available` before the viewer scrolls to it.

## The player object

`ref.current` (or what `useWolvyPlayer` returns) is a `WolvyPlayer` from `@wolvy/player`. Every
method returns a promise:

`play()`, `pause()`, `seek(seconds)`, `mute()`, `unmute()`, `setVolume(0..1)`,
`setPlaybackRate(rate)`, `setQuality(height | "auto")`, `setCaptions(language | "off")`,
`getCurrentTime()`, `getDuration()`, `getPaused()`, `getMuted()`, `getVolume()`,
`getPlaybackRate()`, `getQualities()`, `getCaptions()`, `getProgress()`; and `ready()`, `on()`,
`off()`, `once()`. Do not call `destroy()` on it: the component does that.

What each method resolves with and every error code: the
[@wolvy/player README](https://www.npmjs.com/package/@wolvy/player) and
https://docs.wolvy.net/player-api/#methods.

## `useWolvyPlayer`: your own iframe

To render the iframe yourself, connect a player to it with the hook. Give the iframe the same three
attributes, and pass its `src` so a new URL gets a new player (on the same iframe, the new player is
created when the new page has loaded).

```jsx
import { useRef } from 'react';
import { useWolvyPlayer } from '@wolvy/player-react';

export function Lesson({ embedUrl }) {
  const frame = useRef(null);
  const player = useWolvyPlayer(frame, {
    src: embedUrl,
    onProgress: ({ percent }) => console.log(percent),
  });

  return (
    <>
      <iframe
        ref={frame}
        src={embedUrl}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <button disabled={!player} onClick={() => player.pause()}>Pause</button>
    </>
  );
}
```

`useWolvyPlayer(frameRef, options)` takes the same event props as the component, plus `src`,
`origin` and `timeout`, and returns the player or `null`.

## TypeScript

Types are included.

```tsx
import { useRef } from 'react';
import { WolvyPlayer } from '@wolvy/player-react';
import type { WolvyPlayerInstance, Progress, ErrorCode } from '@wolvy/player-react';

const player = useRef<WolvyPlayerInstance>(null);
<WolvyPlayer ref={player} src={url} onProgress={(data: Progress) => {}} />;
```

## Server rendering

Both files start with `'use client'`, so the component can be imported from a React Server
Component (Next.js App Router). On the server it renders the iframe only; the player is created in
the browser.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
