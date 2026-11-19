// Usage examples for @wolvy/player-react, type-checked by test/types.test.mjs (tsc --noEmit). Never run.
import { useCallback, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { WolvyPlayer, useWolvyPlayer } from '@wolvy/player-react';
import type { ErrorCode, Progress, WolvyPlayerInstance, WolvyPlayerProps } from '@wolvy/player-react';
import Player from '@wolvy/player';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
function expectTrue<T extends true>(): T | void {}

// The instance type is the class from @wolvy/player.
expectTrue<Equal<WolvyPlayerInstance, Player>>();

export function Lesson({ embedUrl, lessonId }: { embedUrl: string; lessonId: string }) {
  const player = useRef<WolvyPlayerInstance>(null);
  const [percent, setPercent] = useState(0);
  const [failure, setFailure] = useState<ErrorCode | null>(null);

  return (
    <div>
      <WolvyPlayer
        ref={player}
        src={embedUrl}
        className="lesson-video"
        style={{ width: '100%', aspectRatio: '16 / 9', border: 0 }}
        loading="lazy"
        title={`Lesson ${lessonId}`}
        timeout={20000}
        onLoad={(event) => event.currentTarget.contentWindow}
        onReady={(state, instance) => {
          const duration: number = state.duration;
          void instance.seek(Number(localStorage.getItem(lessonId) || 0));
        }}
        onTimeUpdate={({ currentTime }) => localStorage.setItem(lessonId, String(Math.floor(currentTime)))}
        onProgress={(data) => {
          expectTrue<Equal<typeof data, Progress>>();
          setPercent(data.percent);
        }}
        onEnded={() => setPercent(100)}
        onError={({ code }, instance) => {
          const maybe: WolvyPlayerInstance | null = instance;
          setFailure(code);
        }}
        onPlay={({ currentTime }) => {}}
        onPause={({ currentTime }) => {}}
        onSeeked={({ currentTime }) => {}}
        onVolumeChange={({ volume, muted }) => {}}
        onRateChange={({ playbackRate }) => {}}
        onQualityChange={({ available, selected, playing }) => {}}
        onCaptionsChange={({ active }) => {}}
        onFullscreenChange={({ fullscreen }) => {}}
      />
      <button onClick={() => player.current?.play().catch((error) => console.warn(error.code))}>Play</button>
      <button onClick={() => player.current?.seek(0)}>Restart</button>
      <progress max={100} value={percent} />
      {failure && <p>{failure}</p>}
    </div>
  );
}

// Only `src` is required. A ref callback receives the player or null.
export const Minimal = () => (
  <WolvyPlayer
    src="https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI="
    ref={(instance) => {
      const value: WolvyPlayerInstance | null = instance;
    }}
  />
);

// Attributes the component owns, or that would break the player, are not accepted.
// @ts-expect-error src is required
export const NoSrc = () => <WolvyPlayer />;
// @ts-expect-error no sandbox: DRM and fullscreen do not work in a sandboxed frame
export const Sandboxed = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" sandbox="allow-scripts" />;
// @ts-expect-error allow is fixed by the component
export const Allow = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" allow="autoplay" />;
// @ts-expect-error referrerPolicy is fixed by the component
export const Referrer = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" referrerPolicy="no-referrer" />;
// @ts-expect-error onProgress gets the player's progress, not a DOM event
export const DomEvent = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" onProgress={(event: SyntheticEvent) => {}} />;
// @ts-expect-error onProgress data has no currentTime
export const WrongData = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" onProgress={({ currentTime }) => {}} />;
// @ts-expect-error the ref holds the player, not the iframe
export const IframeRef = () => <WolvyPlayer src="https://embed.wolvy.stream/x/NDI=" ref={useRef<HTMLIFrameElement>(null)} />;

// The hook, with an iframe you render yourself.
export function OwnFrame({ embedUrl }: { embedUrl: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onProgress = useCallback(({ percent }: Progress) => {}, []);
  const player = useWolvyPlayer(frame, { src: embedUrl, onProgress, onReady: (state) => {} });
  expectTrue<Equal<typeof player, WolvyPlayerInstance | null>>();
  useWolvyPlayer(frame);
  return (
    <iframe
      key={embedUrl}
      ref={frame}
      src={embedUrl}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      onClick={() => player?.pause()}
    />
  );
}

const props: WolvyPlayerProps = { src: 'https://embed.wolvy.stream/x/NDI=', id: 'lesson' };
