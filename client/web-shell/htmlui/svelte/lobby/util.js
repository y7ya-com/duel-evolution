// The lobby windows' shared bits: a control's look from its snapshot state, and a text box as an attachment
import { textBox } from '../../controls/basic.js';

export const look = c => c.state === 'disabled' ? 'disabled' : c.state === 'pressed' ? 'pressed' : c.state === 'hover' ? 'hover' : 'normal';
export const top = c => !c.parent;
// the look the engine shows: the one of a picture's sprites that is drawn
export const shownArt = c => Object.values(c.art || {}).find(s => s?.shown) || c.art?.normal;
// controls/basic.js textBox (Arial, spaced as the game) in an {@attach}: rebuilt when what it reads changes
export const text = (s, opts, style = {}) => el => {
  const d = textBox(el, s, opts);
  Object.assign(d.style, style);
  return () => d.remove();
};
// a ShadowText: white, outlined as controls/skin.js's captions
export const OUTLINED = { textShadow: '1px 0 #4a4a4a, -1px 0 #4a4a4a, 0 1px #4a4a4a, 0 -1px #4a4a4a' };
export const shadowText = c => text(c.text, { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, white: true, color: [1, 1, 1, 1] }, OUTLINED);
