// The pack picker's scene (CCardGetPackScene, scene 0x17, pushed over CCardPackCheckScene 0x19; src/Pack): what lies
// around CWindowPackSelect, outside any window, for screens/packselect.js to draw instead of the engine:
//  - the backdrop: CCardPackCheckScene::m_pBaseElm's CSwfEngine, named after its movie (data/card_get/cardget_bg_a01 /
//    a02 / a03.txt: in, loop, out), down to its CSpriteElm leaves (CSwfEngine > Offset > CSwfSprite > CSwfShape >
//    CSpriteElm): the strips cardget_bg_01_01..06, the band of squares cardget_bg_02_01 (four copies), the grid
//    cardget_bg_03_01 (two), each with its world place, its drawn scale (world_ _22 +0xf4: negative = flipped) and alpha
//  - the packs: CCardGetPackScene::m_pBaseElm's CSpriteElms, data/cardpack/<file> (200 x 400 at 1x, 270 apart, the
//    picked one at 412, 160) and the picked one's frame data/etc/pack_select_01_c01 (232 x 432, 16 px round it)
// Found by name under the root (g_app's CMouseManager's parent, as read.js's backdrop), only in scenes 0x17..0x19.
export const APP = 0x012711ac, SCENE_MNG = 0x01271790;
export const SCENES = [0x17, 0x18, 0x19];
export default h => {
  const { u32, i32, f32, children, cls, name, spr, vis, locked } = h;
  const leaves = (t, d, out) => {
    for (const k of children(t)) {
      if (cls(k) === 'CSpriteElm') out.push({ ...spr(k), shown: vis(k), wsy: f32(k + 0xf4) });
      else if (d < 6) leaves(k, d + 1, out);
    }
    return out;
  };
  return {
    snapshot() {
      const sm = u32(SCENE_MNG);
      if (!sm || !SCENES.includes(i32(sm + 0x7c))) return {};
      const app = u32(APP), mgr = app && u32(app + 0xc4c), root = mgr && u32(mgr + 8);
      if (!root) return {};
      const base = n => children(root).find(k => name(k) === n);
      const check = base('CCardPackCheckScene::m_pBaseElm'), get = base('CCardGetPackScene::m_pBaseElm');
      const movie = check && children(check).find(k => cls(k) === 'CSwfEngine' && /cardget_bg_a0\d\.txt$/i.test(name(k)));
      const sprites = get ? children(get).filter(k => cls(k) === 'CSpriteElm').map(k => ({ ...spr(k), shown: vis(k) })) : [];
      return { packScene: {
        backdrop: movie ? { id: movie, movie: name(movie).replace(/^.*[\\/]/, '').replace(/\.txt$/i, ''), shown: vis(movie) && !locked(movie),
          sprites: leaves(movie, 0, []) } : null,
        packs: sprites.filter(s => /^data[\\/]cardpack[\\/]/i.test(s.tex)),
        frame: sprites.find(s => /pack_select_01/i.test(s.tex)) || null,
      } };
    },
  };
};
