// Usage examples for @wolvy/player, type-checked by test/types.test.mjs (tsc --noEmit). Never run.
// Each `@ts-expect-error` line must fail to compile; an unused one fails the test.
import WolvyPlayer from '@wolvy/player';
import type { ErrorCode, EventMap, EventName, Instance, MethodName, PlayerError, State } from '@wolvy/player';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
function expectTrue<T extends true>(): T | void {}

declare const frame: HTMLIFrameElement;

// Construction: an element or a selector, with or without options, with or without `new`.
const player = new WolvyPlayer('#lesson');
const second = new WolvyPlayer(frame, { origin: 'https://embed.wolvy.stream', timeout: 20000 });
const third = WolvyPlayer(frame);
expectTrue<Equal<typeof player, WolvyPlayer>>();
expectTrue<Equal<typeof third, Instance>>();
const element: HTMLIFrameElement = second.element;
// @ts-expect-error the target must be an iframe or a selector
new WolvyPlayer(42);
// @ts-expect-error unknown option
new WolvyPlayer(frame, { autoplay: true });

// Static fields.
expectTrue<Equal<typeof WolvyPlayer.EVENTS, EventName[]>>();
expectTrue<Equal<typeof WolvyPlayer.METHODS, MethodName[]>>();
expectTrue<Equal<typeof WolvyPlayer.version, string>>();
const inst: boolean = player instanceof WolvyPlayer;

// The 18 methods and what they resolve with.
expectTrue<Equal<ReturnType<typeof player.play>, Promise<true>>>();
expectTrue<Equal<ReturnType<typeof player.pause>, Promise<true>>>();
expectTrue<Equal<ReturnType<typeof player.seek>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.mute>, Promise<true>>>();
expectTrue<Equal<ReturnType<typeof player.unmute>, Promise<true>>>();
expectTrue<Equal<ReturnType<typeof player.setVolume>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.setPlaybackRate>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.setQuality>, Promise<number | 'auto'>>>();
expectTrue<Equal<ReturnType<typeof player.setCaptions>, Promise<string | null>>>();
expectTrue<Equal<ReturnType<typeof player.getCurrentTime>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.getDuration>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.getPaused>, Promise<boolean>>>();
expectTrue<Equal<ReturnType<typeof player.getMuted>, Promise<boolean>>>();
expectTrue<Equal<ReturnType<typeof player.getVolume>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.getPlaybackRate>, Promise<number>>>();
expectTrue<Equal<ReturnType<typeof player.getQualities>, Promise<WolvyPlayer.Qualities>>>();
expectTrue<Equal<ReturnType<typeof player.getCaptions>, Promise<WolvyPlayer.Captions>>>();
expectTrue<Equal<ReturnType<typeof player.getProgress>, Promise<WolvyPlayer.Progress>>>();
// Exactly the 18 documented methods, 13 events and the error codes, and every method name is a method.
expectTrue<
  Equal<
    MethodName,
    | 'play' | 'pause' | 'seek' | 'mute' | 'unmute' | 'setVolume' | 'setPlaybackRate' | 'setQuality' | 'setCaptions'
    | 'getCurrentTime' | 'getDuration' | 'getPaused' | 'getMuted' | 'getVolume' | 'getPlaybackRate'
    | 'getQualities' | 'getCaptions' | 'getProgress'
  >
>();
type MethodsExist = { [K in MethodName]: Instance[K] };
expectTrue<
  Equal<
    EventName,
    | 'ready' | 'play' | 'pause' | 'ended' | 'seeked' | 'timeupdate' | 'progress' | 'volumechange' | 'ratechange'
    | 'qualitychange' | 'captionschange' | 'fullscreenchange' | 'error'
  >
>();
expectTrue<
  Equal<
    ErrorCode,
    // The nine in the docs' table, then the SDK's own and the player's catch-alls.
    | 'not_available' | 'play_blocked' | 'invalid_argument' | 'not_supported' | 'not_ready' | 'timeout'
    | 'network_error' | 'playback_error' | 'device_not_supported'
    | 'destroyed' | 'invalid_element' | 'invalid_event' | 'failed' | 'play_failed'
  >
>();

async function lesson(): Promise<void> {
  const state: State = await player.ready();
  const duration: number = state.duration;
  await player.seek(120);
  await player.setVolume(0.5);
  await player.setPlaybackRate(1.5);
  const { available, selected, playing } = await player.getQualities();
  const heights: number[] = available;
  const picked: number | 'auto' = selected;
  const now: number | null = playing;
  if (available.includes(720)) await player.setQuality(720);
  await player.setQuality('auto');
  const captions = await player.getCaptions();
  if (captions.available.some((track) => track.language === 'ar')) await player.setCaptions('ar');
  await player.setCaptions('off');
  const { percent, seconds } = await player.getProgress();
  // @ts-expect-error seek takes seconds as a number
  await player.seek('120');
  // @ts-expect-error a quality is a height or "auto"
  await player.setQuality('hd');
  // @ts-expect-error play takes no argument
  await player.play(true);
  // @ts-expect-error not a method
  await player.fullscreen();
  // @ts-expect-error ping is internal
  await player.ping();
}

// Events: each listener gets that event's data; `this` is the player.
player
  .on('ready', ({ currentTime, duration, paused, muted, volume, playbackRate }) => {})
  .on('timeupdate', ({ currentTime, duration }) => {})
  .on('progress', function (data) {
    expectTrue<Equal<typeof data, WolvyPlayer.Progress>>();
    expectTrue<Equal<typeof this, WolvyPlayer>>();
  })
  .on('ended', () => {})
  .on('volumechange', ({ volume, muted }) => {})
  .on('ratechange', ({ playbackRate }) => {})
  .on('qualitychange', ({ available, selected, playing }) => {})
  .on('captionschange', ({ active }) => {
    const language: string | null = active;
  })
  .on('fullscreenchange', ({ fullscreen }) => {})
  .on('seeked', ({ currentTime }) => {})
  .on('play', ({ currentTime }) => {})
  .on('pause', ({ currentTime }) => {})
  .on('error', ({ code }) => {
    expectTrue<Equal<typeof code, ErrorCode>>();
    if (code === 'device_not_supported') return;
  });
const onProgress = (data: EventMap['progress']) => {};
player.once('progress', onProgress).off('progress', onProgress).off('timeupdate');
// @ts-expect-error not one of the 13 events
player.on('loaded', () => {});
// @ts-expect-error progress has no currentTime
player.on('progress', ({ currentTime }) => {});
// @ts-expect-error a listener is required
player.on('play');
player.destroy();

// Errors: a rejected promise carries a PlayerError with a code.
player.play().catch((error: PlayerError) => {
  expectTrue<Equal<typeof error.name, 'WolvyPlayerError'>>();
  if (error.code === 'play_blocked') return player.mute();
  // @ts-expect-error not an error code
  if (error.code === 'blocked') return;
  return undefined;
});

// The namespace types are reachable from the default import as well.
const options: WolvyPlayer.Options = { timeout: 5000 };
const rate: WolvyPlayer.PlaybackRate = 1.25;
// @ts-expect-error not a speed the player offers
const badRate: WolvyPlayer.PlaybackRate = 3;

// Loaded with a <script> tag instead: the global on window.
const fromWindow = new window.WolvyPlayer('#lesson');
expectTrue<Equal<typeof fromWindow, WolvyPlayer>>();

export {};
