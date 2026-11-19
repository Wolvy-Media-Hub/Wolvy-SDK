# @wolvy/player

Control the [Wolvy](https://wolvy.net) video player embedded on your page, and hear what it does:
play, pause, seek, volume, speed, quality, captions, and events such as `timeupdate`, `ended` and
`progress` (how much of the video was really watched, for course completion).

This is the Wolvy Player API SDK. Full guide: **https://docs.wolvy.net/player-api/**

Using React? [`@wolvy/player-react`](https://www.npmjs.com/package/@wolvy/player-react) wraps this
package in a component.

## Before you start

1. **Switch the Player API on** for your account: in the dashboard, open Settings → Player and turn on
   Player API. It is off by default, and while it is off the player ignores every message (the SDK
   then reports `not_available`).
2. **Embed as usual.** Nothing is added to the embed URL:

```html
<iframe
  id="lesson"
  src="https://embed.wolvy.stream/VIDEO_ID/ACCOUNT_ID?vt=VIEWER_TOKEN"
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

## Install

```sh
npm install @wolvy/player
```

Or without npm, from Wolvy's own host. It is the same file: for a given version, the
`wolvy-player.js` in this package and the one at `https://sdk.wolvy.net/player/<version>/` are the
same bytes.

```html
<!-- newest 1.x -->
<script src="https://sdk.wolvy.net/player/v1/wolvy-player.js"></script>
<!-- or one release, never changes -->
<script src="https://sdk.wolvy.net/player/1.0.0/wolvy-player.js"></script>
```

## Example

```js
import WolvyPlayer from '@wolvy/player'; // CommonJS: const WolvyPlayer = require('@wolvy/player');

const player = new WolvyPlayer('#lesson'); // the iframe, or a CSS selector

player.on('ready', ({ duration }) => console.log('ready,', duration, 'seconds'));

// Course completion: percent counts each second played once, so skipping does not reach 100.
player.on('progress', ({ percent }) => {
  if (percent >= 90) fetch('/lessons/42/complete', { method: 'POST' });
});

// play() needs a click unless the player is muted.
document.querySelector('#play').addEventListener('click', () => {
  player.play().catch((error) => console.warn(error.code));
});

// When you remove the iframe:
// player.destroy();
```

- Every method returns a promise. Calls made before the player is ready wait for it.
- `player.ready()` resolves once the player takes commands, with its state.
- `player.on(event, fn)`, `player.off(event, fn)`, `player.once(event, fn)`.
- `player.destroy()` stops listening and rejects pending calls with `destroyed`.
- `new WolvyPlayer(iframe, { origin, timeout })`: `origin` defaults to the origin of the iframe's
  `src`; `timeout` (default 15000 ms) is how long to wait for the player before `not_available`.
- One `WolvyPlayer` per iframe. Importing the package also defines `window.WolvyPlayer`.

## Methods

| Method | Resolves with | Notes |
| --- | --- | --- |
| `play()` | `true` | `play_blocked` when the browser wants a click first |
| `pause()` | `true` | |
| `seek(seconds)` | the position it moved to | `not_ready` before the video has loaded |
| `mute()` · `unmute()` | `true` | |
| `setVolume(volume)` | the volume | 0 to 1; does not unmute |
| `setPlaybackRate(rate)` | the rate | 0.5, 0.75, 1, 1.25, 1.5 or 2 |
| `setQuality(height)` | the height, or `"auto"` | a height from `getQualities()`, or `"auto"`; `not_supported` on Safari, iPhone and iPad |
| `setCaptions(language)` | the language, or `null` | a code from `getCaptions()`, or `"off"` |
| `getCurrentTime()` | seconds | |
| `getDuration()` | seconds | 0 until the video has loaded |
| `getPaused()` · `getMuted()` | `true` or `false` | |
| `getVolume()` | 0 to 1 | |
| `getPlaybackRate()` | e.g. `1.5` | |
| `getQualities()` | `{ available, selected, playing }` | `available` is empty on Safari, iPhone and iPad |
| `getCaptions()` | `{ available: [{ language, label }], active }` | |
| `getProgress()` | `{ percent, seconds, duration }` | |

## Events

| Event | Data |
| --- | --- |
| `ready` | `{ currentTime, duration, paused, muted, volume, playbackRate }` |
| `play` · `pause` | `{ currentTime }` |
| `ended` | `{}` |
| `seeked` | `{ currentTime }` |
| `timeupdate` | `{ currentTime, duration }` (at most 4 times a second) |
| `progress` | `{ percent, seconds, duration }` |
| `volumechange` | `{ volume, muted }` |
| `ratechange` | `{ playbackRate }` |
| `qualitychange` | `{ available, selected, playing }` |
| `captionschange` | `{ active }` |
| `fullscreenchange` | `{ fullscreen }` |
| `error` | `{ code }` |

Events fire whoever caused them: your page, the viewer using the player's controls, or the player.
`ready` is sent once; to wait for readiness, use `player.ready()`, which also works when the player
was already running before you created the `WolvyPlayer`.

## Errors

A rejected promise carries an `Error` named `WolvyPlayerError` with a `code`:
`not_available`, `play_blocked`, `invalid_argument`, `not_supported`, `not_ready`, `timeout`,
`network_error`, `playback_error`, `device_not_supported`, and from the SDK itself `destroyed`,
`invalid_element` (thrown by the constructor), `invalid_event` (thrown by `on()`) and `failed`.
What each one means: https://docs.wolvy.net/player-api/#errors

## TypeScript

Types are included: the class, the 18 methods, the 13 events with their data, and the error codes.

```ts
import WolvyPlayer from '@wolvy/player';
import type { Progress, ErrorCode, PlayerError } from '@wolvy/player';

const player: WolvyPlayer = new WolvyPlayer('#lesson');
player.on('progress', (data: Progress) => {});
```

Loading the script from `sdk.wolvy.net` instead? Install this package for its types and add
`/// <reference types="@wolvy/player" />`; in a module, use `window.WolvyPlayer`.

## What it cannot do

The API is control only. No method returns, and no event carries, a DRM licence, a token, a session
or viewer id, a video URL, a key or the watermark text, and it cannot turn off the watermark, the
domain rules, App-Only mode or DRM. The player only answers the page that embeds it, and this SDK
only accepts messages from the player's origin and the iframe's own window.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
