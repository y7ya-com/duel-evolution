// The card shop (scene 0x0e): its windows are CShop* tasks, not factory windows (the bridge's snapshot.tasks; their
// rects from read/shop.js), built from sprite plates, picture switches and texts, so deck.js's module draws them from
// their parts. The clerk, the player's avatar and the backdrop belong to the scene (engine); the swf buttons, pack art
// and the card window's per-frame card art stay engine-drawn under holes.
import deck from './deck.js';

export default {
  ...deck,
  classes: ['CShopCategoryWindow', 'CShopCardWindow', 'CShopPackWindow', 'CShopAvatarWindow', 'CShopPricePlate',
    'CShopMileagePlate', 'CShopConfirmWindow'],
};
