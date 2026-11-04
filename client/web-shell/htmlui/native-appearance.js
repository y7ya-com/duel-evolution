// Mirror authenticated server appearance updates into the original client's caches.
// Otherwise CWorldMng can resend the old CNetAccount/playerData look on the next
// area transition, overwriting an outfit equipped through the HTML wardrobe.
// Offsets are pinned in Net/NetAccount.h, System/yo2App.h and
// ChangeAvatar/changeAvatarExt.h. No vtables or other player records are changed.
import VT from './vtables.js';
const APP = 0x012711ac, PLAYER_DATA = 0x012714c4, GAME = 0x012bb6b0;
let frameHeap = null;
// Published builds pass the current heap into onYo2Frame without exporting
// HEAPU8 on the page's Module. The bridge refreshes this after memory growth.
export function setNativeAppearanceHeap(heap) { frameHeap = heap instanceof Uint8Array ? heap : null; }
export function getNativeAppearanceHeap() { return frameHeap; }
const validLook = p => Array.isArray(p) && p.length === 16 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
  && p[0] <= 1 && p.slice(10, 13).every(n => n === 0) && p[13] <= 2 && p[14] <= 6 && p[15] <= 6;
export function applyNativeAppearance(appearance, module = globalThis.Module) {
  const heap = module?.HEAPU8 || frameHeap;
  if (!(heap instanceof Uint8Array) || !appearance || !validLook(appearance.looks?.['0']) || !validLook(appearance.looks?.['1'])) return false;
  try {
    const d = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
    const range = (p, length) => Number.isSafeInteger(p) && p >= 0x10000 && p % 4 === 0 && p + length <= heap.byteLength;
    const read = p => p >= 0 && p + 4 <= heap.byteLength ? d.getUint32(p, true) : 0;
    const app = read(APP);
    if (!range(app, 0xc6c)) return false;
    const account = read(app + 0xc68);
    if (!range(account, 0x34ec) || VT[read(account)]?.[0] !== 'CNetAccount') return false;
    const me = account + 0x121c, slot = heap[me + 0x6d0];
    if (!(slot < 4)) return false;
    const player = me + 0x30 + slot * 0x1a8;
    if (VT[read(player)]?.[0] !== 'CPlayerInfo') return false;
    const valid = heap[player + 4], name = heap.subarray(player + 0x10, player + 0x21);
    // REGPLAYERRESULT does not set PLAYERLIST's valid flag on a new character.
    // Its named active CPlayerInfo is usable before the next full login, while
    // an unnamed/reset slot must remain protected from writes.
    if (valid !== 1 && !(valid === 0 && name[0] && name.includes(0))) return false;
    // Validate every destination before writing either world, so unsupported builds
    // cannot partly update a record. The 4-byte CAvatarData vtable is left intact.
    if (!range(player + 0x138, 16) || !range(player + 0x14c, 16)) return false;
    heap.set(appearance.looks['0'], player + 0x138);
    heap.set(appearance.looks['1'], player + 0x14c);
    const game = read(GAME), gameWorld = range(game, 0x44c) ? read(game + 0x448) : appearance.world;
    const world = gameWorld === 0 || gameWorld === 1 ? gameWorld : appearance.world;
    const data = read(PLAYER_DATA), vtable = range(data, 0xd8) ? read(data) : 0;
    if ((world === 0 || world === 1) && vtable >= 0x00be5000 && vtable < 0x00c7c000 && heap[data + 0xc8] <= 1)
      heap.set(appearance.looks[String(world)], data + 0xc8);
    return true;
  } catch { return false; } // A missing/different client cache never breaks the game's Present.
}
