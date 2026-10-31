// Select Player in Svelte (supersedes screens/select.js once its flip pairs match: ?HTML_SVELTE=select). The window is
// the generic controls; the waist-up bust of the hovered character stays the engine's: its sprites hang off the scene
// (CWaistUpAvatar), the parts it is composed from each frame (CAvatarTexMaker) off the window's one plain CElement
// child, so both pass (hidden with the window, the bust stops animating: live, frozen on hover).
import { screen } from './screen.svelte.js';
import Generic from './select/Generic.svelte';

export default screen({ CWindowPlayerSelect: Generic }, {
  mode: 'pass',
  passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement',
});
