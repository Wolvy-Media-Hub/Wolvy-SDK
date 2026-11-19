// CommonJS usage, type-checked under module nodenext by test/types.test.mjs. Never run.
import WolvyPlayer = require('@wolvy/player');
import { WolvyPlayer as Component, useWolvyPlayer } from '@wolvy/player-react';
import type { WolvyPlayerInstance } from '@wolvy/player-react';

const player: WolvyPlayerInstance = new WolvyPlayer('#lesson');
player.on('progress', ({ percent }) => percent >= 90 && player.pause());
const progress: Promise<WolvyPlayer.Progress> = player.getProgress();
const hook: typeof useWolvyPlayer = useWolvyPlayer;
const component: typeof Component = Component;
