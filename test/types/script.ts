// A plain script (no import or export) on a page that loads https://sdk.wolvy.net/player/v1/wolvy-player.js
// and has @wolvy/player installed for its types only. Type-checked by test/types.test.mjs. Never run.
/// <reference types="@wolvy/player" />

const lesson = new WolvyPlayer('#lesson');
const sameClass: WolvyPlayer = new window.WolvyPlayer('#lesson');
lesson.on('progress', ({ percent }: WolvyPlayer.Progress) => {
  if (percent >= 90) void lesson.pause();
});
