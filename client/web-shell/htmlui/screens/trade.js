// Trade, TP and present (scenes 0x26 / 0x28 / 0x27): the same building blocks as the deck editor (card areas, card
// rows, the trunk, the detail panel: those two are deck.js's), so the same module draws them from their parts. Its
// state is shared, so a card dragged out of the trunk shows through these windows too. Card faces (data/CARD/*) and the
// ready lamps (swf) stay engine-drawn.
import deck from './deck.js';

export default {
  ...deck,
  classes: ['CWindowModelTrade', 'CWindowModelTp', 'CWindowModelPresent', 'CWindowTaskCardArea'],
};
