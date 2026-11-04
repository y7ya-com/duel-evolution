// The duel's question dialogs (src/duel/SceneDialogs.h; CUGDialogBase: src/System/window/yo2UGDialogBase.h): the fade /
// drag state their bases keep (screens/duel.js cuts holes where a dialog draws its own sprites: coins, dice faces,
// ritual stars, all drawn straight to the device at the window's depth, never as elements), and the icon controls of
// the command / attribute / type lists (CWindowTaskImage, src/System/window/yo2WindowImage.h), which stay engine-drawn
// under a hole. Every offset is pinned by YO2_AT in the header named beside it.
export default h => {
  const { i32, u8, rectF, rectI, str, generic } = h;
  // the three bases' fade / centre / box: CUGDialogBase and CUGDialogBaseHP keep them at the same offsets (fade_ 0x3f0,
  // cx_ 0x3f8, cy_ 0x3fc, boxW_ 0x408, boxH_ 0x40c), CUDialogBaseOk 0x18 further on (fade_ 0x408 ... boxW_ 0x420)
  const base = (w, o = 0) => ({ fade: i32(w + 0x3f0 + o), answered: !!u8(w + 0x3f5 + o), cx: i32(w + 0x3f8 + o),
    cy: i32(w + 0x3fc + o), boxW: i32(w + 0x408 + o), boxH: i32(w + 0x40c + o) });
  const ug = w => ({ dlg: base(w) }), ok = w => ({ dlg: base(w, 0x18) });
  // CWindowTaskImage: x_ / y_ / w_ / h_ 0x374 (w_ h_ the cell: 16 x 16 for the icons), part_ 0x384 (u v w h),
  // texture_ 0x394; value_ 0x3a8 (yo2CardListView.h: the icon subclasses). passthrough: the engine keeps drawing it
  const image = c => ({ ...generic(c), ...rectF(c, 0x374), texture: str(c + 0x394), src: rectI(c, 0x384),
    value: i32(c + 0x3a8), passthrough: true });
  return {
    windows: {
      CUSelectDialog: ug, CUSelectStandDialog: ug, CUPhaseSelectDialog: ug, CULockOnDialog: ug,
      CUGDialogBaseHP: ug, CUDiscardDialog: ug, CUDialogBaseOk: ok, CUSelectNumDialog: ok,
      // coins (SceneDialogs1.cpp ugSlot23): hover 0x450 (the lit coin), afterAnswer 0x454 (the pick blinks)
      CUSelectCoinDialog: w => ({ dlg: { ...base(w), hover: i32(w + 0x450), after: i32(w + 0x454) } }),
      // dice (SceneDialogs4.cpp): hover 0x450, picked 0x45c, need 0x460, free 0x464, chosen 0x468
      CUDiceDialog: w => ({ dlg: { ...base(w), hover: i32(w + 0x450), need: i32(w + 0x460), free: i32(w + 0x464),
        chosen: i32(w + 0x468) } }),
      // ritual stars (SceneDialogs2.cpp): level 0x450
      CURitualDialog: w => ({ dlg: { ...base(w), level: i32(w + 0x450) } }),
      // the summon / set / activate menu: count 0x498 rows, shown 0x4a8 (open() / hide()), chosen 0x4d0
      CUSummonDialogSp: w => ({ cmd: { count: i32(w + 0x498), open: !!u8(w + 0x4a8), chosen: i32(w + 0x4d0) } }),
    },
    controls: {
      CWindowTaskImage: image, CWindowTaskImageDuelCmd: image, CWindowTaskImageCardAttr: image,
      CWindowTaskImageCardType: image,
    },
  };
};
