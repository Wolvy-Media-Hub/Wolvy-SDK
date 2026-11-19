/*! Wolvy Player SDK - https://docs.wolvy.net/player-api/ */
// Types for wolvy-player.js, the same file that is served at https://sdk.wolvy.net/player/.
// The protocol, methods, events and error codes are described at https://docs.wolvy.net/player-api/.
// A method or event added to wolvy-player.js has to be added here too.

declare namespace WolvyPlayer {
  /** The second argument of `new WolvyPlayer(iframe, options)`. */
  interface Options {
    /** The player's origin. Default: the origin of the iframe's `src` (https://embed.wolvy.stream). */
    origin?: string;
    /** Milliseconds to wait for the player to answer before `ready()` rejects with `not_available`. Default 15000. */
    timeout?: number;
  }

  /** The player's state when it became ready: what `ready()` resolves with and the `ready` event carries. */
  interface State {
    currentTime: number;
    duration: number;
    paused: boolean;
    muted: boolean;
    volume: number;
    playbackRate: number;
  }

  /** What `getQualities()` resolves with and the `qualitychange` event carries. */
  interface Qualities {
    /** Heights on offer, highest first, e.g. [1080, 720, 480]. Empty on Safari, iPhone and iPad. */
    available: number[];
    /** The height picked, or "auto". */
    selected: number | 'auto';
    /** The height playing now, or null before the first frame. */
    playing: number | null;
  }

  interface CaptionTrack {
    /** Language code, e.g. "ar". */
    language: string;
    label: string;
  }

  /** What `getCaptions()` resolves with. */
  interface Captions {
    available: CaptionTrack[];
    /** The language shown, or null when captions are off. */
    active: string | null;
  }

  /** How much of the video was played. What `getProgress()` resolves with and the `progress` event carries. */
  interface Progress {
    /** Share of the video's seconds that were played, each second counted once, 0 to 100. */
    percent: number;
    /** Number of distinct seconds played. */
    seconds: number;
    /** The video's length in seconds. */
    duration: number;
  }

  /** The speeds in the player's own menu: the only values `setPlaybackRate()` accepts. */
  type PlaybackRate = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

  /** Every event, with the data its listeners receive. */
  interface EventMap {
    /** The player accepts commands from now on. Sent once; `ready()` is the reliable way to wait for it. */
    ready: State;
    play: { currentTime: number };
    pause: { currentTime: number };
    ended: Record<string, never>;
    /** After a jump, whoever asked for it. */
    seeked: { currentTime: number };
    /** At most 4 times a second while playing. */
    timeupdate: { currentTime: number; duration: number };
    /** As the share played changes, at most once a second, and once more at the end. */
    progress: Progress;
    volumechange: { volume: number; muted: boolean };
    ratechange: { playbackRate: number };
    qualitychange: Qualities;
    /** A language code, or null when captions are off. */
    captionschange: { active: string | null };
    fullscreenchange: { fullscreen: boolean };
    /** The player could not play. A code only. */
    error: { code: ErrorCode };
  }

  /** The 13 event names, as in `WolvyPlayer.EVENTS`. */
  type EventName = keyof EventMap;

  /** The 18 method names, as in `WolvyPlayer.METHODS`. */
  type MethodName =
    | 'play'
    | 'pause'
    | 'seek'
    | 'mute'
    | 'unmute'
    | 'setVolume'
    | 'setPlaybackRate'
    | 'setQuality'
    | 'setCaptions'
    | 'getCurrentTime'
    | 'getDuration'
    | 'getPaused'
    | 'getMuted'
    | 'getVolume'
    | 'getPlaybackRate'
    | 'getQualities'
    | 'getCaptions'
    | 'getProgress';

  /** The `code` of a WolvyPlayerError, and of the `error` event. */
  type ErrorCode =
    /** The player never answered: Player API off for the account, not a Wolvy player in the iframe, or still loading after `timeout`. */
    | 'not_available'
    /** The player was ready earlier but did not answer this call (8 seconds), usually because the iframe was reloaded or removed. */
    | 'timeout'
    /** destroy() was called on this WolvyPlayer. */
    | 'destroyed'
    /** play(): the browser wants a click first. Mute first, or call play() from a click handler. */
    | 'play_blocked'
    /** play(): playback failed to start for another reason. */
    | 'play_failed'
    /** A setter got a value of the wrong type, or one that is not on offer. */
    | 'invalid_argument'
    /** setQuality(): this device's player chooses the quality itself (Safari, iPhone, iPad). */
    | 'not_supported'
    /** seek(): the video's length is not known yet. */
    | 'not_ready'
    /** The error event, then every control method: the video could not be loaded. */
    | 'network_error'
    /** The error event, then every control method: the video could not be played. */
    | 'playback_error'
    /** The error event: App-Only mode is on and this browser has no hardware DRM. */
    | 'device_not_supported'
    /** Thrown by the constructor: no <iframe>, or no http(s) URL in its src. */
    | 'invalid_element'
    /** Thrown by on(): not one of the 13 event names. */
    | 'invalid_event'
    /** The player failed in a way it did not name. */
    | 'failed';

  /** What a rejected promise carries, and what the constructor and on() throw. */
  interface PlayerError extends Error {
    name: 'WolvyPlayerError';
    code: ErrorCode;
  }

  /** A listener for one event. `this` is the player. */
  type Listener<E extends EventName> = (this: WolvyPlayer, data: EventMap[E]) => void;

  /** The player object, the same type as `WolvyPlayer`. Named for `import type { Instance }`. */
  type Instance = WolvyPlayer;

  /** The class: `new WolvyPlayer(iframe)` (or without `new`), and its static fields. */
  interface Constructor {
    /**
     * Connect to the Wolvy player in an iframe.
     * @param target The <iframe> element, or a CSS selector that matches one.
     * @throws {PlayerError} `invalid_element` when there is no such iframe, or its src is not an http(s) URL.
     */
    new (target: HTMLIFrameElement | string, options?: Options): WolvyPlayer;
    (target: HTMLIFrameElement | string, options?: Options): WolvyPlayer;
    readonly prototype: WolvyPlayer;
    /** The 13 event names. */
    readonly EVENTS: EventName[];
    /** The 18 method names. */
    readonly METHODS: MethodName[];
    /** This file's version, e.g. "1.0.0". */
    readonly version: string;
  }
}

/** One Wolvy player, in one iframe. Every method returns a promise and waits for the player to be ready. */
interface WolvyPlayer {
  /** The iframe this object talks to. */
  readonly element: HTMLIFrameElement;

  /** Resolves once the player takes commands, with its state. Rejects with `not_available`, an `error` event's code, or `destroyed`. */
  ready(): Promise<WolvyPlayer.State>;
  /** Listen to an event. Throws `invalid_event` for a name that is not one of the 13. */
  on<E extends WolvyPlayer.EventName>(event: E, listener: WolvyPlayer.Listener<E>): this;
  /** Stop listening: one listener, or every listener of the event when none is given. */
  off<E extends WolvyPlayer.EventName>(event: E, listener?: WolvyPlayer.Listener<E>): this;
  /** Listen to the next occurrence of an event only. */
  once<E extends WolvyPlayer.EventName>(event: E, listener: WolvyPlayer.Listener<E>): this;
  /** Stop listening to the player and reject pending calls with `destroyed`. Call it when the iframe is removed. */
  destroy(): void;

  /** Rejects with `play_blocked` when the browser wants a click first. */
  play(): Promise<true>;
  pause(): Promise<true>;
  /** Seconds, 0 or more; past the end is moved to the end. Resolves with the position it moved to. Rejects with `not_ready` before the video has loaded. */
  seek(seconds: number): Promise<number>;
  mute(): Promise<true>;
  unmute(): Promise<true>;
  /** 0 to 1. Does not unmute. */
  setVolume(volume: number): Promise<number>;
  /** One of 0.5, 0.75, 1, 1.25, 1.5, 2 (see `PlaybackRate`); anything else rejects with `invalid_argument`. */
  setPlaybackRate(rate: number): Promise<number>;
  /** A height from `getQualities().available`, or "auto". Rejects with `not_supported` on Safari, iPhone and iPad. */
  setQuality(height: number | 'auto'): Promise<number | 'auto'>;
  /** A language code from `getCaptions().available`, or "off". Resolves with the language, or null when off. */
  setCaptions(language: 'off' | (string & {})): Promise<string | null>;

  /** Seconds. */
  getCurrentTime(): Promise<number>;
  /** Seconds; 0 until the video has loaded. */
  getDuration(): Promise<number>;
  getPaused(): Promise<boolean>;
  getMuted(): Promise<boolean>;
  /** 0 to 1. */
  getVolume(): Promise<number>;
  getPlaybackRate(): Promise<number>;
  getQualities(): Promise<WolvyPlayer.Qualities>;
  getCaptions(): Promise<WolvyPlayer.Captions>;
  getProgress(): Promise<WolvyPlayer.Progress>;
}

declare const WolvyPlayer: WolvyPlayer.Constructor;

export = WolvyPlayer;
export as namespace WolvyPlayer;

declare global {
  interface Window {
    /** Defined by wolvy-player.js, whether it is loaded with a <script> tag or imported. */
    WolvyPlayer: WolvyPlayer.Constructor;
  }
}
