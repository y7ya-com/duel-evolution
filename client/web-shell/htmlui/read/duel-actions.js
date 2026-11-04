// Read the server's move permissions and the engine's settled, drawn CCards.
// yo2-decomp NetDuel.h: CApp.netDuel +c70, input +674, comid +66a4.
// SceneGameObject.cpp: scratch vector 012a9944. SceneCard.h pins CCard fields.
export function actionableCards({ u8, u32, i32, vec, scene }) {
  if (scene !== 28) return [];
  const app = u32(0x012711ac), nd = app && u32(app + 0xc70), mode = i32(0x012a9084);
  if (!nd || !(u8(nd + 0x674) & 1) || [7, 8, 10, 11].includes(mode)) return [];
  const out = [], seen = new Set();
  for (const p of vec(0x012a9944, 4)) {
    const c = u32(p);
    if (!c || seen.has(c) || u32(c) !== 0x00bebbc0 || !u8(c + 4) || i32(c + 0x14) !== 0x100) continue;
    seen.add(c);
    const code = u32(c + 0x24) & 0xffff, player = code & 1, zone = code >> 1 & 31, index = code >> 6 & 255;
    if (player || (zone === 11 ? index >= 80 : zone >= 16)) continue;
    const at = nd + 0x66a4 + (zone === 11 ? 0x20 + 2 * index : 2 * zone);
    const mask = u32(at) & 0xffff;
    if (!(mask & ~1)) continue; // bit zero only offers inspection, not a play
    const x = i32(c + 0x38), y = i32(c + 0x3c), scale = i32(c + 0x44) / 65536;
    if (x < 0 || x > 1024 || y < 0 || y > 768 || scale <= 0 || scale > 4) continue;
    out.push({ id: c, x, y, w: 50 * scale, h: 72 * scale, rotation: i32(c + 0x40) * 360 / 512, mask });
  }
  return out;
}
