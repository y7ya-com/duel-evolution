// Character creation in Svelte (supersedes screens/avatar.js once its flip pairs match: ?HTML_SVELTE=avatar).
// Pass mode: the game takes the input; hover and the chosen looks come from the snapshot (the shown art's column).
import { screen } from './screen.svelte.js';
import AvatarSwitch from './avatar/AvatarSwitch.svelte';

export default screen({ CWindowDialogAvatarSwitch: AvatarSwitch }, {
  mode: 'pass',
  clip: false,   // a 336 x 550 window at 0, 0 whose controls sit right of it
  // the bust is built from parts each frame (CAvatarTexMaker): a plain CElement under the window, if it has one, passes
  passthrough: x => x.cls === 'CElement',
});
