export const SHOP_CLASSES = ['CShopCategoryWindow', 'CShopCardWindow', 'CShopPackWindow', 'CShopAvatarWindow',
  'CShopPricePlate', 'CShopMileagePlate', 'CShopConfirmWindow'];

// Existing hosted htmlui.json predates the shop port. Ship its crisp HTML skin by
// default; the normal HTML_UI query switch and explicit shop:false still disable it.
export const htmlDefaults = (defaults = {}) => [...new Set([...(defaults.on || []), 'CWindowModelDuel', ...(defaults.shop === false ? [] : SHOP_CLASSES)])];
