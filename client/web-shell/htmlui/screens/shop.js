// The card shop (scene 0x0e): its windows are CShop* tasks, not factory windows (the bridge's snapshot.tasks; their
// rects from read/shop.js), built from sprite plates, picture switches and texts, so deck.js's module draws them from
// their parts. The clerk, the player's avatar and the backdrop belong to the scene (engine); the swf buttons, pack art
// and the card window's per-frame card art stay engine-drawn under holes.
// The Avatar Parts category (CShopAvatarWindow) is the Cosmetic Boxes shop (cosmetics/boxes.js): the server sells no
// wearables, so its list is empty; the boxes draw inside its frame (the engine's), its Confirm pill becomes Wardrobe,
// and while it is open the MP plate (CShopMileagePlate) shows the wallet: total, earned (what boxes take), starter.
import deck from './deck.js';
import { mountBoxes, drawWallet, drawCategoryLabel, PILLS } from '../cosmetics/boxes.js';

// A CEasyTask lists its sprites as children but isn't their CTask parent_, so the bridge's hide by the task (htmlui.c
// walks parent_) misses them: hide() names the elements themselves, the task's parts and its controls (the pass table
// still lets the holes' card art through)
const elements = win => [...(win.controls || []).map(c => c.id),
  ...['sprites', 'labels', 'swfs'].flatMap(k => (win.parts?.[k] || []).map(e => e.id))];

export const AVATAR = 'CShopAvatarWindow', PLATE = 'CShopMileagePlate';
// the live box shop and the MP plate (either may mount first): { ctl, shown, view } and { win, root, api, st }
const boxes = { ctl: null, shown: false, view: 'showcase', plate: null };
const active = () => !!boxes.ctl && boxes.shown;
// a control's screen point inside a pill (its texts: the ShadowText at x, y; its text child at wx, wy)
const inPill = (c, r) => { const x = c.wx || c.x, y = c.wy || c.y; return x >= r.x && x < r.x + r.w && y >= r.y - 4 && y < r.y + r.h; };
/** What deck.js draws of a window while the boxes are open: not the Confirm label (Wardrobe is drawn over its pill),
 *  not Back's on the contents sheet (Back to box), none of the MP plate's texts (the wallet replaces them). */
export function strip(win, on = active(), view = boxes.view) {
  if (!on) return win;
  if (win.cls === AVATAR) return { ...win, controls: win.controls.filter(c => !inPill(c, PILLS.wardrobe) && !(view === 'contents' && inPill(c, PILLS.back))) };
  if (win.cls === PLATE) return { ...win, controls: [] };
  return win;
}
function redrawPlate() {
  const P = boxes.plate;
  if (!P) return;
  deck.update(strip(P.win), null, P.root, P.api, P.st);
  if (active()) drawWallet(P.root, boxes.ctl.wallet);
  else P.root.querySelector(':scope > .bx-wallet')?.remove();
}

export default {
  ...deck,
  hide: win => [...deck.hide(win), ...elements(win)],
  classes: ['CShopCategoryWindow', 'CShopCardWindow', 'CShopPackWindow', AVATAR, 'CShopPricePlate', PLATE, 'CShopConfirmWindow'],
  mount(win, root, api) {
    const st = deck.mount(win, root, api);
    if (win.cls === AVATAR) {
      st.win = win;
      boxes.shown = !!win.shown;
      boxes.ctl = st.boxes = mountBoxes(root, {
        onWallet: () => redrawPlate(),
        onView: v => { boxes.view = v; deck.update(strip(st.win), null, root, api, st); },
      });
    }
    if (win.cls === PLATE) boxes.plate = { win, root, api, st };
    return st;
  },
  update(win, prev, root, api, st) {
    if (win.cls === AVATAR) {
      st.win = win;
      if (!!win.shown !== boxes.shown) { boxes.shown = !!win.shown; queueMicrotask(redrawPlate); }
    }
    if (win.cls === PLATE) { Object.assign(boxes.plate ||= { root, api, st }, { win, root, api, st }); }
    deck.update(strip(win), prev, root, api, st);
    if (win.cls === PLATE && active()) drawWallet(root, boxes.ctl.wallet);
    if (win.cls === 'CShopCategoryWindow') {   // the Avatar Parts banner opens the boxes now: say so
      const c = win.controls.find(k => k.shown && k.name === 'アバターアイテムボタン');
      drawCategoryLabel(root, c && { x: (c.wx || c.x) - win.x, y: (c.wy || c.y) - win.y });
    }
  },
  unmount(root, st) {
    deck.unmount(root, st);
    if (st.boxes) {
      st.boxes.destroy();
      if (boxes.ctl === st.boxes) Object.assign(boxes, { ctl: null, shown: false, view: 'showcase' });
      redrawPlate();
    }
    if (boxes.plate?.st === st) boxes.plate = null;
  },
};
