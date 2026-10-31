// The card shop (scene 0x0e): rects and state of its CShop* tasks (CEasyTasks, not elements: no position of their own),
// over read.js's helpers. Offsets: htmlui-shop-fields.md §0-1 (shared notes), from the exe functions named there (the
// src/shop decomp is unfinished). The art comes from the tasks' and their controls' parts (screens/shop.js draws them
// as screens/deck.js does); the sizes below are the art's (shop_win_01_c01 512 x 512, shop_money_01_c01 256 x 128,
// shop_win_01_c00 512 x 256), clipped to the 1024 x 768 screen.
export default h => {
  const { u8, u32, i32, f32, ptr, vec, locked } = h;
  const SCENE_SHOP = 0x0e;
  // CSceneMng::s_instance (yo2SceneManager.h:77): sceneId_ +0x7c. The shop's tasks outlive it under the pack scenes
  // pushed over it (0x19 / 0x17 / 0x18): gate on the id, not on the tasks
  const inShop = () => { const m = u32(0x01271790); return !!m && i32(m + 0x7c) === SCENE_SHOP; };
  const base = (t, at) => { const e = ptr(t + at); return e ? { x: f32(e + 0xc8), y: f32(e + 0xcc) } : { x: 0, y: 0 }; };   // a base element's world position
  // shown: in the shop, and no lock bit on the task or above (the shop hides with lockFlags |= 2, §0.2); a CEasyTask
  // isn't a CElement, so the base reader's disp_ (+0xc4) is some other field of it
  // alpha 1: a CEasyTask has no CElement colour (read.js's alpha() reads garbage there: the root came out opacity 0)
  const gate = (t, r) => ({ ...r, alpha: 1, shown: inShop() && !locked(t) });
  // the item windows: frame (280, 84) 512 x 512, title band (280, 3), prev arrow at x 264, MP plate (795, 390) to the edge
  const ITEMS = { x: 264, y: 0, w: 760, h: 600 };
  // CShopCardWindow: page 0x258 of the cards vector 0x248 (ShopItem 0x14), 10 a page; the card art is drawn each frame
  // while 0x245 is set (onMain @0xaf0950), not an element: holes at (301 + 98 col, 140 + 240 row), 80 x 116
  const cardHoles = t => {
    if (!u8(t + 0x245)) return [];
    const n = vec(t + 0x248, 0x14).length - 10 * i32(t + 0x258);
    return Array.from({ length: Math.max(0, Math.min(10, n)) }, (_, i) =>
      ({ x: 301 + 98 * (i % 5) - ITEMS.x, y: 140 + 240 * Math.floor(i / 5) - ITEMS.y, w: 80, h: 116 }));
  };
  return {
    tasks: {
      // frame (280, 84), intro (270, 70), MP plate (795, 390), leave button (795, 540): decomp 0xae61c0. chosen 0x130
      CShopCategoryWindow: t => gate(t, { x: 270, y: 70, w: 754, h: 530, chosen: i32(t + 0x130) }),
      CShopCardWindow: t => gate(t, { ...ITEMS, page: i32(t + 0x258), maxPage: i32(t + 0x25c), holes: cardHoles(t) }),
      CShopPackWindow: t => gate(t, { ...ITEMS, page: i32(t + 0x2b8), maxPage: i32(t + 0x2bc) }),
      CShopAvatarWindow: t => gate(t, { ...ITEMS, page: i32(t + 0x258), maxPage: i32(t + 0x25c) }),
      // the plate's base element 0x80 at its slot; one slot is 99 x 234 (col / row pitch, @0xaf5730). state 0x8c
      // (0 up, 1 hover, 2 selected), price 0xb8 MP, rate 0xc4 (pack completion %, -1 unset)
      CShopPricePlate: t => gate(t, { ...base(t, 0x80), w: 99, h: 234, state: i32(t + 0x8c), price: i32(t + 0xb8), rate: f32(t + 0xc4) }),
      // base 0x78 at (795, 390); top 0xa8 = the player's MP, bottom 0xac = the cart total (@0xaeade0 / @0xaeb130)
      CShopMileagePlate: t => gate(t, { ...base(t, 0x78), w: 229, h: 128, mp: i32(t + 0xa8), total: i32(t + 0xac) }),
      // base 0x78 at (300, 330, z 51003); result 0x170 (-1, 0 OK, 1 Cancel), total 0x174 MP (@0xaed680 / @0xaed710)
      CShopConfirmWindow: t => gate(t, { ...base(t, 0x78), w: 512, h: 256, result: i32(t + 0x170), total: i32(t + 0x174) }),
    },
  };
};
