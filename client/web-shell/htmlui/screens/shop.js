// The card shop (scene 0x0e): its windows are CShop* tasks, not factory windows (the bridge's snapshot.tasks; their
// rects from read/shop.js), built from sprite plates, picture switches and texts, so deck.js's module draws them from
// their parts. The clerk, the player's avatar and the backdrop belong to the scene (engine); the swf buttons, pack art
// and the card window's per-frame card art stay engine-drawn under holes.
import deck from './deck.js';

// A CEasyTask lists its sprites as children but isn't their CTask parent_, so the bridge's hide by the task (htmlui.c
// walks parent_) misses them: hide() names the elements themselves, the task's parts and its controls (the pass table
// still lets the holes' card art through)
const elements = win => [...(win.controls || []).map(c => c.id),
  ...['sprites', 'labels', 'swfs'].flatMap(k => (win.parts?.[k] || []).map(e => e.id))];

export default {
  ...deck,
  hide: win => [...deck.hide(win), ...elements(win)],
  classes: ['CShopCategoryWindow', 'CShopCardWindow', 'CShopPackWindow', 'CShopAvatarWindow', 'CShopPricePlate',
    'CShopMileagePlate', 'CShopConfirmWindow'],
};
