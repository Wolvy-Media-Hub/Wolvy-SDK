/*! @wolvy/player-react - https://docs.wolvy.net/player-api/ - Apache-2.0 */
// Types for index.js. index.d.cts is generated from this file by `npm run release`.
import type * as React from 'react';
import type {
  CaptionTrack,
  Captions,
  ErrorCode,
  EventMap,
  Instance,
  PlayerError,
  Progress,
  Qualities,
  State,
} from '@wolvy/player';

/** The player object (`WolvyPlayer` from @wolvy/player): what `ref` and `useWolvyPlayer()` give you. */
export type WolvyPlayerInstance = Instance;
export type { CaptionTrack, Captions, ErrorCode, EventMap, PlayerError, Progress, Qualities, State };

/** A handler: the event's data, then the player that sent it. */
export type WolvyPlayerHandler<Data> = (data: Data, player: WolvyPlayerInstance) => void;

/** One prop per player event. Each may change on every render without creating a new player. */
export interface WolvyPlayerEvents {
  /** The player takes commands from now on: its state, once per player (including a new one after `src` changes). */
  onReady?: WolvyPlayerHandler<State>;
  onPlay?: WolvyPlayerHandler<EventMap['play']>;
  onPause?: WolvyPlayerHandler<EventMap['pause']>;
  onEnded?: WolvyPlayerHandler<EventMap['ended']>;
  onSeeked?: WolvyPlayerHandler<EventMap['seeked']>;
  /** At most 4 times a second while playing. */
  onTimeUpdate?: WolvyPlayerHandler<EventMap['timeupdate']>;
  /** Share of the video actually played, each second counted once. For course completion. */
  onProgress?: WolvyPlayerHandler<EventMap['progress']>;
  onVolumeChange?: WolvyPlayerHandler<EventMap['volumechange']>;
  onRateChange?: WolvyPlayerHandler<EventMap['ratechange']>;
  onQualityChange?: WolvyPlayerHandler<EventMap['qualitychange']>;
  onCaptionsChange?: WolvyPlayerHandler<EventMap['captionschange']>;
  onFullscreenChange?: WolvyPlayerHandler<EventMap['fullscreenchange']>;
  /**
   * Once per player: the player's `error` event, or `not_available` when it never answered (Player
   * API off for the account, not a Wolvy embed, or no answer within `timeout`), or `invalid_element`
   * when `src` is not an http(s) URL (then `player` is null).
   */
  onError?: (data: { code: ErrorCode }, player: WolvyPlayerInstance | null) => void;
}

/** What `useWolvyPlayer()` takes besides the iframe. */
export interface WolvyPlayerOptions extends WolvyPlayerEvents {
  /** The embed URL in the iframe. A new value creates a new player (after the new page loads). */
  src?: string;
  /** The player's origin. Default: the origin of the iframe's src. */
  origin?: string;
  /** Milliseconds to wait for the player to answer before reporting `not_available`. Default 15000. */
  timeout?: number;
}

/** iframe attributes the component sets itself, or that would break the player. */
type ControlledAttributes = 'src' | 'srcDoc' | 'allow' | 'allowFullScreen' | 'referrerPolicy' | 'sandbox' | 'children';

/** Props of `<WolvyPlayer>`: the embed URL, the event props, and any other iframe attribute (className, style, width, loading...). */
export interface WolvyPlayerProps
  extends WolvyPlayerEvents,
    Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, ControlledAttributes | keyof WolvyPlayerEvents> {
  /** The embed URL: https://embed.wolvy.stream/<videoId>/<accountId>[?vt=...]. */
  src: string;
  origin?: string;
  timeout?: number;
  /** The iframe's accessible name. Default "Wolvy video player". */
  title?: string;
}

/**
 * The Wolvy embed iframe, with `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`,
 * `allowfullscreen` and `referrerpolicy="strict-origin-when-cross-origin"`, connected to a player.
 * `ref` receives the player object (null until it exists).
 */
export declare const WolvyPlayer: React.ForwardRefExoticComponent<
  WolvyPlayerProps & React.RefAttributes<WolvyPlayerInstance>
>;

/**
 * Connects a player to an iframe you render yourself (give it the same attributes as above).
 * Pass the iframe's `src` as `options.src` so a new URL gets a new player. Returns the player, or
 * null while there is none.
 */
export declare function useWolvyPlayer(
  frameRef: { readonly current: HTMLIFrameElement | null },
  options?: WolvyPlayerOptions,
): WolvyPlayerInstance | null;
